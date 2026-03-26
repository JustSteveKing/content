import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';
import { spinner } from '@crustjs/prompts';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

export class SyncYoutubeCommand extends BaseCommand<any, any, any> {
  public name = 'sync:youtube';
  public description = 'Sync videos from YouTube';

  public override flags = {
    'dry-run': { type: 'boolean', description: 'No files will be written.' },
    'new-only': { type: 'boolean', description: 'Only sync new videos.' },
    'fetch': { type: 'string', description: 'Limit the number of videos to fetch.' },
  } as const;

  private readonly CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? 'UCBnj7HfncAygGeyymgydZxQ';
  private readonly API_KEY = process.env.YOUTUBE_API_KEY;
  private readonly MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS ?? '500');
  private readonly VIDEOS_DIR = join(process.cwd(), 'videos');
  private readonly YT = 'https://www.googleapis.com/youtube/v3';

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    const { flags } = ctx;
    const DRY_RUN = flags['dry-run'];
    const NEW_ONLY = flags['new-only'];
    const FETCH_LIMIT = flags['fetch'] ? parseInt(flags['fetch']) : this.MAX_VIDEOS;

    if (!this.API_KEY) {
      console.error('Error: YOUTUBE_API_KEY environment variable is required.');
      process.exit(1);
    }

    if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

    const uploadsPlaylistId = await spinner('Fetching uploads playlist ID...', async (s) => {
      const id = await this.getUploadsPlaylistId();
      s.updateMessage('Uploads playlist ID fetched.');
      return id;
    });

    const videoIds = await spinner(`Fetching video IDs (max ${FETCH_LIMIT})...`, async (s) => {
      const ids = await this.getPlaylistVideoIds(uploadsPlaylistId, FETCH_LIMIT);
      s.updateMessage(`${ids.length} video IDs found.`);
      return ids;
    });

    const videos = await spinner('Fetching video details...', async (s) => {
      const details = await this.getVideoDetails(videoIds);
      s.updateMessage(`${details.length} video details fetched.`);
      return details;
    });

    const existing = await spinner('Scanning existing files...', async (s) => {
      const index = await this.buildExistingIndex();
      s.updateMessage(`${index.size} existing videos indexed.`);
      return index;
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const video of videos) {
      await spinner(`Syncing ${video.id}...`, async (s) => {
        const duration = this.parseDuration(video.contentDetails.duration);
        const views = this.formatViews(video.statistics.viewCount);
        const type = this.determineType(video);

        const existingPath = existing.get(video.id);

        if (existingPath) {
          if (NEW_ONLY) {
            s.updateMessage(`Skipped ${video.id} (exists)`);
            skipped++;
            return;
          }

          const content = await Bun.file(existingPath).text();
          const { data } = matter(content);

          const unchanged =
            data.views === views &&
            data.duration === duration &&
            data.type === type;

          if (unchanged) {
            s.updateMessage(`No changes for ${video.id}`);
            skipped++;
            return;
          }

          let patched = content
            .replace(/^views: ".*"$/m, `views: "${views}"`)
            .replace(/^duration: ".*"$/m, `duration: "${duration}"`)
            .replace(/^type: ".*"$/m, `type: "${type}"`);

          patched = patched.replace(/(views=")[^"]*(")/g, `$1${views}$2`);
          patched = patched.replace(/(duration=")[^"]*(")/g, `$1${duration}$2`);

          if (!DRY_RUN) await Bun.write(existingPath, patched);
          s.updateMessage(`Updated: ${existingPath.split('/').pop()}`);
          updated++;
        } else {
          const slug = this.slugify(video.snippet.title);
          const filename = slug ? `${slug}.mdx` : `${video.id}.mdx`;
          const filepath = join(this.VIDEOS_DIR, filename);

          if (!DRY_RUN) await Bun.write(filepath, this.buildMdx(video));
          s.updateMessage(`Created: ${filename}`);
          created++;
        }
      });
    }

    const dryTag = DRY_RUN ? ' (dry run)' : '';
    console.log(`\nDone${dryTag}. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  }

  private async ytFetch(endpoint: string, params: Record<string, string>): Promise<any> {
    const url = new URL(`${this.YT}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', this.API_KEY!);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API ${endpoint} ${res.status}: ${body}`);
    }
    return res.json();
  }

  private async getUploadsPlaylistId(): Promise<string> {
    const data = await this.ytFetch('channels', { part: 'contentDetails', id: this.CHANNEL_ID });
    const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!id) throw new Error('Could not find uploads playlist for channel: ' + this.CHANNEL_ID);
    return id;
  }

  private async getPlaylistVideoIds(playlistId: string, limit: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const params: Record<string, string> = {
        part: 'contentDetails',
        playlistId,
        maxResults: '50',
      };
      if (pageToken) params.pageToken = pageToken;

      const data = await this.ytFetch('playlistItems', params);
      for (const item of data.items ?? []) {
        const videoId = item.contentDetails?.videoId;
        if (videoId) ids.push(videoId);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < limit);

    return ids.slice(0, limit);
  }

  private async getVideoDetails(videoIds: string[]): Promise<any[]> {
    const videos: any[] = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const data = await this.ytFetch('videos', {
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
      });
      videos.push(...(data.items ?? []));
    }

    return videos;
  }

  private parseDuration(iso: string): string {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '0:00';
    const h = parseInt(m[1] ?? '0');
    const min = parseInt(m[2] ?? '0');
    const sec = parseInt(m[3] ?? '0');
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  private formatViews(raw: string | undefined): string {
    const n = parseInt(raw ?? '0');
    if (isNaN(n)) return '0';
    if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
    if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
    return String(n);
  }

  private determineType(video: any): 'video' | 'shorts' | 'livestream' {
    if (video.snippet.liveBroadcastContent === 'live') return 'livestream';

    const title = video.snippet.title.toLowerCase();
    if (title.includes('live') || title.includes('stream')) return 'livestream';

    const m = video.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (m) {
      const totalSec =
        parseInt(m[1] ?? '0') * 3600 +
        parseInt(m[2] ?? '0') * 60 +
        parseInt(m[3] ?? '0');
      if (totalSec <= 60) return 'shorts';
    }

    return 'video';
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private extractTags(title: string, description: string, ytTags: string[] = []): string[] {
    const map: Record<string, string> = {
      laravel: 'Laravel',
      php: 'PHP',
      golang: 'Go',
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      api: 'API',
      database: 'Database',
      eloquent: 'Eloquent',
      testing: 'Testing',
      tutorial: 'Tutorial',
      package: 'Package Development',
      live: 'Live Coding',
    };

    const text = `${title} ${description}`.toLowerCase();
    const tags = new Set<string>();

    for (const [kw, label] of Object.entries(map)) {
      if (text.includes(kw)) tags.add(label);
    }

    for (const t of ytTags.slice(0, 5)) {
      if (tags.size < 10) tags.add(t);
    }

    return [...tags].slice(0, 10);
  }

  private extractCategories(title: string, description: string): string[] {
    const cats = new Set<string>();
    const text = `${title} ${description}`.toLowerCase();

    if (text.includes('laravel')) cats.add('Laravel');
    if (text.includes('php')) cats.add('PHP');
    if (text.includes('golang')) cats.add('Go');
    if (text.includes('typescript')) cats.add('TypeScript');
    if (text.includes('javascript') || / js /.test(text)) cats.add('JavaScript');
    if (text.includes('api')) cats.add('API Development');
    if (text.includes('testing')) cats.add('Testing');
    if (text.includes('architecture')) cats.add('Software Architecture');
    if (text.includes('devops') || text.includes('deployment')) cats.add('DevOps');
    if (text.includes('live') || text.includes('stream')) cats.add('Live Coding');

    return [...cats];
  }

  private yamlEscape(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .trim();
  }

  private mdxEscape(s: string): string {
    return s
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}');
  }

  private buildMdx(video: any): string {
    const { snippet, statistics, contentDetails } = video;

    const cleanTitle = snippet.title
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    const desc = snippet.description ?? '';
    const shortDesc = (desc.split('\n')[0] ?? '').substring(0, 200).trim();
    const bodyDesc = desc.split('\n\n')[0] || 'No description available.';

    const duration = this.parseDuration(contentDetails.duration);
    const views = this.formatViews(statistics.viewCount);
    const type = this.determineType(video);
    const tags = this.extractTags(snippet.title, snippet.description, snippet.tags);
    const categories = this.extractCategories(snippet.title, snippet.description);

    const publishedDate = snippet.publishedAt.split('T')[0];
    const publishedFormatted = new Date(snippet.publishedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const thumbnail =
      snippet.thumbnails.maxres?.url ??
      snippet.thumbnails.high?.url ??
      `https://img.youtube.com/vi/${video.id}/maxresdefault.jpg`;

    const tagYaml = tags.map(t => `"${this.yamlEscape(t)}"`).join(', ');
    const catYaml = categories.map(c => `"${this.yamlEscape(c)}"`).join(', ');

    return `---
title: "${this.yamlEscape(cleanTitle)}"
description: "${this.yamlEscape(shortDesc)}"
videoId: "${video.id}"
publishedDate: ${publishedDate}
duration: "${duration}"
views: "${views}"
thumbnail: "${thumbnail}"
tags: [${tagYaml}]
categories: [${catYaml}]
type: "${type}"
featured: false
transcript: false
---



# ${cleanTitle}

${this.mdxEscape(bodyDesc)}

<VideoStats
  publishedDate="${publishedFormatted}"
  duration="${duration}"
  views="${views}"
  type="${type}"
/>

## Watch on YouTube

[Watch this video on YouTube](https://www.youtube.com/watch?v=${video.id})

---

*This content was automatically synced from my YouTube channel. If you found this helpful, consider [subscribing](https://youtube.com/@juststeveking) for more content!*
`;
  }

  private async buildExistingIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const glob = new Glob('*.{md,mdx}');

    for await (const file of glob.scan(this.VIDEOS_DIR)) {
      const filepath = join(this.VIDEOS_DIR, file);
      try {
        const content = await Bun.file(filepath).text();
        const { data } = matter(content);
        if (typeof data.videoId === 'string') {
          index.set(data.videoId, filepath);
        }
      } catch {
        // skip files that fail to parse
      }
    }

    return index;
  }
}

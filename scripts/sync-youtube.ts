#!/usr/bin/env bun

/**
 * YouTube Channel Sync
 *
 * Fetches all videos from the channel's uploads playlist and creates/updates
 * markdown files in videos/.
 *
 * Uses the playlistItems API (1 quota unit/page) instead of the search API
 * (100 quota units/page) — roughly 100x cheaper per video fetched.
 *
 * Existing files are matched by videoId, not filename, so renames don't
 * cause duplicates.
 *
 * Required env vars:
 *   YOUTUBE_API_KEY     - YouTube Data API v3 key
 *
 * Optional env vars:
 *   YOUTUBE_CHANNEL_ID  - Channel ID (defaults to juststeveking's channel)
 *   MAX_VIDEOS          - Cap on videos to sync (default: 500)
 */

import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? 'UCBnj7HfncAygGeyymgydZxQ';
const API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_VIDEOS = parseInt(process.env.MAX_VIDEOS ?? '500');
const VIDEOS_DIR = join(import.meta.dir, '..', 'videos');
const YT = 'https://www.googleapis.com/youtube/v3';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NEW_ONLY = args.includes('--new-only');

const fetchArg = args.find(a => a.startsWith('--fetch='));
const FETCH_LIMIT = fetchArg ? parseInt(fetchArg.slice('--fetch='.length)) : MAX_VIDEOS;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
YouTube Channel Sync

Usage: bun scripts/sync-youtube.ts [options]

Options:
  --fetch=<n>  Override the number of videos to sync (e.g. --fetch=100)
  --dry-run    Preview changes without writing any files
  --new-only   Only create new files, skip updating existing ones
  --help, -h   Show this help message

Environment variables:
  YOUTUBE_API_KEY     (required) YouTube Data API v3 key
  YOUTUBE_CHANNEL_ID  (optional) Channel ID — defaults to juststeveking's channel
  MAX_VIDEOS          (optional) Max videos to sync (default: 500)

Quota cost (per 10,000 unit/day free tier):
  1 unit  — channels request (one-off)
  1 unit  — per page of 50 videos from playlistItems
  ~3 units — per video details batch
  Total: roughly 4 units/video, or ~2,500 videos within the free quota
`);
  process.exit(0);
}

if (!API_KEY) {
  console.error('Error: YOUTUBE_API_KEY environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoSnippet {
  title: string;
  description: string;
  publishedAt: string;
  liveBroadcastContent: string;
  thumbnails: {
    maxres?: { url: string };
    high?: { url: string };
    medium?: { url: string };
  };
  tags?: string[];
}

interface VideoStatistics {
  viewCount?: string;
}

interface VideoContentDetails {
  duration: string; // ISO 8601, e.g. "PT1H2M3S"
}

interface Video {
  id: string;
  snippet: VideoSnippet;
  statistics: VideoStatistics;
  contentDetails: VideoContentDetails;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function ytFetch(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${YT}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', API_KEY!);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${endpoint} ${res.status}: ${body}`);
  }
  return res.json();
}

async function getUploadsPlaylistId(): Promise<string> {
  const data = await ytFetch('channels', { part: 'contentDetails', id: CHANNEL_ID });
  const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error('Could not find uploads playlist for channel: ' + CHANNEL_ID);
  return id;
}

async function getPlaylistVideoIds(playlistId: string, limit: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      part: 'contentDetails',
      playlistId,
      maxResults: '50',
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await ytFetch('playlistItems', params);
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) ids.push(videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < limit);

  return ids.slice(0, limit);
}

async function getVideoDetails(videoIds: string[]): Promise<Video[]> {
  const videos: Video[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const data = await ytFetch('videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
    });
    videos.push(...(data.items ?? []));
  }

  return videos;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '0:00';
  const h = parseInt(m[1] ?? '0');
  const min = parseInt(m[2] ?? '0');
  const sec = parseInt(m[3] ?? '0');
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatViews(raw: string | undefined): string {
  const n = parseInt(raw ?? '0');
  if (isNaN(n)) return '0';
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return String(n);
}

function determineType(video: Video): 'video' | 'shorts' | 'livestream' {
  // YouTube marks past livestreams; the liveBroadcastContent field is 'none'
  // for archived streams, but the title heuristic is still useful.
  if (video.snippet.liveBroadcastContent === 'live') return 'livestream';

  const title = video.snippet.title.toLowerCase();
  if (title.includes('live') || title.includes('stream')) return 'livestream';

  // Shorts are <= 60 seconds
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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractTags(title: string, description: string, ytTags: string[] = []): string[] {
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

  // Fold in YouTube's own tags up to a point
  for (const t of ytTags.slice(0, 5)) {
    if (tags.size < 10) tags.add(t);
  }

  return [...tags].slice(0, 10);
}

function extractCategories(title: string, description: string): string[] {
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

// ---------------------------------------------------------------------------
// YAML / MDX helpers
// ---------------------------------------------------------------------------

/** Escape a string for use inside YAML double-quoted scalars. */
function yamlEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

/** Escape characters that MDX/JSX would interpret. */
function mdxEscape(s: string): string {
  return s
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

function buildMdx(video: Video): string {
  const { snippet, statistics, contentDetails } = video;

  const cleanTitle = snippet.title
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const desc = snippet.description ?? '';
  const shortDesc = (desc.split('\n')[0] ?? '').substring(0, 200).trim();
  const bodyDesc = desc.split('\n\n')[0] || 'No description available.';

  const duration = parseDuration(contentDetails.duration);
  const views = formatViews(statistics.viewCount);
  const type = determineType(video);
  const tags = extractTags(snippet.title, snippet.description, snippet.tags);
  const categories = extractCategories(snippet.title, snippet.description);

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

  const tagYaml = tags.map(t => `"${yamlEscape(t)}"`).join(', ');
  const catYaml = categories.map(c => `"${yamlEscape(c)}"`).join(', ');

  return `---
title: "${yamlEscape(cleanTitle)}"
description: "${yamlEscape(shortDesc)}"
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

${mdxEscape(bodyDesc)}

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

// ---------------------------------------------------------------------------
// Index existing files by videoId
// ---------------------------------------------------------------------------

async function buildExistingIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const glob = new Glob('*.{md,mdx}');

  for await (const file of glob.scan(VIDEOS_DIR)) {
    const filepath = join(VIDEOS_DIR, file);
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function sync() {
  if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

  process.stdout.write('Fetching uploads playlist ID... ');
  const uploadsPlaylistId = await getUploadsPlaylistId();
  console.log('done');

  process.stdout.write(`Fetching video IDs (max ${FETCH_LIMIT})... `);
  const videoIds = await getPlaylistVideoIds(uploadsPlaylistId, FETCH_LIMIT);
  console.log(`${videoIds.length} found`);

  process.stdout.write('Fetching video details... ');
  const videos = await getVideoDetails(videoIds);
  console.log(`${videos.length} fetched`);

  process.stdout.write('Scanning existing files... ');
  const existing = await buildExistingIndex();
  console.log(`${existing.size} indexed\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const video of videos) {
    const duration = parseDuration(video.contentDetails.duration);
    const views = formatViews(video.statistics.viewCount);
    const type = determineType(video);

    const existingPath = existing.get(video.id);

    if (existingPath) {
      if (NEW_ONLY) {
        skipped++;
        continue;
      }

      const content = await Bun.file(existingPath).text();
      const { data } = matter(content);

      const unchanged =
        data.views === views &&
        data.duration === duration &&
        data.type === type;

      if (unchanged) {
        skipped++;
        continue;
      }

      // Patch frontmatter fields in-place so any manual edits to the body are preserved
      let patched = content
        .replace(/^views: ".*"$/m, `views: "${views}"`)
        .replace(/^duration: ".*"$/m, `duration: "${duration}"`)
        .replace(/^type: ".*"$/m, `type: "${type}"`);

      // Also keep the VideoStats component args in sync
      patched = patched.replace(/(views=")[^"]*(")/g, `$1${views}$2`);
      patched = patched.replace(/(duration=")[^"]*(")/g, `$1${duration}$2`);

      if (!DRY_RUN) await Bun.write(existingPath, patched);
      console.log(`Updated: ${existingPath.split('/').pop()}`);
      updated++;
    } else {
      const slug = slugify(video.snippet.title);
      // Fall back to videoId if slug is empty (e.g. non-latin title)
      const filename = slug ? `${slug}.mdx` : `${video.id}.mdx`;
      const filepath = join(VIDEOS_DIR, filename);

      if (!DRY_RUN) await Bun.write(filepath, buildMdx(video));
      console.log(`Created: ${filename}`);
      created++;
    }
  }

  const dryTag = DRY_RUN ? ' (dry run)' : '';
  console.log(`\nDone${dryTag}. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

sync().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});

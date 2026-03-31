import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';
import { spinner } from '@crustjs/prompts';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

export class CrossPostDevtoCommand extends BaseCommand<any, any, any> {
  public name = 'cross-post:devto';
  public description = 'Cross-post articles to dev.to';

  public override flags = {
    'dry-run': { type: 'boolean', description: 'No API calls will be made.' },
  } as const;

  private readonly API_KEY = process.env.DEVTO_API_KEY;
  private readonly ARTICLES_DIR = join(process.cwd(), 'articles');

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    const { flags } = ctx;
    const DRY_RUN = flags['dry-run'];

    if (!this.API_KEY && !DRY_RUN) {
      console.error('Error: DEVTO_API_KEY environment variable is required.');
      process.exit(1);
    }

    if (DRY_RUN) console.log('[dry-run] No API calls will be made.\n');

    const articles = await this.getArticlesToCrossPost();

    if (articles.length === 0) {
      console.log('No articles found with shouldCrossPost: true.');
      return;
    }

    console.log(`Found ${articles.length} article(s) to cross-post.\n`);

    for (const article of articles) {
      await spinner(`Cross-posting ${article.title}...`, async (s) => {
        if (DRY_RUN) {
          s.updateMessage(`[dry-run] Would cross-post ${article.title}`);
          return;
        }

        try {
          const res = await this.postToDevto(article);
          const devToUrl = res.url;

          // Update the file: remove shouldCrossPost, add devTo
          let content = await Bun.file(article.path).text();
          
          // Use regex to update frontmatter carefully
          // We look for shouldCrossPost: true and replace it with devTo: "url"
          // We also try to maintain some formatting
          content = content
            .replace(/^shouldCrossPost:\s*true\s*$/m, `devTo: "${devToUrl}"`)
            .replace(/^shouldCrossPost:\s*"true"\s*$/m, `devTo: "${devToUrl}"`);

          await Bun.write(article.path, content);
          s.updateMessage(`Successfully cross-posted to ${devToUrl}`);
        } catch (e: any) {
          s.updateMessage(`❌ Error: ${e.message}`);
          console.error(e);
        }
      });
    }

    console.log('\nDone.');
  }

  private async getArticlesToCrossPost() {
    const glob = new Glob('*.mdx');
    const articles = [];

    for await (const file of glob.scan(this.ARTICLES_DIR)) {
      const path = join(this.ARTICLES_DIR, file);
      const content = await Bun.file(path).text();
      const { data, content: body } = matter(content);

      if (data.shouldCrossPost === true && !data.devTo) {
        articles.push({
          path,
          slug: file.replace(/\.mdx$/, ''),
          title: data.title,
          description: data.description,
          body,
          tags: data.tags ?? [],
          canonical: data.canonical ?? `https://www.juststeveking.com/articles/${file.replace(/\.mdx$/, '')}`,
          series: data.series,
        });
      }
    }

    return articles;
  }

  private async postToDevto(article: any) {
    // Clean up body for dev.to
    // 1. Remove the first H1 if it matches the title or is just an H1
    const lines = article.body.trim().split('\n');
    if (lines[0].startsWith('# ')) {
      lines.shift();
    }
    const body = lines.join('\n').trim();

    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.API_KEY!,
      },
      body: JSON.stringify({
        article: {
          title: article.title,
          published: true,
          body_markdown: body,
          tags: article.tags.slice(0, 4).map((t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')),
          canonical_url: article.canonical,
          description: article.description,
          series: article.series,
        },
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`dev.to API ${res.status}: ${bodyText}`);
    }

    return res.json();
  }
}

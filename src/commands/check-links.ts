import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { Glob } from 'bun';
import matter from 'gray-matter';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

export class CheckLinksCommand extends BaseCommand {
  public name = 'check:links';
  public description = 'Check for broken links in content';

  public override flags = {
    'external': { type: 'boolean', description: 'Also check external links (slow)' },
  } as const;

  private readonly CONTENT_DIRS = [
    'articles',
    'api-guides',
    'packages',
    'series',
  ];

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    const { flags } = ctx;
    const checkExternal = flags['external'];

    let totalFiles = 0;
    let totalLinks = 0;
    let brokenLinks = 0;

    console.log(`🔍 Checking links in ${this.CONTENT_DIRS.join(', ')}...`);
    if (checkExternal) console.log('🌐 Including external links (this will be slower)\n');

    for (const dir of this.CONTENT_DIRS) {
      const dirPath = join(process.cwd(), dir);
      if (!existsSync(dirPath)) continue;

      const glob = new Glob(`${dir}/*.{md,mdx}`);
      const files = Array.from(glob.scanSync());

      for (const file of files) {
        totalFiles++;
        console.log(`📄 Checking ${file}...`);
        const { count, broken } = await this.checkLinksInFile(file, checkExternal);
        totalLinks += count;
        brokenLinks += broken;
      }
    }

    console.log(`\n✨ Finished checking ${totalFiles} files.`);
    console.log(`🔗 Total links found: ${totalLinks}`);
    
    if (brokenLinks > 0) {
      console.log(`🚨 Found ${brokenLinks} broken links!`);
      process.exit(1);
    } else {
      console.log('✅ No broken links found!');
    }
  }

  private async checkLinksInFile(file: string, checkExternal: boolean): Promise<{ count: number, broken: number }> {
    const content = readFileSync(join(process.cwd(), file), 'utf8');
    const { content: body } = matter(content);

    // Basic markdown link regex: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let count = 0;
    let broken = 0;

    while ((match = linkRegex.exec(body)) !== null) {
      count++;
      const url = match[2];

      if (url.startsWith('http')) {
        if (checkExternal) {
          try {
            const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            if (!res.ok) {
              console.error(`   ❌ Broken external link: ${url} (${res.status})`);
              broken++;
            }
          } catch (e: any) {
            console.error(`   ❌ Failed to reach external link: ${url} (${e.message})`);
            broken++;
          }
        }
      } else if (url.startsWith('/')) {
        // Internal link check (assuming standard patterns)
        // This is a simplified check
        const slug = url.split('/').pop()?.split('#')[0];
        if (slug) {
          const exists = this.findSlugInContent(slug);
          if (!exists) {
            console.error(`   ❌ Broken internal link: ${url}`);
            broken++;
          }
        }
      } else if (url.startsWith('#') || url.startsWith('mailto:')) {
        // Skip anchors and mailto for now
      } else if (!url.includes(':')) {
        // Relative link check
        const dir = file.split('/')[0];
        const targetPath = join(process.cwd(), dir, url.split('#')[0]);
        if (!existsSync(targetPath)) {
          console.error(`   ❌ Broken relative link: ${url}`);
          broken++;
        }
      }
    }

    return { count, broken };
  }

  private findSlugInContent(slug: string): boolean {
    // Check in all content directories for a file with this slug
    for (const dir of this.CONTENT_DIRS) {
      const extensions = ['mdx', 'md'];
      for (const ext of extensions) {
        if (existsSync(join(process.cwd(), dir, `${slug}.${ext}`))) {
          return true;
        }
      }
    }
    return false;
  }
}

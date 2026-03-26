import { join, relative } from 'path';
import { readFileSync, existsSync } from 'fs';
import { Glob } from 'bun';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';
import { spinner } from '@crustjs/prompts';

export class CheckLinksCommand extends BaseCommand {
  public name = 'check:links';
  public description = 'Check for broken internal and external links';

  public override flags = {
    'external': { type: 'boolean', description: 'Check external links (slow)' },
  } as const;

  private readonly DIRS = [
    'api-guides',
    'articles',
    'testimonials',
    'videos',
    'contributions',
    'packages',
    'talks',
    'podcasts',
  ];

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    const checkExternal = ctx.flags.external;
    const allFiles: string[] = [];

    await spinner({
      message: 'Scanning for files...',
      task: async () => {
        for (const dir of this.DIRS) {
          const dirPath = join(process.cwd(), dir);
          if (!existsSync(dirPath)) continue;
          const glob = new Glob(`${dir}/*.{md,mdx}`);
          for await (const file of glob.scan()) {
            allFiles.push(file);
          }
        }
      },
    });

    console.log(`🔍 Checking links in ${allFiles.length} files...\n`);

    let brokenInternal = 0;
    let brokenExternal = 0;
    let totalChecked = 0;

    for (const file of allFiles) {
      const content = readFileSync(join(process.cwd(), file), 'utf8');
      
      // Basic regex for markdown links [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;

      while ((match = linkRegex.exec(content)) !== null) {
        totalChecked++;
        const url = match[2];

        if (url.startsWith('http')) {
          if (checkExternal) {
            await spinner({
              message: `Checking external link in ${file}: ${url}`,
              task: async (s) => {
                try {
                  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                  if (!res.ok) {
                    brokenExternal++;
                    console.error(`❌ Broken External: ${file} -> ${url} (${res.status})`);
                  }
                } catch (e: any) {
                  brokenExternal++;
                  console.error(`❌ External Error: ${file} -> ${url} (${e.message})`);
                }
              }
            });
          }
        } else if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
          // Internal link
          // Simple heuristic: if it doesn't have an extension, it's likely a route.
          // In this repo, content files are usually at the root of their type dir.
          let targetPath = url;
          if (url.startsWith('/')) {
            targetPath = join(process.cwd(), url.slice(1));
          } else {
            targetPath = join(process.cwd(), file, '..', url);
          }

          // Check if file exists (with common extensions if not provided)
          const extensions = ['', '.md', '.mdx', '.json'];
          let found = false;
          for (const ext of extensions) {
            if (existsSync(targetPath + ext)) {
              found = true;
              break;
            }
          }

          if (!found) {
            brokenInternal++;
            console.error(`❌ Broken Internal: ${file} -> ${url}`);
          }
        }
      }
    }

    console.log(`\n✨ Finished checking ${totalChecked} links.`);
    console.log(`- Broken Internal: ${brokenInternal}`);
    if (checkExternal) {
      console.log(`- Broken External: ${brokenExternal}`);
    } else {
      console.log('- External links skipped (use --external to check)');
    }

    if (brokenInternal > 0 || brokenExternal > 0) {
      process.exit(1);
    }
  }
}

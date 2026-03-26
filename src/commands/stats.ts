import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { Glob } from "bun";
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

export class StatsCommand extends BaseCommand {
  public name = 'stats';
  public description = 'Show content statistics';

  public async handle(_ctx: CrustCommandContext) {
    const dirs = [
      'api-guides',
      'articles',
      'testimonials',
      'videos',
      'contributions',
      'packages',
      'talks',
      'podcasts',
    ];

    let totalFiles = 0;
    let totalWords = 0;
    const stats: Record<string, { count: number; words: number }> = {};

    console.log('📊 Content Statistics...\n');

    for (const dir of dirs) {
      if (!existsSync(join(process.cwd(), dir))) continue;

      const glob = new Glob(`${dir}/*.{md,mdx}`);
      const files = Array.from(glob.scanSync());

      stats[dir] = { count: 0, words: 0 };

      for (const file of files) {
        totalFiles++;
        const content = readFileSync(join(process.cwd(), file), 'utf8');
        const { content: body } = matter(content);
        
        const words = body.split(/\s+/).filter(Boolean).length;
        
        totalWords += words;
        stats[dir].count++;
        stats[dir].words += words;
      }
    }

    console.log('--------------------------------------------------');
    console.log('| Directory      | Files | Words    | Avg/File |');
    console.log('--------------------------------------------------');

    for (const [dir, data] of Object.entries(stats)) {
      const avg = data.count > 0 ? Math.round(data.words / data.count) : 0;
      console.log(`| ${dir.padEnd(14)} | ${data.count.toString().padStart(5)} | ${data.words.toString().padStart(8)} | ${avg.toString().padStart(8)} |`);
    }

    console.log('--------------------------------------------------');
    console.log(`Total Files: ${totalFiles}`);
    console.log(`Total Words: ${totalWords}`);
  }
}

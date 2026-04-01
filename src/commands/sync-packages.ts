import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export class SyncPackagesCommand extends BaseCommand<any, any, any> {
  public name = 'sync:packages';
  public description = 'Sync packages from Packagist';

  public override flags = {
    'dry-run': { type: 'boolean', description: 'No files will be written.' },
    'new-only': { type: 'boolean', description: 'Only sync new packages.' },
  } as const;

  private readonly VENDOR = process.env.PACKAGIST_VENDOR ?? 'juststeveking';
  private readonly PACKAGES_DIR = join(process.cwd(), 'packages');
  private readonly PACKAGIST_API = 'https://packagist.org';
  private readonly GITHUB_API = 'https://api.github.com';

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    const { flags } = ctx;
    const DRY_RUN = flags['dry-run'];
    const NEW_ONLY = flags['new-only'];

    if (!GITHUB_TOKEN) {
      console.error('Error: GITHUB_TOKEN environment variable is required.');
      process.exit(1);
    }

    if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

    console.log(`📦 Fetching packages for vendor ${this.VENDOR}...`);
    const packageNames = await this.getVendorPackages(this.VENDOR);
    console.log(`✅ ${packageNames.length} packages found.\n`);

    console.log('🔍 Scanning existing files...');
    const existing = await this.buildExistingIndex();
    console.log(`✅ ${existing.size} existing packages indexed.\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const name of packageNames) {
      console.log(`🚀 Syncing ${name}...`);
      try {
        const pkg = await this.getPackageDetails(name);
        const existingPath = existing.get(name);

        if (existingPath && NEW_ONLY) {
          console.log(`   ⏭️  Skipped ${name} (exists)`);
          skipped++;
          continue;
        }

        const readme = await this.getGitHubReadme(pkg.repository);

        if (existingPath) {
          const content = await Bun.file(existingPath).text();
          const { data } = matter(content);

          const latestVersion = this.getLatestVersion(pkg.versions);
          
          const unchanged =
            data.downloads === pkg.downloads.total &&
            data.monthlyDownloads === pkg.downloads.monthly &&
            data.stars === pkg.github_stars &&
            data.version === latestVersion;

          if (unchanged) {
            console.log(`   ⏭️  No changes for ${name}`);
            skipped++;
            continue;
          }

          const newContent = this.buildMarkdown(pkg, readme);
          if (!DRY_RUN) await Bun.write(existingPath, newContent);
          console.log(`   ✅ Updated ${name}`);
          updated++;
        } else {
          const slug = this.slugify(name);
          const filename = `${slug}.md`;
          const filepath = join(this.PACKAGES_DIR, filename);

          if (!DRY_RUN) await Bun.write(filepath, this.buildMarkdown(pkg, readme));
          console.log(`   ✅ Created ${name}`);
          created++;
        }
      } catch (err: any) {
        console.error(`   ❌ Failed to sync ${name}: ${err.message}`);
      }
    }

    const dryTag = DRY_RUN ? ' (dry run)' : '';
    console.log(`\nDone${dryTag}. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  }

  private async getVendorPackages(vendor: string): Promise<string[]> {
    const res = await fetch(`${this.PACKAGIST_API}/packages/list.json?vendor=${vendor}`);
    if (!res.ok) throw new Error(`Packagist API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.packageNames;
  }

  private async getPackageDetails(name: string): Promise<any> {
    const res = await fetch(`${this.PACKAGIST_API}/packages/${name}.json`);
    if (!res.ok) throw new Error(`Packagist API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.package;
  }

  private async getGitHubReadme(repoUrl: string): Promise<string> {
    const repo = repoUrl.replace('https://github.com/', '').replace('.git', '');
    const res = await fetch(`${this.GITHUB_API}/repos/${repo}/readme`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw',
      },
    });
    if (!res.ok) return '';
    return await res.text();
  }

  private getLatestVersion(versions: Record<string, any>): string {
    const sorted = Object.keys(versions).sort((a, b) => {
      if (a === 'dev-master') return 1;
      if (b === 'dev-master') return -1;
      return b.localeCompare(a);
    });
    return sorted[0] || 'unknown';
  }

  private async buildExistingIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const glob = new Glob('*.md');

    for await (const file of glob.scan(this.PACKAGES_DIR)) {
      const filepath = join(this.PACKAGES_DIR, file);
      try {
        const content = await Bun.file(filepath).text();
        const { data } = matter(content);
        if (typeof data.name === 'string') {
          index.set(data.name, filepath);
        }
      } catch {
        // skip files that fail to parse
      }
    }

    return index;
  }

  private slugify(name: string): string {
    return name.split('/')[1] || name;
  }

  private buildMarkdown(pkg: any, readme: string): string {
    const latestVersion = this.getLatestVersion(pkg.versions);
    const ver = pkg.versions[latestVersion] || {};
    
    const tech = new Set<string>();
    if (ver.require) {
      if (ver.require.php) tech.add('PHP');
      if (ver.require['illuminate/support']) tech.add('Laravel');
    }

    const techYaml = [...tech].map(t => `"${t}"`).join(', ');

    return `---
name: "${pkg.name}"
description: "${pkg.description.replace(/"/g, '\\"')}"
packagist: "https://packagist.org/packages/${pkg.name}"
github: "${pkg.repository}"
link: "${pkg.repository}"
tech: [${techYaml}]
featured: false
downloads: ${pkg.downloads.total}
monthlyDownloads: ${pkg.downloads.monthly}
stars: ${pkg.github_stars}
version: "${latestVersion}"
updatedAt: "${new Date().toISOString().split('T')[0]}"
---

${readme}
`;
  }
}

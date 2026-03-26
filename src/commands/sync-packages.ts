import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';
import { spinner } from '@crustjs/prompts';
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

    const packageNames = await spinner(`Fetching packages for vendor ${this.VENDOR}...`, async (s) => {
      const packages = await this.getVendorPackages(this.VENDOR);
      s.updateMessage(`${packages.length} packages found for vendor ${this.VENDOR}.`);
      return packages;
    });

    const existing = await spinner('Scanning existing files...', async (s) => {
      const index = await this.buildExistingIndex();
      s.updateMessage(`${index.size} existing packages indexed.`);
      return index;
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const name of packageNames) {
      await spinner(`Syncing ${name}...`, async (s) => {
        try {
          const pkg = await this.getPackageDetails(name);
          const existingPath = existing.get(name);

          if (existingPath && NEW_ONLY) {
            s.updateMessage(`Skipped ${name} (exists)`);
            skipped++;
            return;
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
              s.updateMessage(`No changes for ${name}`);
              skipped++;
              return;
            }

            const newContent = this.buildMarkdown(pkg, readme);
            if (!DRY_RUN) await Bun.write(existingPath, newContent);
            s.updateMessage(`Updated ${name}`);
            updated++;
          } else {
            const slug = this.slugify(name);
            const filename = `${slug}.md`;
            const filepath = join(this.PACKAGES_DIR, filename);

            if (!DRY_RUN) await Bun.write(filepath, this.buildMarkdown(pkg, readme));
            s.updateMessage(`Created ${name}`);
            created++;
          }
        } catch (err: any) {
          s.updateMessage(`Failed to sync ${name}: ${err.message}`);
        }
      });
    }

    const dryTag = DRY_RUN ? ' (dry run)' : '';
    console.log(`\nDone${dryTag}. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  }

  private async packagistFetch(endpoint: string): Promise<any> {
    const res = await fetch(`${this.PACKAGIST_API}/${endpoint}`);
    if (!res.ok) {
      throw new Error(`Packagist API ${endpoint} ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  private async githubFetch(endpoint: string): Promise<any> {
    const res = await fetch(`${this.GITHUB_API}/${endpoint}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'juststeveking-sync-script',
      },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub API ${endpoint} ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  private async getVendorPackages(vendor: string): Promise<string[]> {
    const data = await this.packagistFetch(`packages/list.json?vendor=${vendor}`);
    return data.packageNames ?? [];
  }

  private async getPackageDetails(packageName: string): Promise<any> {
    const data = await this.packagistFetch(`packages/${packageName}.json`);
    return data.package;
  }

  private getLatestVersion(versions: Record<string, any>): string {
    const versionKeys = Object.keys(versions);
    const stable = versionKeys
      .filter(v => !v.startsWith('dev-') && !v.includes('-dev'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

    return stable[0] ?? versionKeys[0] ?? 'unknown';
  }

  private async getGitHubReadme(repoUrl: string): Promise<string | null> {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!match) return null;
    const [_, owner, repo] = match;
    
    const data = await this.githubFetch(`repos/${owner}/${repo}/readme`);
    if (!data || !data.download_url) return null;

    const res = await fetch(data.download_url);
    if (!res.ok) return null;
    return res.text();
  }

  private yamlEscape(s: string): string {
    return (s ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .trim();
  }

  private slugify(name: string): string {
    return name
      .split('/')
      .pop()!
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildMarkdown(pkg: any, readme: string | null): string {
    const latestVersion = this.getLatestVersion(pkg.versions);
    const updatedAt = new Date().toISOString().split('T')[0];

    const frontmatter = {
      name: pkg.name,
      description: pkg.description,
      packagist: `https://packagist.org/packages/${pkg.name}`,
      github: pkg.repository.replace('.git', ''),
      downloads: pkg.downloads.total,
      monthlyDownloads: pkg.downloads.monthly,
      stars: pkg.github_stars,
      version: latestVersion,
      updatedAt: updatedAt,
    };

    const yaml = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${this.yamlEscape(v)}"`;
        return `${k}: ${v}`;
      })
      .join('\n');

    return `---
${yaml}
---

${readme ?? pkg.description}
`;
  }

  private async buildExistingIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    const glob = new Glob('*.{md,mdx}');

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
}

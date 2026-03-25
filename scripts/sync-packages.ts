#!/usr/bin/env bun

/**
 * Packagist Sync
 *
 * Fetches all packages for a vendor from Packagist and updates/creates
 * markdown files in packages/.
 *
 * Required env vars:
 *   GITHUB_TOKEN      - GitHub personal access token
 *
 * Optional env vars:
 *   PACKAGIST_VENDOR  - Packagist vendor name (default: juststeveking)
 */

import { join } from 'path';
import { Glob } from 'bun';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VENDOR = process.env.PACKAGIST_VENDOR ?? 'juststeveking';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PACKAGES_DIR = join(import.meta.dir, '..', 'packages');
const PACKAGIST_API = 'https://packagist.org';
const GITHUB_API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NEW_ONLY = args.includes('--new-only');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Packagist Sync

Usage: bun scripts/sync-packages.ts [options]

Options:
  --dry-run    Preview changes without writing any files
  --new-only   Only create new files, skip updating existing ones
  --help, -h   Show this help message

Environment variables:
  GITHUB_TOKEN      (required) GitHub personal access token
  PACKAGIST_VENDOR  (optional) Packagist vendor name (default: juststeveking)
`);
  process.exit(0);
}

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackagistPackage {
  name: string;
  description: string;
  repository: string;
  github_stars: number;
  downloads: {
    total: number;
    monthly: number;
  };
  versions: Record<string, any>;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function packagistFetch(endpoint: string): Promise<any> {
  const res = await fetch(`${PACKAGIST_API}/${endpoint}`);
  if (!res.ok) {
    throw new Error(`Packagist API ${endpoint} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function githubFetch(endpoint: string): Promise<any> {
  const res = await fetch(`${GITHUB_API}/${endpoint}`, {
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

async function getVendorPackages(vendor: string): Promise<string[]> {
  const data = await packagistFetch(`packages/list.json?vendor=${vendor}`);
  return data.packageNames ?? [];
}

async function getPackageDetails(packageName: string): Promise<PackagistPackage> {
  const data = await packagistFetch(`packages/${packageName}.json`);
  return data.package;
}

function getLatestVersion(versions: Record<string, any>): string {
  const versionKeys = Object.keys(versions);
  // Filter out dev versions and sort by something sensible or just pick the first non-dev
  const stable = versionKeys
    .filter(v => !v.startsWith('dev-') && !v.includes('-dev'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

  return stable[0] ?? versionKeys[0] ?? 'unknown';
}

async function getGitHubReadme(repoUrl: string): Promise<string | null> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) return null;
  const [_, owner, repo] = match;
  
  const data = await githubFetch(`repos/${owner}/${repo}/readme`);
  if (!data || !data.download_url) return null;

  const res = await fetch(data.download_url);
  if (!res.ok) return null;
  return res.text();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Escape a string for use inside YAML double-quoted scalars. */
function yamlEscape(s: string): string {
  return (s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function slugify(name: string): string {
  return name
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

function buildMarkdown(pkg: PackagistPackage, readme: string | null): string {
  const latestVersion = getLatestVersion(pkg.versions);
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
      if (typeof v === 'string') return `${k}: "${yamlEscape(v)}"`;
      return `${k}: ${v}`;
    })
    .join('\n');

  return `---
${yaml}
---

${readme ?? pkg.description}
`;
}

// ---------------------------------------------------------------------------
// Index existing files by package name
// ---------------------------------------------------------------------------

async function buildExistingIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const glob = new Glob('*.{md,mdx}');

  for await (const file of glob.scan(PACKAGES_DIR)) {
    const filepath = join(PACKAGES_DIR, file);
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function sync() {
  if (DRY_RUN) console.log('[dry-run] No files will be written.\n');

  process.stdout.write(`Fetching packages for vendor ${VENDOR}... `);
  const packageNames = await getVendorPackages(VENDOR);
  console.log(`${packageNames.length} found`);

  process.stdout.write('Scanning existing files... ');
  const existing = await buildExistingIndex();
  console.log(`${existing.size} indexed\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const name of packageNames) {
    try {
      process.stdout.write(`Syncing ${name}... `);
      const pkg = await getPackageDetails(name);
      const existingPath = existing.get(name);

      if (existingPath && NEW_ONLY) {
        console.log('skipped (exists)');
        skipped++;
        continue;
      }

      // To minimize GitHub API calls, we could skip fetching README if we're not updating.
      // But for now, let's just fetch it.
      const readme = await getGitHubReadme(pkg.repository);

      if (existingPath) {
        const content = await Bun.file(existingPath).text();
        const { data } = matter(content);

        const latestVersion = getLatestVersion(pkg.versions);
        
        const unchanged =
          data.downloads === pkg.downloads.total &&
          data.monthlyDownloads === pkg.downloads.monthly &&
          data.stars === pkg.github_stars &&
          data.version === latestVersion;

        if (unchanged) {
          console.log('no changes');
          skipped++;
          continue;
        }

        const newContent = buildMarkdown(pkg, readme);
        if (!DRY_RUN) await Bun.write(existingPath, newContent);
        console.log('updated');
        updated++;
      } else {
        const slug = slugify(name);
        const filename = `${slug}.md`;
        const filepath = join(PACKAGES_DIR, filename);

        if (!DRY_RUN) await Bun.write(filepath, buildMarkdown(pkg, readme));
        console.log('created');
        created++;
      }
    } catch (err: any) {
      console.log(`failed: ${err.message}`);
    }
  }

  const dryTag = DRY_RUN ? ' (dry run)' : '';
  console.log(`\nDone${dryTag}. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

sync().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});

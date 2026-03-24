# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a content management repository for [juststeveking.com](https://www.juststeveking.com). It serves as the source-of-truth for all published content — articles, videos, talks, packages, testimonials, api-guides, podcasts, and contributions — written in Markdown/MDX with YAML frontmatter, validated against a JSON schema.

## Commands

```bash
bun run verify-schema   # Validate all frontmatter against schema.json
bun run stats           # Print content statistics (file counts, word counts)
bun run sync-youtube    # Sync YouTube channel videos to the videos/ directory
```

### sync-youtube flags

```bash
--fetch=<n>    # Override max videos to fetch (default: MAX_VIDEOS env var)
--dry-run      # Preview changes without writing files
--new-only     # Only create new files, skip updating existing ones
--help         # Show usage
```

`sync-youtube` requires `YOUTUBE_API_KEY` in the environment. `YOUTUBE_CHANNEL_ID` and `MAX_VIDEOS` are optional overrides.

## Bun Runtime

Default to Bun for everything:

- `bun <file>` not `node` or `ts-node`
- `bun test` not jest/vitest
- `bun install` not npm/yarn/pnpm
- `bun run <script>` not npm/yarn/pnpm run
- `bunx` not npx
- `Bun.file` over `node:fs` readFile/writeFile
- `Bun.$\`cmd\`` instead of execa
- Bun auto-loads `.env` — don't use dotenv

## Architecture

### Content Directories

Each directory maps directly to a content type validated by `schema.json`:

| Directory | Schema def | Format |
|-----------|------------|--------|
| `articles/` | `article` | MDX |
| `videos/` | `video` | MDX |
| `packages/` | `package` | MDX |
| `talks/` | `talk` | MDX |
| `testimonials/` | `testimonial` | MDX |
| `api-guides/` | `apiGuide` | MDX |
| `podcasts/` | `podcast` | MDX |
| `contributions/` | `contribution` | MDX |

### Schema Validation

`schema.json` defines all frontmatter shapes as JSON Schema draft-07. The `scripts/verify-schema.ts` script uses AJV + `ajv-formats` to validate every file. Run `bun run verify-schema` after any frontmatter changes.

VSCode schema hints are configured in `.vscode/settings.json` — each directory has a YAML schema pointing to the relevant definition in `schema.json`.

### Scripts (`scripts/`)

- **`verify-schema.ts`** — Globs all `.md`/`.mdx` files, parses frontmatter with `gray-matter`, validates with AJV. Exits 1 on any errors.
- **`stats.ts`** — Aggregates file counts and word counts per content directory.
- **`sync-youtube.ts`** — Fetches from YouTube Data API v3 (uses `playlistItems` for quota efficiency), auto-detects video type (video/shorts/livestream by duration), generates slugs, and writes MDX files. Matches existing files by `videoId` to avoid duplicates.

### Other Files

- `resume.json` — Professional resume data (not frontmatter, not validated by verify-schema)
- `schema.json` — The canonical schema for all 8 content types

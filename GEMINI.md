# GEMINI.md - Project Context

## Project Overview
This repository is the central content source for [juststeveking.com](https://www.juststeveking.com). It is a content-driven project that uses **MDX** for articles and documentation, **JSON Schema** for structured metadata (frontmatter) validation, and a custom **TypeScript CLI** (powered by **Bun**) for content management and synchronization.

### Main Technologies
- **Runtime**: [Bun](https://bun.sh/)
- **Content**: MDX, Markdown, JSON
- **Validation**: AJV (JSON Schema validator)
- **CLI Framework**: `@crustjs/core`
- **Metadata Management**: `gray-matter` for frontmatter parsing

## Project Structure
- `articles/`: Main blog posts and articles (MDX).
- `api-guides/`: Technical guides for API design and implementation (MDX).
- `series/`: Groupings of related articles (MD).
- `packages/`: Documentation for open-source packages (MDX).
- `contributions/`, `podcasts/`, `talks/`, `testimonials/`, `videos/`: Specialized content collections.
- `tools/`: JSON-based collection of recommended developer tools.
- `src/`: TypeScript source code for the internal content CLI.
- `schema.json`: The source of truth for all content frontmatter validation.
- `resume.json`: Steve McDougall's professional resume in [JSON Resume](https://jsonresume.org/) format.

## Building and Running

### Development & Maintenance Commands
- **Verify Schema**: `bun verify-schema`
  Validates all content files against the definitions in `schema.json`.
- **Scaffold New Content**: `bun src/cli.ts make:content`
  Interactive CLI to create new articles, guides, or other content types with pre-filled frontmatter.
- **Check Links**: `bun src/cli.ts check:links`
  Verifies that links within the content are valid.
- **View Statistics**: `bun stats`
  Displays counts and metrics for the repository's content.
- **Sync External Data**:
  - `bun sync-youtube`: Updates video data from YouTube.
  - `bun sync-packages`: Updates open-source package metrics.
  - `bun src/cli.ts sync:all`: Runs all synchronization tasks.

## Development Conventions

### Content Creation
- **Frontmatter**: All MDX/MD files must adhere to the schema defined in `schema.json`. New content should be created using the `make:content` command to ensure compliance.
- **Slugs**: Slugs are typically derived from titles in lowercase, hyphen-separated format (e.g., `adapter-pattern.mdx`).
- **Dates**: Use `YYYY-MM-DD` format for all dates.

### CLI Development
- **Commands**: New CLI commands are located in `src/commands/` and extend `BaseCommand`.
- **Typing**: Strict TypeScript is used throughout the `src` directory.
- **Tooling**: Prefer Bun primitives (e.g., `Bun.write`, `Bun.file`) for file system operations.

### Quality Control
- Always run `bun verify-schema` before committing changes to ensure content integrity.
- The `schema.json` is generated from `src/content.config.ts` (implied by `$comment` in `schema.json`), so modifications to the schema should ideally be reflected there if the generation tool is active.

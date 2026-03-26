import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { input, select, spinner } from '@crustjs/prompts';
import { BaseCommand } from './base-command';
import type { CrustCommandContext } from '@crustjs/core';

export class MakeContentCommand extends BaseCommand {
  public name = 'make:content';
  public description = 'Scaffold new content from schema';

  private readonly CONTENT_TYPES = [
    { label: 'Article', value: 'articles', def: 'article', ext: 'mdx' },
    { label: 'API Guide', value: 'api-guides', def: 'apiGuide', ext: 'mdx' },
    { label: 'Talk', value: 'talks', def: 'talk', ext: 'md' },
    { label: 'Podcast', value: 'podcasts', def: 'podcast', ext: 'md' },
    { label: 'Testimonial', value: 'testimonials', def: 'testimonial', ext: 'md' },
    { label: 'Contribution', value: 'contributions', def: 'contribution', ext: 'md' },
  ];

  public async handle(_ctx: CrustCommandContext) {
    const type = await select({
      message: 'Select content type:',
      choices: this.CONTENT_TYPES,
    });

    const config = this.CONTENT_TYPES.find(c => c.value === type)!;
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'schema.json'), 'utf8'));
    const definition = schema.$defs[config.def];

    if (!definition) {
      console.error(`❌ No schema definition found for ${config.def}`);
      process.exit(1);
    }

    const frontmatter: Record<string, any> = {};
    const requiredFields = definition.required || [];
    const properties = definition.properties || {};

    console.log(`\n📝 Creating new ${config.label}...\n`);

    for (const [key, prop] of Object.entries(properties) as [string, any][]) {
      // Skip fields that are typically automated or not needed during creation
      if (['updatedAt', 'updatedDate', 'downloads', 'monthlyDownloads', 'stars', 'version', 'readingTime'].includes(key)) {
        continue;
      }

      const isRequired = requiredFields.includes(key);
      const label = isRequired ? `${key}*` : key;

      if (prop.type === 'boolean') {
        // Simple select for booleans
        frontmatter[key] = await select({
          message: `${label}:`,
          choices: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
          default: prop.default ?? false,
        });
      } else if (prop.enum) {
        frontmatter[key] = await select({
          message: `${label}:`,
          choices: prop.enum.map((v: string) => ({ label: v, value: v })),
          default: prop.default,
        });
      } else if (prop.type === 'array') {
        const val = await input({
          message: `${label} (comma separated):`,
          placeholder: 'tag1, tag2',
        });
        frontmatter[key] = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
      } else {
        const val = await input({
          message: `${label}:`,
          placeholder: prop.description || '',
          validate: (v) => {
            if (isRequired && !v) return `${key} is required`;
            if (prop.maxLength && v.length > prop.maxLength) return `Max length is ${prop.maxLength}`;
            return true;
          },
          default: key === 'publishedDate' || key === 'pubDate' || key === 'date' 
            ? new Date().toISOString().split('T')[0]
            : undefined,
        });
        
        if (val || isRequired) {
            frontmatter[key] = val;
        }
      }
    }

    const title = frontmatter.title || frontmatter.name || frontmatter.project || 'new-content';
    const slug = this.slugify(title);
    const filename = `${slug}.${config.ext}`;
    const dirPath = join(process.cwd(), type);
    const filePath = join(dirPath, filename);

    if (existsSync(filePath)) {
      console.error(`❌ File already exists: ${filePath}`);
      process.exit(1);
    }

    const yaml = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (typeof v === 'string') return `${k}: "${v.replace(/"/g, '\\"')}"`;
        if (Array.isArray(v)) return `${k}: [${v.map(s => `"${s}"`).join(', ')}]`;
        return `${k}: ${v}`;
      })
      .join('\n');

    const content = `---
${yaml}
---

# ${title}

Write your content here...
`;

    await spinner({
      message: `Writing ${filename}...`,
      task: async () => {
        await Bun.write(filePath, content);
      },
    });

    console.log(`\n✅ Created: ${filePath}`);
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import matter from 'gray-matter';
import { Glob } from "bun";

// Load schema
const schemaPath = join(process.cwd(), 'schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

// Initialize Ajv
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Map of directory to schema definition name
const dirToSchema: Record<string, string> = {
  'api-guides': 'apiGuide',
  'articles': 'article',
  'testimonials': 'testimonial',
  'videos': 'video',
  'contributions': 'contribution',
  'packages': 'package',
  'talks': 'talk',
  'podcasts': 'podcast',
};

// Create a map of validators
const validators: Record<string, any> = {};
for (const [dir, defName] of Object.entries(dirToSchema)) {
  const definition = schema.$defs[defName];
  if (definition) {
    validators[dir] = ajv.compile(definition);
  }
}

/**
 * Recursively convert Date objects to YYYY-MM-DD strings.
 * This is needed because gray-matter (via js-yaml) parses dates as Date objects,
 * but the JSON schema expects strings.
 */
function transformDates(obj: any): any {
  if (obj instanceof Date) {
    // Use ISO string and take the date part (YYYY-MM-DD)
    return obj.toISOString().split('T')[0];
  }
  if (Array.isArray(obj)) {
    return obj.map(transformDates);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, transformDates(v)])
    );
  }
  return obj;
}

let totalFiles = 0;
let totalErrors = 0;

console.log('🔍 Verifying frontmatter schema...\n');

async function run() {
  for (const dir of Object.keys(dirToSchema)) {
    const dirPath = join(process.cwd(), dir);
    if (!existsSync(dirPath)) {
      continue;
    }

    const glob = new Glob(`${dir}/*.{md,mdx}`);
    const files = Array.from(glob.scanSync());

    if (files.length === 0) continue;

    console.log(`📂 Checking ${dir}/ (${files.length} files)`);

    for (const file of files) {
      totalFiles++;
      const content = readFileSync(join(process.cwd(), file), 'utf8');
      
      try {
        let { data } = matter(content);
        data = transformDates(data);
        
        const validate = validators[dir];

        if (!validate) {
          console.warn(`⚠️  No validator for directory: ${dir}`);
          continue;
        }

        const valid = validate(data);
        if (!valid) {
          totalErrors++;
          console.error(`❌ ${file}`);
          validate.errors.forEach((err: any) => {
            const path = err.instancePath || 'root';
            const msg = err.message;
            const params = JSON.stringify(err.params);
            console.error(`   - ${path}: ${msg} (${params})`);
          });
        }
      } catch (e: any) {
        totalErrors++;
        console.error(`❌ ${file}: Failed to parse frontmatter`);
        console.error(`   - ${e.message}`);
      }
    }
  }

  console.log(`\n✨ Finished verifying ${totalFiles} files.`);
  if (totalErrors > 0) {
    console.log(`🚨 Found ${totalErrors} errors across different files.`);
    process.exit(1);
  } else {
    console.log('✅ All frontmatter is valid!');
  }
}

run();

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webSrc = join(__dirname, '..', 'src');

async function getFiles(dir, filter) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFiles(fullPath, filter)));
    } else if (filter(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

// 1. Find all JSX files and extract class names
const jsxFiles = await getFiles(webSrc, name => name.endsWith('.jsx') || name.endsWith('.js'));
const usedClasses = new Set();

for (const file of jsxFiles) {
  const content = await readFile(file, 'utf8');
  // Match className="..." and className='...' and template literals
  const staticMatches = content.matchAll(/className=["']([^"']+)["']/g);
  for (const match of staticMatches) {
    for (const cls of match[1].split(/\s+/)) {
      const clean = cls.trim();
      if (clean && !clean.includes('{') && !clean.includes('$')) {
        usedClasses.add(clean);
      }
    }
  }

  // Also match template literals like className={`...`}
  const templateMatches = content.matchAll(/className=\{`([^`]+)`\}/g);
  for (const match of templateMatches) {
    // Replace ${...} with space
    const stripped = match[1].replace(/\$\{[^}]+\}/g, ' ');
    for (const cls of stripped.split(/\s+/)) {
      const clean = cls.trim();
      if (clean) usedClasses.add(clean);
    }
  }

  // Also match conditional ternary classes like: item.status === 'running' ? 'tool-pulse' : ...
  const conditionalMatches = content.matchAll(/\?\s*['"]([a-zA-Z0-9_-]+)['"]\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/g);
  for (const match of conditionalMatches) {
    if (match[1]) usedClasses.add(match[1]);
    if (match[2]) usedClasses.add(match[2]);
  }
}

// 2. Find all CSS files and extract defined class selectors
const cssFiles = await getFiles(webSrc, name => name.endsWith('.css'));
const definedClasses = new Set();

for (const file of cssFiles) {
  const content = await readFile(file, 'utf8');
  const classMatches = content.matchAll(/\.([a-zA-Z0-9_-]+)/g);
  for (const match of classMatches) {
    definedClasses.add(match[1]);
  }
}

const usedSorted = [...usedClasses].sort();
const definedSorted = [...definedClasses].sort();

const isBaseline = process.argv.includes('--baseline');
const targetFile = isBaseline
  ? join(__dirname, 'classes-before.json')
  : join(__dirname, 'classes-after.json');

const snapshot = {
  usedInJsx: usedSorted,
  definedInCss: definedSorted
};

await writeFile(targetFile, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(`Saved CSS classes snapshot to ${targetFile}`);
console.log(`- Used in JSX: ${usedSorted.length} classes`);
console.log(`- Defined in CSS: ${definedSorted.length} classes`);

if (!isBaseline) {
  const beforeRaw = await readFile(join(__dirname, 'classes-before.json'), 'utf8');
  const before = JSON.parse(beforeRaw);

  const missingFromJsx = before.usedInJsx.filter(c => !snapshot.usedInJsx.includes(c));
  const missingFromCss = before.definedInCss.filter(c => !snapshot.definedInCss.includes(c));

  let failed = false;
  if (missingFromJsx.length > 0) {
    console.warn('⚠️ Classes no longer referenced in JSX:', missingFromJsx);
  }
  if (missingFromCss.length > 0) {
    console.error('❌ Classes missing from CSS after refactor:', missingFromCss);
    failed = true;
  }

  if (failed) process.exit(1);
  console.log('✓ All CSS classes preserved!');
}

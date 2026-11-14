import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');

console.log('--- AURAEXAM PRODUCTION BUILD & VALIDATION ---');
console.log(`Checking frontend directory: ${webDir}`);

if (!fs.existsSync(webDir)) {
  console.error(`Error: Frontend directory ${webDir} does not exist!`);
  process.exit(1);
}

const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'config.js',
  'admin.html',
  'admin.css',
  'admin.js',
  'refund.html',
  'refund.js'
];

let missing = 0;
let totalBytes = 0;

for (const f of requiredFiles) {
  const filePath = path.join(webDir, f);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required asset: ${f}`);
    missing++;
  } else {
    const stat = fs.statSync(filePath);
    totalBytes += stat.size;
    console.log(`✓ ${f.padEnd(16)} verified (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

if (missing > 0) {
  console.error(`Build failed: ${missing} required files missing.`);
  process.exit(1);
}

console.log(`\nAll ${requiredFiles.length} production assets verified (${(totalBytes / 1024).toFixed(1)} KB total).`);
console.log('Production build validation completed successfully.');

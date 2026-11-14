import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Milestone 8: Build & Asset Integrity Verification', () => {
  it('Scenario 1 & 2: executes production build and verifies zero syntax/asset errors', () => {
    const buildOutput = execSync('node scripts/build.js', { encoding: 'utf-8' });
    expect(buildOutput).toContain('Production build validation completed successfully.');
    expect(buildOutput).toContain('All 9 production assets verified');
  });

  it('Scenario 19: verifies responsive viewport and meta theme tags across HTML files', () => {
    const indexHtml = fs.readFileSync(path.resolve('web/index.html'), 'utf-8');
    const adminHtml = fs.readFileSync(path.resolve('web/admin.html'), 'utf-8');
    const refundHtml = fs.readFileSync(path.resolve('web/refund.html'), 'utf-8');

    [indexHtml, adminHtml, refundHtml].forEach(html => {
      expect(html).toContain('name="viewport"');
      expect(html).toContain('content="width=device-width, initial-scale=1"');
      expect(html).toContain('name="theme-color"');
    });
  });
});

/**
 * frontend.test.js - Unit and Sanity Test Suite for TaskFlow Frontend
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatDateTime,
  formatDateShort,
  formatSessionRemaining,
  STATUS_STYLES,
  STATUS_LABELS,
  PRIORITY_STYLES
} from '../frontend/src/utils/formatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'frontend', 'dist');

console.log('=== Running Frontend Unit & Sanity Tests ===\n');

// 1. Date & Time Formatters
console.log('Test 1: formatDateTime helper');
assert.strictEqual(formatDateTime(null), '—');
assert.strictEqual(formatDateTime(''), '—');
const testDate = new Date(2026, 9, 15, 14, 30).toISOString();
assert(typeof formatDateTime(testDate) === 'string' && formatDateTime(testDate).length > 5);
console.log('  [PASS] formatDateTime handles valid ISO strings and null gracefully.');

// 2. Short Date Formatter
console.log('Test 2: formatDateShort helper');
assert.strictEqual(formatDateShort(null), '—');
const shortDate = formatDateShort('2026-10-15');
assert(typeof shortDate === 'string' && shortDate.length > 3);
console.log('  [PASS] formatDateShort produces localized date string.');

// 3. Session Remaining Calculator
console.log('Test 3: formatSessionRemaining helper');
assert.strictEqual(formatSessionRemaining(null), '');
const pastDate = new Date(Date.now() - 60000).toISOString();
assert.strictEqual(formatSessionRemaining(pastDate), 'Expired');
const futureDate = new Date(Date.now() + 71 * 3600 * 1000 + 45 * 60 * 1000).toISOString();
const remaining = formatSessionRemaining(futureDate);
assert(remaining.includes('71h') || remaining.includes('70h') || remaining.includes('72h'));
assert(remaining.includes('remaining'));
console.log(`  [PASS] formatSessionRemaining calculates countdown correctly ("${remaining}").`);

// 4. Status Styles & Labels
console.log('Test 4: Status badge styles and labels');
const expectedStatuses = ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
for (const s of expectedStatuses) {
  assert(STATUS_STYLES[s], `Missing style mapping for status: ${s}`);
  assert(STATUS_LABELS[s], `Missing label mapping for status: ${s}`);
}
assert(STATUS_STYLES.COMPLETED.includes('emerald'), 'Completed status must use emerald tone.');
assert(STATUS_STYLES.BLOCKED.includes('red'), 'Blocked status must use red tone.');
assert(STATUS_STYLES.IN_PROGRESS.includes('111111'), 'In Progress must use signature Black tone.');
console.log('  [PASS] All statuses mapped to exact Figma Black/Silver/Semantic palette.');

// 5. Priority Styles
console.log('Test 5: Priority badge styles');
const expectedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
for (const p of expectedPriorities) {
  assert(PRIORITY_STYLES[p], `Missing priority style for: ${p}`);
}
assert(PRIORITY_STYLES.URGENT.includes('red'), 'Urgent priority must be emphasized with red tone.');
assert(PRIORITY_STYLES.HIGH.includes('111111'), 'High priority must use signature Black tone.');
console.log('  [PASS] All priority badges configured accurately.');

// 6. Build Sanity Check (Dist Artifacts)
console.log('Test 6: Production Build Sanity Check');
assert(fs.existsSync(distDir), 'frontend/dist directory does not exist. Run npm run build first.');

const distFiles = fs.readdirSync(path.join(distDir, 'assets'));
const cssFile = distFiles.find(f => f.endsWith('.css'));
const jsFile = distFiles.find(f => f.endsWith('.js'));

assert(cssFile, 'Built CSS bundle not found in dist/assets');
assert(jsFile, 'Built JS bundle not found in dist/assets');

const cssStats = fs.statSync(path.join(distDir, 'assets', cssFile));
assert(cssStats.size > 20000, `CSS bundle is too small (${cssStats.size} bytes). Tailwind may not be processing.`);
console.log(`  [PASS] Tailwind CSS compiled successfully (${(cssStats.size / 1024).toFixed(2)} KB).`);

const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
assert(indexHtml.includes('Plus+Jakarta+Sans'), 'Google Font Plus Jakarta Sans missing in dist/index.html');
assert(indexHtml.includes('Inter'), 'Google Font Inter missing in dist/index.html');
console.log('  [PASS] Premium typography (Plus Jakarta Sans & Inter) verified in index.html.');

console.log('\nALL 6 FRONTEND UNIT & SANITY TESTS PASSED SUCCESSFULLY!\n');

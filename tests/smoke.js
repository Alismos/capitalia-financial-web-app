#!/usr/bin/env node
// Capitalia smoke tests — static checks against the PWA files.
// No external dependencies. Run with: node tests/smoke.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \u2717 ${name}  \u2014  ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ============ File presence ============
console.log('\nFile presence');
[
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'README.md',
  '.gitignore',
  'update.sh',
].forEach((f) => {
  test(`file exists: ${f}`, () => assert(exists(f), `${f} missing`));
});

// ============ manifest.webmanifest ============
console.log('\nmanifest.webmanifest');
const manifestRaw = read('manifest.webmanifest');
let manifest;
test('manifest is valid JSON', () => { manifest = JSON.parse(manifestRaw); });
test('manifest has required PWA fields', () => {
  ['name', 'short_name', 'start_url', 'display', 'icons'].forEach((f) => {
    assert(f in manifest, `manifest missing field: ${f}`);
  });
});
test('manifest has theme_color and background_color', () => {
  assert(manifest.theme_color, 'theme_color missing');
  assert(manifest.background_color, 'background_color missing');
});
test('manifest icons include 192 and 512', () => {
  const sizes = (manifest.icons || []).map((i) => i.sizes);
  assert(sizes.includes('192x192'), '192x192 icon missing');
  assert(sizes.includes('512x512'), '512x512 icon missing');
});

// ============ sw.js ============
console.log('\nsw.js');
const sw = read('sw.js');
test('sw.js declares VERSION', () => assert(/const VERSION\s*=/.test(sw), 'VERSION const missing'));
test('sw.js declares CACHE', () => assert(/const CACHE\s*=/.test(sw), 'CACHE const missing'));
test('sw.js pre-caches core assets', () => {
  ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'].forEach((f) => {
    assert(sw.includes(f), `REQUIRED_ASSETS missing ${f}`);
  });
});
test('sw.js pre-caches SheetJS CDN (OPTIONAL_ASSETS)', () => {
  assert(sw.includes('cdn.sheetjs.com'), 'SheetJS CDN not in sw.js');
});
test('sw.js registers install, activate, and fetch listeners', () => {
  ['install', 'activate', 'fetch'].forEach((e) => {
    const re = new RegExp(`addEventListener\\(\\s*['"]${e}['"]`);
    assert(re.test(sw), `listener for ${e} missing`);
  });
});
test('sw.js fetch handler does not early-return on cross-origin', () => {
  assert(!/url\.origin\s*!==\s*self\.location\.origin\s*\)\s*return/.test(sw),
    'fetch handler still early-returns for cross-origin, cached CDN assets will not be served');
});

// ============ index.html ============
console.log('\nindex.html');
const html = read('index.html');

test('head links to manifest.webmanifest', () => {
  assert(/<link\s+rel="manifest"\s+href="manifest\.webmanifest"/.test(html), 'manifest link missing');
});
test('head has apple-touch-icon link', () => {
  assert(/<link\s+rel="apple-touch-icon"/.test(html), 'apple-touch-icon link missing');
});
test('head has theme-color meta', () => {
  assert(/<meta\s+name="theme-color"/.test(html), 'theme-color meta missing');
});
test('FOUC theme script runs before <style>', () => {
  const fouc = html.indexOf('document.documentElement.dataset.theme');
  const style = html.indexOf('<style>');
  assert(fouc > -1, 'FOUC script missing');
  assert(style > -1, '<style> missing');
  assert(fouc < style, 'FOUC script must come before <style> to prevent flash');
});
test('CSS has :root[data-theme="dark"] override block', () => {
  assert(html.includes(':root[data-theme="dark"]'), 'dark theme CSS block missing');
});
test('service worker is registered', () => {
  assert(/navigator\.serviceWorker\.register\(\s*['"]sw\.js['"]/.test(html), 'SW registration missing');
});

// Sidebar buttons
test('sidebar exposes toggleTheme button', () => {
  assert(html.includes('onclick="toggleTheme()"'), 'toggleTheme button missing');
});
test('sidebar exposes wipeAllData button', () => {
  assert(html.includes('onclick="wipeAllData()"'), 'wipeAllData button missing');
});
test('sidebar exposes exportExcel button', () => {
  assert(html.includes('onclick="exportExcel()"'), 'exportExcel button missing');
});
test('sidebar still exposes exportData (JSON) and importData', () => {
  assert(html.includes('onclick="exportData()"'), 'exportData button missing');
  assert(html.includes('onclick="importData()"'), 'importData button missing');
});

// Function definitions
test('defines applyTheme()', () => {
  assert(/function\s+applyTheme\s*\(/.test(html), 'applyTheme() missing');
});
test('defines toggleTheme()', () => {
  assert(/function\s+toggleTheme\s*\(/.test(html), 'toggleTheme() missing');
});
test('defines wipeAllData()', () => {
  assert(/async\s+function\s+wipeAllData\s*\(|function\s+wipeAllData\s*\(/.test(html),
    'wipeAllData() missing');
});
test('defines exportExcel()', () => {
  assert(/async\s+function\s+exportExcel\s*\(|function\s+exportExcel\s*\(/.test(html),
    'exportExcel() missing');
});
test('defines loadSheetJS()', () => {
  assert(/function\s+loadSheetJS\s*\(/.test(html), 'loadSheetJS() missing');
});

// Behavior contracts
test('wipeAllData preserves capitalia-theme key', () => {
  assert(html.includes("k !== 'capitalia-theme'"),
    'wipeAllData must filter out capitalia-theme so the user preference survives a wipe');
});
test('SheetJS CDN version matches between index.html and sw.js', () => {
  const mHtml = html.match(/cdn\.sheetjs\.com\/xlsx-([\d.]+)/);
  const mSw = sw.match(/cdn\.sheetjs\.com\/xlsx-([\d.]+)/);
  assert(mHtml, 'SheetJS CDN URL not in index.html');
  assert(mSw, 'SheetJS CDN URL not in sw.js');
  assert(mHtml[1] === mSw[1],
    `version mismatch: index.html=${mHtml[1]} vs sw.js=${mSw[1]}`);
});
test('exportExcel writes the ledger-style sheets', () => {
  [
    'Resumen',
    'Operaciones',
    'Abonos',
    'Ingresos',
    'Consolidado Inversores',
  ].forEach((sheet) => {
    assert(html.includes(`'${sheet}'`), `sheet name "${sheet}" not found in exportExcel`);
  });
});
test('exportExcel does NOT emit Socios Minoritarios or Costos Intrínsecos as separate sheets', () => {
  // They were merged into Operaciones (column Costos Intrínsecos) and
  // Consolidado Inversores (per-investor aggregate). Keep the label "Costos
  // Intrínsecos" only as a column header in Operaciones, not a sheet name.
  assert(!/addSheet\(\s*minAoA/.test(html), 'Socios Minoritarios sheet should not be added');
  assert(!/addSheet\(\s*costAoA/.test(html), 'Costos Intrínsecos sheet should not be added');
});
test('exportExcel reuses computeOperation and computePaymentsBreakdown', () => {
  assert(/exportExcel[\s\S]*?computeOperation\(op\)/.test(html),
    'exportExcel must use computeOperation(op) for rich op metrics');
  assert(/exportExcel[\s\S]*?computePaymentsBreakdown\(op\)/.test(html),
    'exportExcel must use computePaymentsBreakdown(op) for payment breakdown');
});
test('exportExcel converts dates to Excel serial', () => {
  assert(html.includes("Date.UTC(1899, 11, 30)"),
    'exportExcel must use Excel epoch (Dec 30 1899) for serial conversion');
});
test('exportExcel emits a TOTAL row per sheet', () => {
  // Sheets with TOTAL: Operaciones, Abonos, Ingresos, Consolidado Inversores (4).
  const totalRows = (html.match(/\['TOTAL',/g) || []).length;
  assert(totalRows >= 4, `expected ≥4 TOTAL rows in exportExcel, found ${totalRows}`);
});
test('exportExcel applies cell number formats (money, pct, date)', () => {
  assert(html.includes('"$"#,##0'), 'money format string missing');
  assert(html.includes('0.00%;[Red]-0.00%'), 'percentage format string missing');
  assert(html.includes("'yyyy-mm-dd'"), 'date format string missing');
});
test('exportExcel colors losses red and profits green via number-format color codes', () => {
  assert(html.includes('[Red]-"$"#,##0'), 'red-on-negative money format missing');
  assert(html.includes('[Green]"$"#,##0'), 'green-on-positive profit format missing');
  assert(html.includes('[Red]"$"#,##0'), 'red cost format missing');
  assert(html.includes('[Green]0.00%'), 'green profit percent format missing');
});
test('exportExcel routes profit/cost/loss cells through the colored helpers', () => {
  assert(/function cellProfit\s*\(/.test(html) || html.includes('const cellProfit ='),
    'cellProfit helper missing');
  assert(/function cellCost\s*\(/.test(html) || html.includes('const cellCost ='),
    'cellCost helper missing');
  // Verify the Utilidad Neta / Balance del fondo paths use cellProfit
  assert(/cellProfit\(c\.profitAfterCosts\)/.test(html),
    'Utilidad Neta column should use cellProfit');
  assert(/cellProfit\(fundBalance\)/.test(html),
    'Balance del fondo should use cellProfit');
});
test('exportExcel sets per-sheet column widths', () => {
  assert(/ws\['!cols'\]\s*=\s*cols/.test(html) || html.includes("'!cols'"),
    'column widths (!cols) not configured');
});
test('exportExcel freezes the header row', () => {
  assert(html.includes("'!freeze'") || html.includes("'!views'"),
    'frozen header row not configured');
});
test('Resumen sheet includes fund balance and ROI', () => {
  assert(html.includes('Balance del fondo'), '"Balance del fondo" metric missing');
  assert(html.includes('ROI promedio'), '"ROI promedio" metric missing');
  assert(html.includes('Utilidad neta'), '"Utilidad neta" metric missing');
});

// CSS dark-mode regressions
console.log('\nDark mode (no hardcoded light colors on theme-sensitive surfaces)');
test('.hero uses CSS variables, not hardcoded #FFFFFF', () => {
  const heroBlock = html.match(/\.hero\s*\{[^}]+\}/);
  assert(heroBlock, '.hero CSS block missing');
  assert(!heroBlock[0].includes('#FFFFFF'),
    '.hero still contains hardcoded #FFFFFF — breaks dark mode');
});

// ============ Summary ============
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}

const esbuild = require('esbuild');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
esbuild.buildSync({
  stdin: {
    contents: "import html2pdf from 'html2pdf.js/src/index.js'; globalThis.html2pdf = html2pdf;",
    resolveDir: __dirname,
    sourcefile: 'reviewed-html2pdf-entry.js',
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'eof',
  outfile: path.join(__dirname, '../vendor/html2pdf.js'),
});
const manifestPath = path.join(__dirname, '../vendor/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const entry = manifest.find(row => row.path === 'vendor/html2pdf.js');
const bytes = fs.readFileSync(path.join(__dirname, '../vendor/html2pdf.js'));
Object.assign(entry, {
  source: 'npm:html2pdf.js@0.14.0/src/index.js',
  resolved_url: null,
  dependencies: { jspdf: '4.2.1', dompurify: '3.4.15', html2canvas: '1.4.1' },
  build: 'cd vendor-build && npm ci --ignore-scripts && npm run build',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
});
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

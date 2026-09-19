# Reviewed browser dependencies

Pages use local scripts so third-party CDN code cannot change during login or
while a report is open. `manifest.json` records versions, source URLs and hashes.
The original license notices are retained in the distributed files.

- Supabase JS 2.116.0: upstream browser build plus a `createClient` ESM export.
- html2canvas 1.4.1 and jsPDF 4.2.1: upstream browser distributions.
- html2pdf.js 0.14.0: rebuilt from source with jsPDF 4.2.1 and DOMPurify 3.4.15.
  The upstream prebuilt html2pdf bundle contains older internal dependencies,
  so do not replace this file with that bundle.

Rebuild the PDF bundle with:

```sh
cd vendor-build
npm ci --ignore-scripts
npm audit
npm run build
```

Test PDF generation and authentication before changing dependencies. Do not
weaken CSP to load a new CDN script. Never put access or refresh tokens in
`window.name` or URLs.

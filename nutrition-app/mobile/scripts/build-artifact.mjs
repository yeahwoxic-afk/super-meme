#!/usr/bin/env node
/**
 * Builds the "open by link" version of NutriAI: the Expo web export inlined
 * into one HTML page that is published as a Claude artifact.
 *
 *   node scripts/build-artifact.mjs [outFile]
 *
 * Inside Claude the app uses the viewer's Claude account for food recognition
 * and a private cloud folder for data (see src/runtime.ts, src/persist.ts),
 * so it needs no server.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'dist-artifact', 'nutri-ai.html'));
const exportDir = mkdtempSync(join(tmpdir(), 'nutri-web-'));

execFileSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', exportDir], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, EXPO_OFFLINE: '1' },
});

const index = readFileSync(join(exportDir, 'index.html'), 'utf8');
const src = index.match(/<script src="\/(_expo\/static\/js\/web\/[^"]+\.js)"/)?.[1];
if (!src) throw new Error('bundle <script> not found in exported index.html');
// Keep the inline script from closing early.
const bundle = readFileSync(join(exportDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');

// The artifact skeleton adds doctype/head/body; this is the page content.
const page = `<title>NutriAI</title>
<style>
/* NutriAI runs as a React Native Web app in one light theme (its own palette in src/theme.ts). */
:root { --bg: #F4F6F3; --fg: #16211B; color-scheme: light; }
html, body { height: 100%; }
body { background: var(--bg); color: var(--fg); overflow: hidden; }
#root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>Для работы приложения нужен JavaScript.</noscript>
<div id="root"></div>
<script>${bundle}</script>
`;

execFileSync('mkdir', ['-p', dirname(out)]);
writeFileSync(out, page);
console.log(`Artifact page: ${out} (${Math.round(page.length / 1024)} KB)`);

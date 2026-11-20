// Builds the offline test copy: the whole game in one HTML file, with the leaderboard API running
// inside the page (sample players, kept in the browser) in place of the live server.
//   node scripts/test-html.ts [output.html]
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'tension-test.html';
const dir = 'dist-test';
execSync(`npx vite build --outDir ${dir} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_LOCAL_API: '1' } });
const assets = readdirSync(join(dir, 'assets'));
const js = readFileSync(join(dir, 'assets', assets.find((f) => f.endsWith('.js'))!), 'utf8').replace(/<\/script/g, '<\\/script');
const css = readFileSync(join(dir, 'assets', assets.find((f) => f.endsWith('.css'))!), 'utf8');
let html = readFileSync(join(dir, 'index.html'), 'utf8')
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, () => '')
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => `<style>${css}</style>`)
  .replace('<title>TENSION</title>', '<title>TENSION (test copy)</title>');
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
if (html.includes('assets/')) throw new Error('an asset was left unlinked');
writeFileSync(out, html);
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);

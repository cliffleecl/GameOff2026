/* 把 dist/ 壓成 brain-shift-itch.zip，可以手動上傳到 itch.io（Kind of project 選 HTML）。 */
import { createWriteStream, existsSync } from 'node:fs';
import archiver from 'archiver';

if (!existsSync('dist/index.html')) { console.error('找不到 dist/index.html，先跑 npm run build'); process.exit(1); }
const out = createWriteStream('brain-shift-itch.zip');
const zip = archiver('zip', { zlib: { level: 9 } });
out.on('close', () => console.log(`已產生 brain-shift-itch.zip（${(zip.pointer() / 1024).toFixed(0)} KB）`));
zip.on('error', e => { throw e; });
zip.pipe(out); zip.directory('dist/', false); zip.finalize();

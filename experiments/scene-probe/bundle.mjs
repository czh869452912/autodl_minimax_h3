import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const output = 'android/app/src/main/assets';
await mkdir(output, { recursive: true });
await build({ entryPoints: ['scene.js'], bundle: true, format: 'iife', minify: true, outfile: `${output}/scene.js`, legalComments: 'eof' });
await copyFile('index.html', `${output}/index.html`);
await copyFile('node_modules/three/LICENSE', `${output}/THREE-LICENSE.txt`);

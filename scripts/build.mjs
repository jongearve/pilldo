// Copia la interfaz a "www" y empaqueta el puente con Android.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(path.join(root, 'web'), www, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'bridge.js')],
  outfile: path.join(www, 'bridge.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  logLevel: 'info',
});
console.log('Listo: carpeta www generada.');

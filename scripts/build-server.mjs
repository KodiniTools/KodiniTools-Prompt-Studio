// Bündelt den Server in eine Datei. Abhängigkeiten bleiben extern (node_modules).
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  logLevel: 'info',
})

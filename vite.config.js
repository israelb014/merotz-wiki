import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

const versionPlugin = () => ({
  name: 'version-json',
  generateBundle() {
    const cl = JSON.parse(readFileSync(new URL('./public/data/changelog.json', import.meta.url)));
    this.emitFile({
      type: 'asset', fileName: 'version.json',
      source: JSON.stringify({ version: pkg.version, content: cl[0]?.version, shell: process.env.SHELL_VERSION || pkg.version, built: new Date().toISOString() }),
    });
  },
});

export default defineConfig({
  plugins: [versionPlugin()],
  base: process.env.VITE_BASE ?? '/merotz-wiki/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        download: resolve(import.meta.dirname, 'download/index.html'),
      },
    },
  },
  server: { port: 5173 },
});

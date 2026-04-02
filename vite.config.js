import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

/**
 * Collects HTML entry files under src/ and maps page names to their absolute paths.
 *
 * Scans the src directory for files ending with `.html`, uses the filename without
 * the `.html` extension as the page name, and returns a map of page name → absolute path.
 *
 * @returns {Object.<string,string>} An object mapping page names (filename without `.html`) to the resolved absolute path of each HTML file.
 */
function getHtmlInputs() {
  const srcDir = resolve(__dirname, 'src');
  const inputs = {};
  readdirSync(srcDir)
    .filter((file) => file.endsWith('.html'))
    .forEach((file) => {
      const name = file.replace('.html', '');
      inputs[name] = resolve(srcDir, file);
    });
  return inputs;
}

export default defineConfig({
  appType: 'mpa',
  root: resolve(__dirname, 'src'),
  envDir: resolve(__dirname),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

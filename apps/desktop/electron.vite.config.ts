import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: path.join(__dirname, 'electron/main.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          preload: path.join(__dirname, 'electron/preload.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    base: './',
    root: __dirname,
    build: {
      rollupOptions: {
        input: path.join(__dirname, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});

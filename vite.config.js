import { defineConfig } from 'vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/styles/badges.css',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        popup: path.resolve(import.meta.dirname, 'src/popup/popup.html'),
        options: path.resolve(import.meta.dirname, 'src/options/options.html'),
        background: path.resolve(import.meta.dirname, 'src/background.js'),
        content: path.resolve(import.meta.dirname, 'src/content.js'),
      },
      output: {
        entryFileNames: 'src/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
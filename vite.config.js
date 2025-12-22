import { defineConfig } from 'vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/styles',
          dest: 'src'
        }
      ]
    })
  ],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup/popup.html'),
        options: path.resolve(__dirname, 'src/options/options.html'),
        background: path.resolve(__dirname, 'src/background.js'),
        content: path.resolve(__dirname, 'src/content.js'),
      },
      output: {
        entryFileNames: 'src/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
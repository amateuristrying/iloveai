import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // keep fonts as cacheable files
    chunkSizeWarningLimit: 800, // three.js alone is ~600 kB minified
    rolldownOptions: {
      output: {
        // vendor code changes rarely: give it its own long-cached chunks
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'gsap', test: /node_modules[\\/]gsap/ },
          ],
        },
      },
    },
  },
});

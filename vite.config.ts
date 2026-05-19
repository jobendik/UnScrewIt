import { defineConfig } from 'vite';

/**
 * Vite configuration.
 *
 * The `base` defaults to `/unscrewit/` so GitHub Pages serves the build at
 * `https://<user>.github.io/unscrewit/`. Override with the env var
 * `VITE_BASE_PATH=/` for root deploys (e.g. CrazyGames upload, custom domain).
 */
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? '/unscrewit/',

  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: mode !== 'production',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Single bundle for simpler CrazyGames packaging later.
        manualChunks: undefined,
      },
    },
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },

  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },

  preview: {
    host: true,
    port: 4173,
  },
}));

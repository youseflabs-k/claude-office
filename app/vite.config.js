import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  // `npm run dev` talks to the Claude server on 7878 for live session data.
  // In a build our own server serves this app and the API from one origin.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:7878', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    // public/ is committed and served directly, so the build does not need a
    // second copy of 14MB of models inside dist/.
    copyPublicDir: false,
    // The built app is committed and shipped; maps would triple its size.
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } }
    }
  }
});

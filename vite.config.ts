import { defineConfig } from 'vite';

const inferenceProxy = {
  '/inference': {
    target: 'https://opencode.ai',
    changeOrigin: true,
    headers: {
      'user-agent': 'spider/0.1',
      'x-opencode-session': 'spider-local-dev',
    },
  },
};

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: inferenceProxy,
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: inferenceProxy,
  },
});

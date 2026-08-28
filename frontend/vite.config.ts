import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  base: './',
  plugins: [react(), tailwindcss()],
  // deepagents/browser transitively loads picomatch, which reads these Node
  // constants during module initialization. Replace them with static browser
  // values so the WebView bundle can mount without a Node global.
  define: {
    'process.platform': JSON.stringify('browser'),
    'process.version': JSON.stringify('v20.0.0'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));

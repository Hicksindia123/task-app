import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // Use relative or repository base path for seamless GitHub Pages hosting
    base: env.VITE_BASE_PATH || './',
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});

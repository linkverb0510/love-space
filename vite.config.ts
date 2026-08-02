import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    // GitHub Pages serves project sites below /<repository>/; other hosts use /.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    // The temporary preview tunnel forwards its own Host header to Vite.
    server: { allowedHosts: ['.lhr.life', '.loca.lt'] },
    preview: { allowedHosts: ['.lhr.life', '.loca.lt'] }
  };
});

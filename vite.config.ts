import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export function parseAllowedHosts(raw: string | undefined): string[] | true | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.toLowerCase() === 'true') {
    return true;
  }
  const hosts = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return hosts.length > 0 ? [...new Set(hosts)] : undefined;
}

const apiTarget = process.env.MIO_API_ORIGIN ?? 'http://127.0.0.1:4310';
const allowedHosts = parseAllowedHosts(process.env.MIO_ALLOWED_HOSTS);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4330,
    strictPort: true,
    ...(allowedHosts !== undefined ? { allowedHosts } : {}),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4330,
    ...(allowedHosts !== undefined ? { allowedHosts } : {}),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
});

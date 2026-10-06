import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` outside Docker: proxy API + websockets to a locally running backend.
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
});

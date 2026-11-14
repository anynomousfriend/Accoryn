import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { demoDirectoryPlugin } from './server/demo-directory.ts';

// `npm run dev:lan` serves HTTPS on the local network with a self-signed
// certificate so phones can grant camera/microphone access during manual tests.
const lanHttps = process.env.ACCORYN_LAN_HTTPS === '1';

export default defineConfig({
  plugins: [demoDirectoryPlugin(), react(), tailwindcss(), ...(lanHttps ? [basicSsl()] : [])],
  server: { port: 5173, strictPort: true },
  // Pre-bundle engine dependencies so a cold dev server does not reload pages
  // mid-test when it first discovers them.
  optimizeDeps: {
    include: ['@huggingface/transformers', 'ggwave', 'near-api-js', '@noble/curves/ed25519.js', '@noble/hashes/sha2.js', '@noble/hashes/utils.js'],
  },
});

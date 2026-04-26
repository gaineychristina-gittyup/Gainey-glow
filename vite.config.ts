import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When deploying to GitHub Pages at https://<user>.github.io/Gainey-glow/
// the build needs base="/Gainey-glow/". The deploy workflow sets
// VITE_BASE_PATH; locally it falls back to "/".
declare const process: { env: Record<string, string | undefined> };
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  plugins: [react()],
  base,
});

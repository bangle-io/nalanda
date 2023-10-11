import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // exclude: ["@nalanda/react"],
    // include: ["use-sync-external-store"],
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/MDRxAIAct/' : '/',
  server: {
    host: "localhost",
    port: 8080,
    // Without these ignores, Vite tries to watch the dataset_collection/ tree
    // (tens of thousands of training images + venv) and exhausts the inotify
    // watcher limit (ENOSPC), which silently breaks HMR.
    watch: {
      ignored: [
        '**/dataset_collection/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
    proxy: {
      '/api/models': {
        // Dev inference target. Defaults to the live GCP-VM backend over
        // HTTPS so `npm run dev` works anywhere (no local model server
        // needed). Override with INFERENCE_TARGET=http://localhost:8000 if
        // you run the backend yourself.
        target: process.env.INFERENCE_TARGET || 'https://35.210.194.145.nip.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying to local inference server:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Inference server response:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase chunk size warning limit for large 3D models
    chunkSizeWarningLimit: 25000, // 25MB
  },
  optimizeDeps: {
    // Exclude three.js related packages from pre-bundling for better performance
    exclude: ['three', '@react-three/fiber', '@react-three/drei'],
  },
}));

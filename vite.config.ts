import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "localhost",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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

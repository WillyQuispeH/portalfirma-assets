// Compila la interfaz en React (src/ui) a un solo archivo que index.html carga
// como un script más: src/renderer/react/react-ui.js (+ react-ui.css).
// No se usa servidor de desarrollo: Electron abre index.html desde el disco
// (file://) y la CSP solo permite scripts locales ('self').
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const dev = mode === 'development';
  return {
    plugins: [react(), tailwindcss()], // Tailwind: ver src/ui/styles/globals.css
    // En modo librería Vite no reemplaza process.env.NODE_ENV por su cuenta.
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    build: {
      outDir: 'src/renderer/react',
      emptyOutDir: true,
      minify: !dev,
      sourcemap: dev ? 'inline' : false,
      lib: {
        entry: 'src/ui/index.tsx',
        formats: ['iife'],
        name: 'ReactUI',
        fileName: () => 'react-ui.js',
        cssFileName: 'react-ui',
      },
    },
  };
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Publicado no GitHub Pages em https://gente-emais.github.io/avaliacao-de-desempenho/
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE ?? '/avaliacao-de-desempenho/' })

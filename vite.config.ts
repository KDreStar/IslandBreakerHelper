import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  base: './', // 💡 상대 경로로 설정하여 GitHub Pages 서브 경로 문제 방지
});
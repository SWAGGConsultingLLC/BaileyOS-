import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { cyanx: '#22d3ee', goldx: '#facc15' } } },
  plugins: []
} satisfies Config;

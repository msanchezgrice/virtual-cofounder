import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#3B82F6',
        'dark-gray': '#1F2937',
        'light-gray': '#F3F4F6',
        'critical-red': '#EF4444',
        'high-yellow': '#F59E0B',
        'healthy-green': '#10B981',
      },
    },
  },
  plugins: [],
}
export default config

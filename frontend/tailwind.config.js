/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Manager portal - indigo/slate (data-dense, professional)
        manager: {
          50: '#eef2ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        },
        // Tenant portal - blue/teal (friendly, mobile-first)
        tenant: {
          50: '#f0fdfa',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
        },
        // Owner portal - green (wealth, growth)
        owner: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        // Vendor portal - amber (work, action)
        vendor: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

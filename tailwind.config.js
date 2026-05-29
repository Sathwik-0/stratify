/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FAEDD9',
        'cream-dark': '#F5E4C8',
        charcoal: '#080303',
        'charcoal-light': '#2A2020',
        red: '#E8441F',
        'red-dark': '#C63528',
        'red-light': '#FF6B47',
        muted: '#8A7A72',
        'muted-light': '#C4B5AB',
        border: 'rgba(8,3,3,0.10)',
        'border-strong': 'rgba(8,3,3,0.18)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'draw-line': 'drawLine 1s ease-out forwards',
        'count-up': 'countUp 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'shimmer': 'shimmer 1.5s infinite',
        'crawl': 'crawl 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.3, transform: 'scale(0.8)' },
        },
        drawLine: {
          from: { strokeDashoffset: '1000' },
          to: { strokeDashoffset: '0' },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(20px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        crawl: {
          '0%': { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
}

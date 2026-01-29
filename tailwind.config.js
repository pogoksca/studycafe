/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ios-blue': '#007AFF',
        'ios-indigo': '#5856D6',
        'ios-emerald': '#34C759',
        'ios-rose': '#FF3B30',
        'ios-amber': '#FF9500',
        'ios-gray': '#8E8E93',
      }
    },
  },
  plugins: [],
}

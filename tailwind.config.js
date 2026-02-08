/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        'paper-bg': '#f5f0e1',      // 核心纸张底色
        'paper-bg-dark': '#e8e0cc', // 较深纸张色
        'ink-black': '#1a1a1a',     // 深黑油墨
        'ink-dark': '#2c2c2c',      // 偏黑油墨
        'ink-gray': '#555555',      // 灰色油墨
        'ink-light': '#888888',     // 浅灰油墨
        'rule-color': '#333333',    // 分割线深色
        'rule-light': '#aaaaaa',    // 分割线浅色
        'accent-red': '#8b0000',    // 强调红
        'accent-red-light': '#a52a2a', // 浅红
        'link-color': '#1a3a5c',    // 链接蓝
      },
      fontFamily: {
        title: ['"Ma Shan Zheng"', '"STSong"', '"SimSun"', 'serif'],
        heading: ['"Noto Serif SC"', '"STSong"', '"SimSun"', 'serif'],
        body: ['"Noto Serif SC"', '"STSong"', '"SimSun"', 'Georgia', 'serif'],
        mono: ['"Courier New"', 'monospace'],
      },
      backgroundImage: {
        'paper-texture': "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(139, 119, 80, 0.03) 3px, rgba(139, 119, 80, 0.03) 4px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(139, 119, 80, 0.02) 5px, rgba(139, 119, 80, 0.02) 6px)",
      },
      boxShadow: {
        'paper': '0 1px 4px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1), inset 0 0 80px rgba(139, 119, 80, 0.08)',
        'polaroid': '2px 2px 5px rgba(0,0,0,0.1)',
        'polaroid-hover': '0 5px 15px rgba(0,0,0,0.2)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

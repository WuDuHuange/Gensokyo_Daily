/** @type {import('tailwindcss').Config} */

// 所有语义色都指向 CSS 变量，变量在 css/input.css 里按主题（日刊 / 夜读）分别定义。
// 写成 `rgb(var(--x) / <alpha-value>)` 是为了让 bg-ink-dark/90 这类透明度修饰符继续可用。
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        'page-bg': token('--c-page-bg'),           // 桌面/页面底色
        'paper-bg': token('--c-paper-bg'),         // 核心纸张底色
        'paper-bg-dark': token('--c-paper-bg-dark'), // 较深纸张色
        'ink-black': token('--c-ink-black'),       // 深黑油墨
        'ink-dark': token('--c-ink-dark'),         // 偏黑油墨
        'ink-gray': token('--c-ink-gray'),         // 灰色油墨
        'ink-light': token('--c-ink-light'),       // 浅灰油墨
        'rule-color': token('--c-rule-color'),     // 分割线深色
        'rule-light': token('--c-rule-light'),     // 分割线浅色
        'accent-red': token('--c-accent-red'),     // 强调红
        'accent-red-light': token('--c-accent-red-light'), // 浅红
        'link-color': token('--c-link-color'),     // 链接蓝
      },
      fontFamily: {
        title: ['"Ma Shan Zheng"', '"STSong"', '"SimSun"', 'serif'],
        heading: ['"Noto Serif SC"', '"STSong"', '"SimSun"', 'serif'],
        body: ['"Noto Serif SC"', '"STSong"', '"SimSun"', 'Georgia', 'serif'],
        mono: ['"Courier New"', 'monospace'],
      },
      // 经典大报的字号阶梯。
      // 关键点：层级之间的差距要拉得足够开——旧版头条 2xl(24px) 到正文 base(16px)
      // 只差 1.5 倍，几十条新闻看起来是等权重的，版面没有重点。
      // 注意：只保留真正被使用的档位。定义了却零调用的会被 Tailwind purge 掉，
      // 变成 config 里的死配置（头条那种超大字号写在 .lead-story__title 里更内聚）。
      fontSize: {
        section: ['1.6rem', { lineHeight: '1.2', letterSpacing: '0.01em' }],
        brief: ['0.9375rem', { lineHeight: '1.55' }],
        meta: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.05em' }],
      },
      backgroundImage: {
        // 纸张纤维纹理：颜色也走变量，否则夜读模式下会看不见
        'paper-texture': "repeating-linear-gradient(0deg, transparent, transparent 3px, rgb(var(--c-fiber) / 0.03) 3px, rgb(var(--c-fiber) / 0.03) 4px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgb(var(--c-fiber) / 0.02) 5px, rgb(var(--c-fiber) / 0.02) 6px)",
      },
      boxShadow: {
        // 阴影同样走变量：夜间纸张的投影要更重才立得住
        'paper': 'var(--shadow-paper)',
        'polaroid': 'var(--shadow-polaroid)',
        'polaroid-hover': 'var(--shadow-polaroid-hover)',
      },
      transitionTimingFunction: {
        // 墨迹落定：快速起步、长尾收束
        'ink': 'cubic-bezier(0.16, 1, 0.3, 1)',
        // 按压回弹：轻微过冲，只用在首屏与交互反馈
        'press': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

/** @type {import('tailwindcss').Config} */

// 所有语义色都指向 CSS 变量，变量在 css/input.css 里按主题（日刊 / 夜读）分别定义。
// 写成 `rgb(var(--x) / <alpha-value>)` 是为了让 bg-ink-dark/90 这类透明度修饰符继续可用。
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  theme: {
    extend: {
      // 2026-09-29 收敛：13 个色键 → 7 个，只剩「墨」「朱」两个色相。
      // 命名与 css/input.css 的 :root 令牌一一对应，中间不再有「名字对不上」的映射层。
      // 分割线不再占独立色键：直接写 border-ink/12、border-ink/25 这类透明度派生，
      // 日间墨深 → 压出浅褐线，夜间墨浅 → 自动变亮线，无需两套值。
      colors: {
        page: token('--c-page'),        // 桌面 / 页面底色
        paper: token('--c-paper'),      // 核心纸张底色
        'paper-2': token('--c-paper-2'),// 次级纸面（天气带、卡片底）
        ink: token('--c-ink'),          // 主墨：标题 / 正文
        'ink-2': token('--c-ink-2'),    // 次级墨：摘要 / 次要正文
        'ink-3': token('--c-ink-3'),    // 三级墨：元信息 / 来源（AA 正文线 4.96:1）
        seal: token('--c-seal'),        // 朱印：标记 / 链接 / 强调（全站唯一强调色）
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
        'paper-texture': "repeating-linear-gradient(0deg, transparent, transparent 3px, rgb(var(--c-ink-3) / 0.03) 3px, rgb(var(--c-ink-3) / 0.03) 4px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgb(var(--c-ink-3) / 0.02) 5px, rgb(var(--c-ink-3) / 0.02) 6px)",
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

# 幻想乡日报 🗞️ Gensokyo Daily

> **射命丸文主编** — 聚合东方 Project 官方消息与社区热点的自动化新闻日报。

![Newspaper Style](https://img.shields.io/badge/style-newspaper-8B4513)
![Touhou](https://img.shields.io/badge/touhou-project-red)
![GitHub Actions](https://img.shields.io/badge/automation-GitHub%20Actions-blue)

---

## 📰 项目简介

**幻想乡日报**是一个自动化的东方 Project 新闻聚合网站,采用"报纸"视觉风格,将来自不同平台的东方相关内容整合为一份每日更新的电子日报。

### 板块设置

| 板块 | 内容 | 数据源 |
|------|------|--------|
| 📰 头版头条 | ZUN 官方推文、新作发布 | 东方官方站, ZUN Twitter, Steam |
| 📺 社会·民生 | B站热门视频、Reddit 讨论 | Bilibili, Reddit r/touhou |
| 🎨 艺术·副刊 | Pixiv 日榜、NicoNico 新作 | Pixiv, NicoNico |
| 📋 分类广告 | 虚构的幻想乡广告 | 内置数据 |
| 🌤️ 天气预报 | 博丽神社、红魔馆等地天气 | 随机生成（虚构） |

---

## 🏗️ 技术架构

```
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐
│   RSSHub 实例    │────▶│  fetch_news  │────▶│ news_data.json│
│ (Vercel 部署)    │     │  (Python)    │     │  (数据文件)    │
└─────────────────┘     └──────────────┘     └───────┬───────┘
                              ▲                       │
                              │                       ▼
                    ┌─────────┴────────┐     ┌───────────────┐
                    │  GitHub Actions  │     │  index.html   │
                    │  (每小时定时)     │     │  (静态前端)    │
                    └──────────────────┘     └───────────────┘
```

- **数据层**: RSSHub 将各平台内容转为统一 RSS 格式
- **后端层**: Python 脚本定时抓取、清洗、去重、保存为 JSON
- **自动化**: GitHub Actions 每小时运行一次,自动 commit 更新
- **前端层**: 纯静态 HTML/CSS/JS,从 JSON 文件读取数据渲染

---

## 🚀 快速开始

### 1. 部署 RSSHub（数据源）

点击 [RSSHub 官方仓库](https://github.com/DIYgod/RSSHub) 的 **Deploy to Vercel** 按钮,获得你自己的 RSSHub 实例。

### 2. Fork 本仓库

```bash
git clone https://github.com/YOUR_USERNAME/Gensokyo_Daily.git
cd Gensokyo_Daily
```

### 3. 配置 RSSHub 地址

在 GitHub 仓库的 **Settings → Secrets → Actions** 中添加：

| Secret 名称 | 值 |
|---|---|
| `RSSHUB_BASE` | `https://your-rsshub.vercel.app` |

### 4. 启用 GitHub Pages

**Settings → Pages → Source** 选择 `main` 分支,目录选 `/ (root)`。

### 5. 本地测试

```bash
# 抓数据
pip install -r requirements.txt
python fetch_news.py

# 构建样式（改了 css/input.css 之后必须重新跑，否则页面拿到的还是旧产物）
npm install
npm run build        # 或 npm run watch 开着监听

# 起本地服务
python -m http.server 8000
# 打开 http://localhost:8000
```

> 直接双击 `index.html` 也能看，但 `file://` 下 `fetch` 会被浏览器拦掉，
> 页面会退回到内置的演示数据。

---

## 📁 项目结构

```
Gensokyo_Daily/
├── .github/
│   └── workflows/
│       └── update_news.yml    # GitHub Actions 定时任务
├── css/
│   ├── input.css              # Tailwind 源样式（改这个）
│   └── output.css             # 构建产物，被页面引用，勿手改
├── js/
│   ├── app.js                 # 前端渲染脚本
│   └── motion.js              # 动效系统（首屏/滚动/交互/无障碍兜底）
├── index.html                 # 主页面
├── fetch_news.py              # 新闻抓取脚本
├── tailwind.config.js         # Tailwind 配置（语义色令牌）
├── package.json               # 构建脚本
├── requirements.txt           # Python 依赖
├── news_data.json             # 新闻数据（自动生成，勿手改）
├── .gitignore
└── README.md
```

---

## 🎨 视觉特色

- **纸张质感**: 微黄背景 + 纤维纹理模拟
- **多栏布局**: CSS multi-column 实现传统报纸分栏
- **黑白滤镜**: 图片默认灰度,悬停恢复彩色
- **衬线字体**: Noto Serif SC + Ma Shan Zheng 书法体
- **首字下沉**: 头条无配图时改用单栏大标题 + 首字下沉
- **宝丽来副刊**: 图片卡片随机微倾，悬停「拿起」
- **虚构广告**: 河童重工、永远亭药局、香霖堂等
- **天气预报**: 博丽神社、红魔馆、白玉楼等虚构地点

### 动效

按触发时机分四层，实现见 `js/motion.js`：

| 层 | 内容 |
|---|---|
| 首屏 | 报纸拆封展开、报头油墨落定、装饰墨线展开、天气卡苏醒 |
| 滚动 | 卡片错峰入场、图片解码后淡入、顶部卷轴进度 |
| 交互 | 卡片抬升、宝丽来「拿起」、回到报头 |
| 兜底 | `prefers-reduced-motion` 下全部降级为直接显示 |

入场类统一挂在 `html.js` 之下（渐进增强）：脚本失效时内容直接可见，不会白屏。

### 夜读模式

右下角工具坞可切换「日刊 / 夜读」。夜读为深褐纸 + 米黄油墨，避免纯黑纯白造成眩光，
选择记入 `localStorage`。默认不跟随系统深色自动翻转。

全部颜色走 CSS 变量，定义在 `css/input.css` 的 `:root`（日刊）与 `body.night`（夜读）。
新增颜色需同时改 `tailwind.config.js` 的 token 和这两套变量。

---

## ⚙️ 配置说明

在 `fetch_news.py` 中可以调整：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MAX_ITEMS_PER_CATEGORY` | 50 | 每个分类最多保留条目数 |
| `MAX_AGE_DAYS` | 30 | 数据保留天数 |
| `REQUEST_TIMEOUT` | 30 | 请求超时秒数 |
| `RSSHUB_BASE` | `https://rsshub.app` | RSSHub 实例地址 |

前端每栏最多显示的条目数在 `js/app.js` 的 `MAX_DISPLAY` 里：

| 栏目 | 上限 | 原因 |
|------|------|------|
| `official` | 10 | 头版不宜过长 |
| `community` | 15 | 纯文字，单条高度小但总量多 |
| `art` | 40 | 图片区多多益善，用来撑起页面 |

---

## 📜 许可与声明

- 本项目仅做新闻**索引与摘要**,不存储第三方版权内容
- 点击链接跳转至原始平台,尊重原创者权益
- 东方 Project 版权归 ZUN / 上海爱丽丝幻乐团所有
- 本项目为粉丝作品,与官方无关

---

<p align="center">
  <strong>文 々。新聞</strong><br/>
  <em>鸦天狗印刷所 · 妖怪山第九号洞穴</em>
</p>

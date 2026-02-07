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
pip install -r requirements.txt
python fetch_news.py
# 然后用浏览器打开 index.html
```

---

## 📁 项目结构

```
Gensokyo_Daily/
├── .github/
│   └── workflows/
│       └── update_news.yml    # GitHub Actions 定时任务
├── css/
│   └── style.css              # 报纸风格样式
├── js/
│   └── app.js                 # 前端渲染脚本
├── index.html                 # 主页面
├── fetch_news.py              # 新闻抓取脚本
├── requirements.txt           # Python 依赖
├── news_data.json             # 新闻数据（自动生成）
├── .gitignore
└── README.md
```

---

## 🎨 视觉特色

- **纸张质感**: 微黄背景 + 纤维纹理模拟
- **多栏布局**: CSS column-count 实现传统报纸分栏
- **黑白滤镜**: 图片默认灰度,悬停恢复彩色
- **衬线字体**: Noto Serif SC + Ma Shan Zheng 书法体
- **虚构广告**: 河童重工、永远亭药局、香霖堂等
- **天气预报**: 博丽神社、红魔馆、白玉楼等虚构地点

---

## ⚙️ 配置说明

在 `fetch_news.py` 中可以调整：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MAX_ITEMS_PER_CATEGORY` | 50 | 每个分类最多保留条目数 |
| `MAX_AGE_DAYS` | 30 | 数据保留天数 |
| `REQUEST_TIMEOUT` | 30 | 请求超时秒数 |
| `RSSHUB_BASE` | `https://rsshub.app` | RSSHub 实例地址 |

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

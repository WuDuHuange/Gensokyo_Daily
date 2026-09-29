/**
 * 幻想乡日报 — 前端渲染脚本
 * Gensokyo Daily — Frontend Renderer
 *
 * 从 news_data.json 加载数据并渲染成报纸版面。
 */

(function () {
  'use strict';

  // ============ 配置 ============
  const DATA_URL = 'news_data.json';

  // ============ DOM 引用 ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============ 音效系统 ============
  const SoundManager = {
    enabled: false,
    ctx: null,

    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not available');
      }
    },

    /** 相机快门音效 — 模拟短促的机械快门声 */
    playShutter() {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // 短促噪声 burst
      const bufLen = ctx.sampleRate * 0.06;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      // 高通滤波 — 让声音更"脆"
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(hp).connect(gain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.06);

      // 第二声轻微回响（模拟机械回弹）
      setTimeout(() => {
        if (!this.ctx) return;
        const buf2 = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
        const data2 = buf2.getChannelData(0);
        for (let i = 0; i < buf2.length; i++) {
          data2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / buf2.length, 5);
        }
        const n2 = ctx.createBufferSource();
        n2.buffer = buf2;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.15, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
        n2.connect(hp.constructor === BiquadFilterNode ? g2 : g2).connect(ctx.destination);
        const hp2 = ctx.createBiquadFilter();
        hp2.type = 'highpass';
        hp2.frequency.value = 3000;
        n2.disconnect();
        n2.connect(hp2).connect(g2).connect(ctx.destination);
        n2.start(ctx.currentTime);
        n2.stop(ctx.currentTime + 0.03);
      }, 80);
    },

    /** 纸张翻动音效 — 模拟柔和的纸张摩擦声 */
    playPaperRustle() {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const duration = 0.25;

      const bufLen = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);

      // Brown noise (低频为主的柔和噪声)
      let last = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        // 包络：先强后弱
        const env = Math.sin(Math.PI * i / bufLen) * 0.8;
        data[i] = last * env * 12;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buf;

      // 带通滤波 — 纸张沙沙声特征频率
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3500;
      bp.Q.value = 0.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      noise.connect(bp).connect(gain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + duration);
    },
  };

  // ============ 工具函数 ============

  /**
   * 格式化日期为报纸风格
   */
  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      const weekday = weekdays[d.getDay()];
      return `${year}年${month}月${day}日（${weekday}）`;
    } catch {
      return isoStr;
    }
  }

  /**
   * 格式化相对时间
   */
  function timeAgo(isoStr) {
    if (!isoStr) return '';
    try {
      const now = new Date();
      const then = new Date(isoStr);
      const diffMs = now - then;
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin}分钟前`;
      if (diffHr < 24) return `${diffHr}小时前`;
      if (diffDay < 30) return `${diffDay}天前`;
      return formatDate(isoStr);
    } catch {
      return '';
    }
  }

  /** 常见命名实体表 —— 只列数据源里真实出现过的，不做全量 HTML5 实体表 */
  const NAMED_ENTITIES = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    mdash: '—', ndash: '–', middot: '·', bull: '•', times: '×',
    copy: '©', reg: '®', trade: '™', deg: '°', laquo: '«', raquo: '»',
  };

  /**
   * 解码 HTML 实体
   *
   * 抓取侧（fetch_news.py 的 clean_html）已于 2026-09-29 补上 html.unescape()，
   * 但**已经生成的 news_data.json 里仍留有旧实体**，要等下一轮 Actions 覆盖才会消失。
   * 这里做一次幂等兜底：已解码的文本再解一次不会有任何变化。
   *
   * 实测（2026-09-29）：115 条里 51 条（44%）的 title/summary 含 `&#160;`
   * `&#8220;` `&#8230;`，不解码就会以字面量显示在版面上。
   */
  function decodeEntities(str) {
    if (!str) return '';
    return String(str)
      .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
        const cp = parseInt(hex, 16);
        return cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m;
      })
      .replace(/&#(\d+);/g, (m, dec) => {
        const cp = parseInt(dec, 10);
        return cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m;
      })
      .replace(/&([a-zA-Z]+);/g, (m, name) => {
        const key = name.toLowerCase();
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
          ? NAMED_ENTITIES[key]
          : m;
      })
      // &#160; 解出的 U+00A0 在中文行内会表现为"吞掉空格"，统一成普通空格
      .replace(/\u00a0/g, ' ');
  }

  /**
   * 转义 HTML
   *
   * 先解码再转义：数据源里的实体是"源文本的编码"，不是"要显示的文字"。
   * 转义改用正则而非 div.textContent/innerHTML —— 后者只处理 & < >，
   * 不会转义引号，而本函数的结果大量用在 `href="${...}"` / `alt="${...}"`
   * 这类属性上下文里，引号不转义就有截断属性的风险。
   */
  function escapeHtml(str) {
    if (!str) return '';
    return decodeEntities(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 截断文本
   */
  function truncate(str, maxLen = 120) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '…';
  }

  // ============ 副刊图片的 tag 工具 ============

  /**
   * 通用 tag —— 几乎每张图上都有，对「区分两张图是不是同一个角色/同一个画师」
   * 没有任何信息量。展示和去重都跳过。
   */
  const GENERIC_TAGS = new Set([
    '1girl', '2girls', '3girls', '4girls', '1other',
    'absurdres', 'highres', 'commentary_request', 'translated',
    'artist_name', 'chibi', 'chibi_only',
  ]);

  /**
   * 从 Safebooru 的 summary 里解析 tag 列表。
   *
   * ⚠️ 这里踩过两个坑：
   *
   * 1. tag 之间是**空格**分隔，不是逗号。旧代码写的是 `split(',')`，于是
   *    「仅取前 3 个 tag」从来没生效过 —— tagList 永远只有 1 个元素（整条字符串），
   *    `slice(0, 3)` 等于没切。卡片下面那一长串 tag 实际是被 CSS 的
   *    `line-clamp-2` 截的，不是被这段 JS 截的。
   *
   * 2. 抓取侧（fetch_news.py）把 tag 截到 50 字符再加 "..."，所以**最后一个
   *    tag 一定是半截词**（如 `comm...` ← commentary_request）。判到结尾的 "..."
   *    就把最后一项丢掉，否则会显示出残缺的 tag。
   */
  function parseArtTags(summary) {
    const raw = String(summary || '').replace(/^Tags:\s*/, '').trim();
    if (!raw) return [];
    const cutOff = raw.endsWith('...');
    const list = raw.replace(/\.\.\.$/, '').split(/[\s,]+/).filter(Boolean);
    if (cutOff && list.length) list.pop();
    return list.filter((t) => !GENERIC_TAGS.has(t.toLowerCase()));
  }

  /** 集合的 Jaccard 相似度（交集 / 并集） */
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) {
      if (b.has(t)) inter++;
    }
    return inter / (a.size + b.size - inter);
  }

  /**
   * 相似度阈值。两个条目的 tag 集合 Jaccard ≥ 此值即视为「同一张图」。
   *
   * ⚠️ 0.45 是针对**当前 tag 长度**调的：抓取侧截到 50 字符 → 每条约 6~8 个 tag。
   *    实测该数据下 0.40 / 0.45 / 0.50 结果一致，0.55 起会漏掉重复项，所以取中间偏保守的 0.45。
   *    若以后放宽抓取侧的截断长度，tag 集合变长会**稀释** Jaccard，这个阈值必须重调 ——
   *    否则去重会静默失效（实测 tag 数从 ~7 涨到 ~25 时，同一对近似图的 Jaccard
   *    会从 0.57 掉到 0.2 以下，等于完全不生效）。
   */
  const ART_SIMILARITY_THRESHOLD = 0.45;

  /**
   * 从候选里挑出视觉上不重复的 n 张图。
   *
   * 背景：Safebooru 按 `tags=touhou` 抓，返回的是**同一批画师、同一角色的连号图**。
   * 直接取前 12 条会得到好几张同角色的近亲裁切 ——
   * 2026-09-29 实测 No.7184980 / 7185025 / 7185026 三张都是同一个蓝发角色，
   * 12 格里视觉上像「单一角色图库」，而不是副刊剪报。
   */
  function pickDiverseArt(items, count) {
    const kept = [];
    for (const item of items) {
      if (!item.image) continue;
      const tags = new Set(parseArtTags(item.summary));
      const dup = kept.some((k) => jaccard(tags, k.tags) >= ART_SIMILARITY_THRESHOLD);
      if (!dup) kept.push({ item, tags });
      if (kept.length >= count) break;
    }
    return kept.map((k) => k.item);
  }

  // ============ 渲染函数 ============

  /**
   * 渲染报头信息
   */
  function renderMasthead(meta) {
    if (!meta) return;
    const editionDate = $('#edition-date');
    if (editionDate) {
      editionDate.textContent = meta.edition || '';
    }

    const lastUpdated = $('#last-updated');
    if (lastUpdated && meta.updated_at) {
      lastUpdated.textContent = `最后更新：${formatDate(meta.updated_at)}`;
    }
  }

  /**
   * 根据天气条件返回动画 CSS 类名
   *
   * 判定顺序 = 特征具体度，不能按"常见度"排：
   *   「弹幕暴风」同时含「弹幕」与「暴」，「暴风雪」同时含「暴」与「雪」。
   *   若把「暴」放在前面，这两类会被 storm 截胡，anomaly / snow 变成永远
   *   跑不到的死分支（CSS 里那两套动画也就白写了）。
   */
  function getWeatherAnimClass(condition) {
    if (!condition) return '';
    const c = condition.toLowerCase();
    if (c.includes('异变') || c.includes('弹幕')) return 'weather-anim-anomaly';
    if (c.includes('雪')) return 'weather-anim-snow';
    if (c.includes('晴') || c.includes('大暑')) return 'weather-anim-sunny';
    if (c.includes('雷') || c.includes('暴')) return 'weather-anim-storm';
    if (c.includes('雨')) return 'weather-anim-rain';
    if (c.includes('阴') || c.includes('雾') || c.includes('花粉') || c.includes('妖雾')) return 'weather-anim-cloudy';
    return 'weather-anim-cloudy'; // 默认呼吸效果
  }

  /**
   * 渲染天气栏
   *
   * 注意：`!weather.forecasts` 挡不住空数组（`![]` 为 false），
   * 空数组会一路走到 grid.innerHTML = ''，在版面上留一个 2px 高的空壳。
   * 所以这里显式判 length，无数据时连 #weather-bar 一起隐藏（同 renderAds 的做法）。
   */
  function renderWeather(weather) {
    const grid = $('#weather-grid');
    const headerWeather = $('#header-weather');
    const bar = $('#weather-bar');
    if (!grid) return;

    const forecasts = weather && Array.isArray(weather.forecasts) ? weather.forecasts : [];

    if (forecasts.length === 0) {
      grid.innerHTML = '';
      if (bar) bar.style.display = 'none';
      if (headerWeather) headerWeather.textContent = '';
      return;
    }
    if (bar) bar.style.display = '';

    grid.innerHTML = forecasts
      .map(
        (w) => `
      <div class="weather-strip__item ${getWeatherAnimClass(w.condition)}">
        <span class="weather-icon text-xl">${escapeHtml(w.icon)}</span>
        <span class="weather-location text-sm text-ink-black">${escapeHtml(w.location)}</span>
        <span class="weather-temp font-mono text-sm font-bold text-accent-red">${w.temperature}°C</span>
        <span class="weather-cond text-xs text-ink-gray">${escapeHtml(w.condition)}</span>
      </div>
    `
      )
      .join('');

    // 报头天气：取第一个
    if (headerWeather) {
      const first = forecasts[0];
      headerWeather.textContent = `${first.location} ${first.icon} ${first.temperature}°C`;
    }
  }

  /**
   * 创建新闻卡片 HTML
   *
   * 头条分两种排法：
   *   - 有配图 → 图左文右两栏
   *   - 无配图 → 单栏大标题 + 首字下沉
   * official 类目的数据源（ZUN 推文、官方站）本身不出图，15 条里 0 张图，
   * 如果一律套两栏布局，左列会整块空着。
   */
  function createNewsCard(item, variant = 'feature', opts = {}) {
    const hasImage = !!item.image;
    const title = escapeHtml(item.title);
    const source = escapeHtml(item.source);
    const icon = escapeHtml(item.source_icon);
    const href = escapeHtml(item.link);
    const time = timeAgo(item.published);
    const imgAttrs = `loading="lazy" decoding="async" data-img-fade referrerpolicy="no-referrer"`;

    // ---------- 头条：跨 8 栏，超大标题 ----------
    if (variant === 'lead') {
      const imageHtml = hasImage
        ? `
        <figure class="lead-story__figure">
          <img class="w-full h-full object-cover" src="${escapeHtml(item.image)}" alt="${title}" ${imgAttrs}
            onerror="this.parentElement.style.display='none'" />
          <figcaption class="lead-story__caption font-mono">${icon} ${source}</figcaption>
        </figure>`
        : '';

      return `
      <article class="lead-story ${hasImage ? 'lead-story--with-image' : ''}" data-reveal>
        <div class="lead-story__body">
          <h2 class="lead-story__title font-heading">
            <a href="${href}" target="_blank" rel="noopener noreferrer" class="news-title-link" data-news-link>${title}</a>
          </h2>
          <p class="lead-story__summary font-body">${escapeHtml(truncate(item.summary, 260))}</p>
          <div class="lead-story__meta font-mono">
            <span class="font-bold">${icon} ${source}</span>
            <span>${time}</span>
          </div>
        </div>
        ${imageHtml}
      </article>`;
    }

    // ---------- 简讯：一行式，只有标题 + 来源 ----------
    if (variant === 'brief') {
      // 来源标签只在「与上一条不同」时输出。同源条目会连着出现十几次
      // （实测「东方官方资讯站」重复 11 次），每条都挂一遍纯属噪声；
      // 连续同源共用一个标签，也是报纸简讯栏的常见做法。
      const sourceHtml =
        opts.showSource === false
          ? ''
          : `<span class="brief-item__source font-mono">${source}</span>`;
      return `
      <div class="brief-item" data-reveal>
        <span class="brief-item__mark" aria-hidden="true"></span>
        <a class="brief-item__title text-brief text-ink-black news-title-link" href="${href}" target="_blank" rel="noopener noreferrer" data-news-link>${title}</a>
        ${sourceHtml}
      </div>`;
    }

    // ---------- 要闻：中标题 + 一行摘要 ----------
    const imageHtml = hasImage
      ? `
      <div class="feature-story__figure">
        <img class="w-full h-full object-cover" src="${escapeHtml(item.image)}" alt="${title}" ${imgAttrs}
          onerror="this.parentElement.style.display='none'" />
      </div>`
      : '';

    return `
      <article class="feature-story ${hasImage ? 'feature-story--with-image' : ''}" data-reveal>
        ${imageHtml}
        <h3 class="feature-story__title font-heading">
          <a href="${href}" target="_blank" rel="noopener noreferrer" class="news-title-link" data-news-link>${title}</a>
        </h3>
        <p class="feature-story__summary font-body">${escapeHtml(truncate(item.summary, 110))}</p>
        <div class="feature-story__meta font-mono">
          <span>${icon} ${source}</span>
          <span>${time}</span>
        </div>
      </article>`;
  }

  /**
   * 创建艺术/图片卡片 HTML (Polaroid Style)
   *
   * 倾斜、抬升、阴影全部交给 css/input.css 的 .art-card 处理。
   * 这里刻意不再写 hover:scale / transition-all，否则会和
   * .art-card 的 rotate(var(--rot)) 打架，把错落感抹平。
   */
  function createArtCard(item, mediaClass = 'aspect-square') {
    // 标题优化: Safebooru: 12345 -> No.12345
    let displayTitle = item.title;
    if (displayTitle.includes('Safebooru:')) {
      displayTitle = displayTitle.replace('Safebooru:', 'No.');
    }

    // 标签：解析出真正的前 3 个 tag。
    // 旧代码用 `split(',')` 去切**空格分隔**的 tag 串，tagList 恒为 1 个元素，
    // 「仅取前 3 个」从来没生效过 —— 详见 parseArtTags 的注释。
    const parsedTags = parseArtTags(item.summary);
    const tags = parsedTags.length
      ? parsedTags.slice(0, 3).join(', ')
      : truncate(item.summary, 20);

    return `
      <div class="art-card p-3 pb-8 shadow-polaroid border border-gray-200 relative" data-reveal>
        <a href="${escapeHtml(item.link)}" class="block group" target="_blank" rel="noopener noreferrer">
          <div class="${mediaClass} overflow-hidden border border-gray-100 bg-gray-50 mb-3">
            <img
              class="w-full h-full object-cover filter saturate-[.88] opacity-95 transition-[filter,opacity] duration-500 group-hover:saturate-100 group-hover:opacity-100"
              src="${escapeHtml(item.image)}"
              alt="${escapeHtml(displayTitle)}"
              loading="lazy"
              decoding="async"
              data-img-fade
              referrerpolicy="no-referrer"
              onerror="this.parentElement.innerHTML='<span class=\'flex items-center justify-center h-full text-xs text-gray-400\'>Image Lost</span>'"
            />
          </div>
        </a>
        <div class="text-center font-mono">
          <span class="block font-bold text-ink-dark text-xs mb-0.5">${escapeHtml(displayTitle)}</span>
          <span class="block text-[0.6rem] text-ink-light italic line-clamp-2 leading-tight">${escapeHtml(tags)}</span>
        </div>
      </div>
    `;
  }

  /**
   * 渲染空状态
   */
  function renderEmptyState(message = '暂无新闻') {
    return `
      <div class="empty-state">
        <span class="empty-state__icon">📭</span>
        <p>${escapeHtml(message)}</p>
        <p style="font-size:0.75rem; margin-top:0.5rem;">
          射命丸文正在取材中，请稍后再来…
        </p>
      </div>
    `;
  }

  /**
   * 渲染一组简讯条目。
   *
   * 来源标签只在「与上一条不同」时输出：同源条目会连着出现十几次
   * （实测「东方官方资讯站」连出 11 条），每条都挂一遍纯属噪声。
   * 判据取文档顺序上的前一条，与多栏排版无关。
   */
  function renderBriefList(items, limit) {
    const list = typeof limit === 'number' ? items.slice(0, limit) : items;
    let prevSource = null;
    return list
      .map((it) => {
        const showSource = it.source !== prevSource;
        prevSource = it.source;
        return createNewsCard(it, 'brief', { showSource });
      })
      .join('');
  }

  /**
   * 渲染一个新闻分类
   */
  function renderCategory(categoryKey, categoryData, containerId) {
    const container = $(`#${containerId}`);
    if (!container) return;

    // 复制一份数据以免修改原始对象
    let items = categoryData?.items ? [...categoryData.items] : [];

    if (items.length === 0) {
      container.innerHTML = renderEmptyState();
      // 头版要闻为空时，「简讯」板块没有内容来源，要一并收起——
      // 否则页面上会留下一个孤零零的「简讯」抬头（同 renderAds 的处理）
      if (categoryKey === 'official') {
        const sec = $('#section-brief');
        if (sec) sec.style.display = 'none';
      }
      return;
    }

    // ---------- 副刊：剪报拼贴（12 张，不等宽） ----------
    // 旧版是 40 张等宽宝丽来（4 列 × 10 行），占了右栏几乎全部高度，
    // 是页面上最大的空间黑洞。现在收到 12 张，用 12 栏网格里不同跨栏数
    // 形成剪贴簿的错落感。
    if (categoryKey === 'art') {
      const CLIPPING_COUNT = 12;
      // 走「视觉去重」挑选，而不是直接取前 12 条 ——
      // Safebooru 返回的是同批画师同角色的连号图，前 12 条里会有好几张近似图。
      const picks = pickDiverseArt(items, CLIPPING_COUNT);
      if (picks.length === 0) {
        container.innerHTML = renderEmptyState('暂无画作');
        return;
      }
      // ⚠️ 跨栏数与宽高比都必须写成完整的类名字符串。Tailwind 靠**静态文本扫描**
      //    生成工具类，`md:col-span-${n}` 这种运行时拼接的类名扫不到，会静默失效 ——
      //    第一版就是这么写的，结果 12 张全部退化成等宽 4 列（只剩字面量 col-span-3 生效）。
      // 宽高比按列宽反推，让三种跨栏数的**渲染高度接近**（约 200px）：
      //    跨度 4 → 图宽 ≈357px → 16/9；跨度 3 → ≈257px → 9/7；跨度 2 → ≈157px → 11/14
      // 不这么做的话窄卡片只有一百多像素高，同一行会留下大片空白。
      const TILES = [
        { span: 'md:col-span-4', media: 'aspect-[16/9]' },
        { span: 'md:col-span-3', media: 'aspect-[9/7]' },
        { span: 'md:col-span-2', media: 'aspect-[11/14]' },
        { span: 'md:col-span-3', media: 'aspect-[9/7]' },
      ];
      container.innerHTML =
        '<div class="grid grid-cols-6 md:grid-cols-12 gap-4 md:gap-5 items-start">' +
        picks
          .map((it, i) => {
            const t = TILES[i % TILES.length];
            return `<div class="col-span-3 ${t.span}">${createArtCard(it, t.media)}</div>`;
          })
          .join('') +
        '</div>';
      return;
    }

    // ---------- 头版要闻：1 条头条 + 3 条要闻，其余全部转简讯 ----------
    // 这是「分层」的关键：只有前 4 条配得上大版面，剩下的压成一行式。
    if (categoryKey === 'official') {
      const LEAD = 1;
      const FEATURE = 3;

      const lead = items.slice(0, LEAD);
      const features = items.slice(LEAD, LEAD + FEATURE);
      // 剩余条目**全部**落到「简讯」。旧版这里写死 BRIEF = 6，
      // 15 条数据只喂出 6 条，三栏密排占不到半屏 ——
      // 简讯栏存在的理由（信息密度）没兑现，还白扔了 5 条。
      const briefs = items.slice(LEAD + FEATURE);

      let html = lead.map((it) => createNewsCard(it, 'lead')).join('');
      if (features.length) {
        html +=
          '<div class="feature-row">' +
          features.map((it) => createNewsCard(it, 'feature')).join('') +
          '</div>';
      }
      container.innerHTML = html;

      // 剩余条目落到「简讯」板块（容器在 index.html 里，独立于本 section）
      const briefBox = $('#container-brief');
      if (briefBox) {
        briefBox.innerHTML = renderBriefList(briefs);
        const sec = $('#section-brief');
        if (sec) sec.style.display = briefs.length ? '' : 'none';
      }
      return;
    }

    // ---------- 社会·民生：3 条带图卡 + 其余标题流 ----------
    // 旧版整个分类都走 brief（一行式），而 community 有 32/50 条带图，
    // 一张都没用上 —— 这是整页最平的一块，也是数据利用率最低的地方。
    if (categoryKey === 'community') {
      const CARD_COUNT = 3;
      const REST_COUNT = 18;

      const cards = items.filter((i) => i.image).slice(0, CARD_COUNT);
      const cardIds = new Set(cards.map((c) => c.id));
      const rest = items
        .filter((i) => !cardIds.has(i.id))
        .slice(0, REST_COUNT);

      let html = '';
      if (cards.length) {
        // feature-row--flush：去掉上边框与外边距，因为它现在位于容器顶部
        html +=
          '<div class="feature-row feature-row--flush">' +
          cards.map((it) => createNewsCard(it, 'feature')).join('') +
          '</div>';
      }
      html += '<div class="brief-grid">' + renderBriefList(rest) + '</div>';
      container.innerHTML = html;
      return;
    }

    // ---------- 其余分类：简讯栏（一行式，无摘要） ----------
    container.innerHTML = renderBriefList(items, 15);
  }

  /**
   * 渲染广告
   *
   * ads 为空时要连板块标题一起收起——否则页面上会留下一个孤零零的
   * 「分类广告 CLASSIFIEDS」抬头，下面什么都没有。
   */
  function renderAds(ads) {
    const grid = $('#ads-grid');
    const section = $('#section-ads');
    if (!grid) return;

    if (!ads || ads.length === 0) {
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    grid.innerHTML = ads
      .map(
        (ad) => `
      <div class="ad-card">
        <div class="ad-card__icon">${escapeHtml(ad.icon)}</div>
        <h3 class="ad-card__title">${escapeHtml(ad.title)}</h3>
        <p class="ad-card__subtitle">${escapeHtml(ad.subtitle)}</p>
        <p class="ad-card__description">${escapeHtml(ad.description)}</p>
        <p class="ad-card__contact">📍 ${escapeHtml(ad.contact)}</p>
      </div>
    `
      )
      .join('');
  }

  // ============ 加载逻辑 ============

  /**
   * 隐藏加载遮罩
   *
   * 实际收起动作交给 motion.js，因为它要保证遮罩至少展示一小段时间——
   * 本地读 JSON 只要几毫秒，「报纸拆封」动画会一闪而过、等于没做。
   */
  function hideLoading() {
    if (window.GD_MOTION && typeof window.GD_MOTION.dismissLoader === 'function') {
      window.GD_MOTION.dismissLoader();
      return;
    }
    // motion.js 未就绪时的兜底：直接收起
    const overlay = $('#loading-overlay');
    if (overlay) {
      overlay.classList.add('is-done');
      setTimeout(() => overlay.remove(), 700);
    }
  }

  /**
   * 使用示例数据填充（当 JSON 尚未生成时）
   */
  function useFallbackData() {
    const fallback = {
      meta: {
        title: '幻想乡日报',
        subtitle: 'Gensokyo Daily',
        edition: `第${new Date().toISOString().slice(0, 10).replace(/-/g, '')}期`,
        updated_at: new Date().toISOString(),
        generated_by: '射命丸文 & GitHub Actions',
      },
      categories: {
        official: {
          label: '头版头条',
          items: [
            {
              id: 'demo1',
              title: '【号外】ZUN 宣布东方 Project 最新作开发中',
              link: '#',
              summary:
                '上海爱丽丝幻乐团主催 ZUN 于今日在推特上透露，东方 Project 系列最新正作正在开发中。据悉新作将延续弹幕射击的传统玩法，同时加入全新的角色与故事线。博丽灵梦和雾雨魔理沙将继续作为可选机体登场。',
              image: null,
              source: 'ZUN 推特',
              source_icon: '🍺',
              priority: 1,
              // 示例数据使用固定的过去时间，避免每次打开页面都显示“刚刚”
              published: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            },
            {
              id: 'demo2',
              title: '第二十一届博丽神社例大祭日程公布',
              link: '#',
              summary:
                '一年一度的博丽神社例大祭即将到来，今年的举办地点依然在东京Big Sight。参展社团数量创历史新高。',
              image: null,
              source: '东方官方资讯站',
              source_icon: '📰',
              priority: 1,
              published: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
          count: 2,
        },
        community: {
          label: '社会·民生',
          items: [
            {
              id: 'demo3',
              title: '【东方】当灵梦决定认真工作时',
              link: '#',
              summary:
                'B站UP主制作的东方手书动画引发热议，视频发布三天播放量突破百万。',
              image: null,
              source: 'B站东方热门',
              source_icon: '📺',
              priority: 1,
              published: new Date(Date.now() - 7200000).toISOString(),
            },
            {
              id: 'demo4',
              title: 'Reddit 热议：你最喜欢的东方角色是谁？',
              link: '#',
              summary:
                'r/touhou 发起年度投票，琪露诺意外领先，帕秋莉紧随其后。',
              image: null,
              source: 'Reddit r/touhou',
              source_icon: '💬',
              priority: 2,
              published: new Date(Date.now() - 10800000).toISOString(),
            },
          ],
          count: 2,
        },
        art: {
          label: '艺术·副刊',
          items: [
            {
              id: 'demo5',
              title: 'Pixiv 日榜第一：「紅魔館の午後」',
              link: '#',
              summary:
                '画师 XXX 的红魔馆下午茶插画登顶 Pixiv 东方日榜，蕾米莉亚与咲夜的互动引发大量好评。',
              image: null,
              source: 'Pixiv 东方日榜',
              source_icon: '🎨',
              priority: 1,
              published: new Date(Date.now() - 14400000).toISOString(),
            },
          ],
          count: 1,
        },
      },
      weather: {
        updated: new Date().toISOString(),
        forecasts: [
          { location: '博丽神社', icon: '☀️', temperature: 22, condition: '晴' },
          { location: '人间之里', icon: '⛅', temperature: 20, condition: '多云' },
          { location: '红魔馆', icon: '🌅', temperature: 18, condition: '红雾' },
          { location: '白玉楼', icon: '🌸', temperature: 15, condition: '樱吹雪' },
          { location: '永远亭', icon: '🌫️', temperature: 19, condition: '妖雾' },
          { location: '守矢神社', icon: '☁️', temperature: 12, condition: '阴' },
          { location: '地灵殿', icon: '🌀', temperature: 30, condition: '弹幕暴风' },
          { location: '命莲寺', icon: '🌦️', temperature: 17, condition: '小雨' },
        ],
      },
      ads: [
        {
          id: 'ad_kappa',
          title: '河童重工 最新科技',
          subtitle: '光学迷彩、等离子炮、自动钓鱼机',
          description:
            '河城荷取领衔研发！妖怪山河童工业联合体，为您提供最前沿的幻想科技。',
          contact: '妖怪山瀑布旁 河童工坊',
          icon: '🔧',
        },
        {
          id: 'ad_eientei',
          title: '永远亭 特供药剂',
          subtitle: '八意永琳监制 · 蓬莱之药除外',
          description:
            '感冒灵、跌打丸、弹幕创伤速愈膏……月之头脑为您守护每一天的健康。',
          contact: '迷途竹林深处 永远亭药局',
          icon: '💊',
        },
        {
          id: 'ad_kourindou',
          title: '香霖堂 古道具店',
          subtitle: '森近霖之助 · 外界道具专营',
          description:
            '本店经营各类外界流入品：Game Boy、打火机、不明用途的塑料板……识货的客官请进。',
          contact: '魔法森林入口处',
          icon: '🏪',
        },
        {
          id: 'ad_moriya',
          title: '守矢神社 御守特卖',
          subtitle: '信仰充值 · 有求必应',
          description:
            '新年限定御守上架！学业成就、弹幕回避……诹访子大人亲自加持。',
          contact: '妖怪山山顶 守矢神社',
          icon: '⛩️',
        },
      ],
    };

    renderAll(fallback);
  }

  /**
   * 渲染所有内容
   */
  function renderAll(data) {
    // 报头
    renderMasthead(data.meta);

    // 天气
    renderWeather(data.weather);

    // 新闻分类
    const categories = data.categories || {};
    renderCategory('official', categories.official, 'container-official');
    renderCategory('community', categories.community, 'container-community');
    renderCategory('art', categories.art, 'container-art');

    // 广告
    renderAds(data.ads);

    // 隐藏加载
    hideLoading();

    // 播放快门音效（首次加载完成 — "咔嚓"）
    setTimeout(() => SoundManager.playShutter(), 300);
  }

  /**
   * 加载数据
   */
  async function loadData() {
    try {
      const resp = await fetch(DATA_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      renderAll(data);
    } catch (err) {
      console.warn('⚠ 无法加载 news_data.json，使用演示数据:', err.message);
      useFallbackData();
    }
  }

  // ============ 交互与音效绑定 ============

  /**
   * 初始化音效控制面板
   */
  function initAudioControls() {
    const btnToggle = $('#btn-sound-toggle');
    const btnAmbient = $('#btn-ambient-toggle');

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        SoundManager.init();
        SoundManager.enabled = !SoundManager.enabled;
        btnToggle.classList.toggle('active', SoundManager.enabled);

        // 图标和提示文字都在子节点里，不能用 textContent 整体替换，否则会抹掉 tooltip
        const icon = btnToggle.querySelector('.tool-btn__icon');
        if (icon) icon.textContent = SoundManager.enabled ? '🔊' : '🔇';

        const tip = btnToggle.querySelector('.tool-btn__tip');
        if (tip) tip.textContent = SoundManager.enabled ? '关闭音效' : '开启音效';
        btnToggle.setAttribute('aria-label', SoundManager.enabled ? '关闭音效' : '开启音效');

        // 显示/隐藏环境音按钮
        if (btnAmbient) {
          btnAmbient.style.display = SoundManager.enabled ? 'flex' : 'none';
        }

        // 开启时播放快门确认
        if (SoundManager.enabled) {
          SoundManager.playShutter();
        }
      });
    }

    if (btnAmbient) {
      let ambientPlaying = false;
      let ambientNodes = null;

      btnAmbient.addEventListener('click', () => {
        if (!SoundManager.ctx) return;
        if (!ambientPlaying) {
          // 创建轻微的环境白噪音（模拟竹林微风）
          const ctx = SoundManager.ctx;
          const bufLen = ctx.sampleRate * 2;
          const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
          const data = buf.getChannelData(0);
          let last = 0;
          for (let i = 0; i < bufLen; i++) {
            last = (last + 0.015 * (Math.random() * 2 - 1)) / 1.015;
            data[i] = last * 8;
          }
          const source = ctx.createBufferSource();
          source.buffer = buf;
          source.loop = true;

          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 800;

          const gain = ctx.createGain();
          gain.gain.value = 0.06;

          source.connect(lp).connect(gain).connect(ctx.destination);
          source.start();
          ambientNodes = { source, gain };
          ambientPlaying = true;
          btnAmbient.classList.add('active');
        } else {
          if (ambientNodes) {
            ambientNodes.source.stop();
            ambientNodes = null;
          }
          ambientPlaying = false;
          btnAmbient.classList.remove('active');
        }
      });
    }
  }

  /**
   * 初始化文章点击音效（事件委托）
   */
  function initArticleClickSounds() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-news-link]');
      if (link) {
        SoundManager.playPaperRustle();
      }
    });
  }

  // ============ 启动 ============
  document.addEventListener('DOMContentLoaded', () => {
    initAudioControls();
    initArticleClickSounds();
    loadData();
  });
})();

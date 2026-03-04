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

  /**
   * 转义 HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 截断文本
   */
  function truncate(str, maxLen = 120) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '…';
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
   */
  function getWeatherAnimClass(condition) {
    if (!condition) return '';
    const c = condition.toLowerCase();
    if (c.includes('晴') || c.includes('大暑')) return 'weather-anim-sunny';
    if (c.includes('雷') || c.includes('暴')) return 'weather-anim-storm';
    if (c.includes('雨')) return 'weather-anim-rain';
    if (c.includes('雪')) return 'weather-anim-snow';
    if (c.includes('异变') || c.includes('弹幕')) return 'weather-anim-anomaly';
    if (c.includes('阴') || c.includes('雾') || c.includes('花粉') || c.includes('妖雾')) return 'weather-anim-cloudy';
    return 'weather-anim-cloudy'; // 默认呼吸效果
  }

  /**
   * 渲染天气栏
   */
  function renderWeather(weather) {
    const grid = $('#weather-grid');
    const headerWeather = $('#header-weather');
    if (!grid || !weather || !weather.forecasts) return;

    grid.innerHTML = weather.forecasts
      .map(
        (w) => `
      <div class="weather-item p-3 border-r-2 border-b-2 border-ink-dark text-center last:border-r-0 ${getWeatherAnimClass(w.condition)}">
        <span class="weather-icon text-3xl block mb-1.5">${escapeHtml(w.icon)}</span>
        <span class="weather-location font-black text-sm text-ink-black block tracking-wide">${escapeHtml(w.location)}</span>
        <div class="mt-1.5">
            <span class="weather-temp font-mono text-base font-bold text-accent-red">${w.temperature}°C</span>
            <span class="weather-cond text-xs text-ink-gray ml-1.5 font-bold">${escapeHtml(w.condition)}</span>
        </div>
      </div>
    `
      )
      .join('');

    // 报头天气：取第一个
    if (headerWeather && weather.forecasts.length > 0) {
      const first = weather.forecasts[0];
      headerWeather.textContent = `${first.location} ${first.icon} ${first.temperature}°C`;
    }
  }

  /**
   * 创建新闻卡片 HTML
   */
  function createNewsCard(item, isHeadline = false) {
    const hasImage = !!item.image;
    
    // 如果是头条，使用 grid 布局；普通使用 flex col
    const cardClass = isHeadline
      ? 'mb-8 pb-8 border-b-2 border-rule-color grid grid-cols-1 md:grid-cols-2 gap-8 break-inside-avoid'
      : 'mb-6 pb-6 border-b border-rule-light border-dotted break-inside-avoid';

    const imageHtml = hasImage
      ? `
      <div class="${isHeadline ? 'h-full max-h-[400px]' : 'mb-3'} relative group overflow-hidden border border-ink-dark">
        <img
          class="w-full ${isHeadline ? 'h-full object-cover' : 'h-[200px] object-cover'} filter grayscale contrast-110 transition-all duration-300 group-hover:grayscale-0 group-hover:contrast-100"
          src="${escapeHtml(item.image)}"
          alt="${escapeHtml(item.title)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.parentElement.style.display='none'"
        />
        <span class="absolute bottom-0 right-0 bg-ink-dark/90 text-paper-bg text-[0.65rem] px-2 py-1 font-mono">${escapeHtml(item.source_icon)} ${escapeHtml(item.source)}</span>
      </div>
    `
      : '';

    const summaryText = truncate(item.summary, isHeadline ? 200 : 100);

    if (isHeadline) {
      return `
        <article class="${cardClass}">
          ${imageHtml}
          <div class="flex flex-col justify-center">
            <h3 class="font-heading text-3xl font-bold leading-tight mb-4 transition-colors">
              <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="news-title-link" data-news-link>
                ${escapeHtml(item.title)}
              </a>
            </h3>
            <p class="font-body text-ink-dark text-lg mb-4 leading-relaxed">${escapeHtml(summaryText)}</p>
            <div class="flex justify-between items-center text-sm text-ink-gray border-t border-rule-light pt-2 mt-auto">
              <span class="font-bold">${escapeHtml(item.source_icon)} ${escapeHtml(item.source)}</span>
              <span class="font-mono">${timeAgo(item.published)}</span>
            </div>
          </div>
        </article>
      `;
    }

    // 普通卡片
    return `
      <article class="${cardClass}">
        ${imageHtml}
        <h3 class="font-heading text-xl font-bold leading-snug mb-2 transition-colors">
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="news-title-link" data-news-link>
            ${escapeHtml(item.title)}
          </a>
        </h3>
        ${summaryText ? `<p class="text-ink-gray text-sm mb-3 leading-relaxed text-justify">${escapeHtml(summaryText)}</p>` : ''}
        <div class="flex justify-between items-center text-xs text-ink-light font-mono">
          <span>${escapeHtml(item.source)}</span>
          <span>${timeAgo(item.published)}</span>
        </div>
      </article>
    `;
  }

  /**
   * 创建艺术/图片卡片 HTML (Polaroid Style)
   */
  function createArtCard(item) {
    // 标题优化: Safebooru: 12345 -> No.12345
    let displayTitle = item.title;
    if (displayTitle.includes('Safebooru:')) {
      displayTitle = displayTitle.replace('Safebooru:', 'No.');
    }
    
    // 标签优化: 仅取前3个
    let tags = item.summary;
    if (tags.startsWith("Tags:")) {
      const tagList = tags.replace("Tags:", "").split(",").map(t => t.trim()).filter(Boolean);
      tags = tagList.slice(0, 3).join(", ");
    } else {
        tags = truncate(tags, 20);
    }

    return `
      <div class="art-card bg-white p-3 pb-8 shadow-polaroid border border-gray-200 transition-all duration-300 hover:scale-105 hover:shadow-polaroid-hover hover:z-10 relative">
        <a href="${escapeHtml(item.link)}" class="block group" target="_blank" rel="noopener noreferrer">
          <div class="aspect-square overflow-hidden border border-gray-100 bg-gray-50 mb-3">
            <img 
              class="w-full h-full object-cover filter grayscale opacity-90 transition-all duration-300 group-hover:grayscale-0 group-hover:opacity-100" 
              src="${escapeHtml(item.image)}" 
              loading="lazy" 
              referrerpolicy="no-referrer"
              onerror="this.parentElement.innerHTML='<span class=\'flex items-center justify-center h-full text-xs text-gray-400\'>Image Lost</span>'"
            />
          </div>
        </a>
        <div class="text-center font-mono">
          <span class="block font-bold text-ink-dark text-sm mb-1">${escapeHtml(displayTitle)}</span>
          <span class="block text-[0.65rem] text-gray-400 italic truncate px-2">${escapeHtml(tags)}</span>
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
   * 渲染一个新闻分类
   */
  function renderCategory(categoryKey, categoryData, containerId) {
    const container = $(`#${containerId}`);
    if (!container) return;

    // 复制一份数据以免修改原始对象
    let items = categoryData?.items ? [...categoryData.items] : [];

    if (items.length === 0) {
      container.innerHTML = renderEmptyState();
      return;
    }

    // 🎨 UI 平衡策略：
    // 左侧（社会·民生）文字多，单条高度小，但总量多 -> 限制显示数量，防止太长 (Limit: 15)
    // 右侧（艺术·副刊）是图片，单条高度大 -> 允许显示更多，撑起页面 (Limit: 40)
    const MAX_DISPLAY = {
      'official': 10,
      'community': 15, // 砍掉过长的列表，只保留最近的15条
      'art': 40        // 图片区多多益善
    };

    if (MAX_DISPLAY[categoryKey] && items.length > MAX_DISPLAY[categoryKey]) {
      items = items.slice(0, MAX_DISPLAY[categoryKey]);
    }

    let html = '';

    if (categoryKey === 'official') {
      // 头版头条：第一条特殊显示
      if (items.length > 0) {
        html += createNewsCard(items[0], true);
      }
      // 其余条目用多栏
      if (items.length > 1) {
        html += '<div class="columns-1 md:columns-2 gap-8 space-y-8">'; // Tailwind multi-column
        for (let i = 1; i < items.length; i++) {
          html += createNewsCard(items[i], false);
        }
        html += '</div>';
      }
    } else if (categoryKey === 'art') {
      // 艺术/副刊：使用 Polaroid 风格网格
      html += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">';
      for (const item of items) {
        // 过滤没有图片的条目
        if (!item.image) continue;
        html += createArtCard(item);
      }
      html += '</div>';
    } else {
      // 普通分类：直接多栏布局
      html += '<div class="columns-1 gap-8 space-y-8">'; // Single column in grid cell really
      for (const item of items) {
        html += createNewsCard(item, false);
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  /**
   * 渲染广告
   */
  function renderAds(ads) {
    const grid = $('#ads-grid');
    if (!grid || !ads || ads.length === 0) return;

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
   */
  function hideLoading() {
    const overlay = $('#loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 500);
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
        btnToggle.textContent = SoundManager.enabled ? '🔊' : '🔇';

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

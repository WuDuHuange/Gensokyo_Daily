/**
 * 幻想乡日报 — 动效系统
 * Gensokyo Daily — Motion Layer
 *
 * 分四层，按触发时机组织：
 *   L1 首屏   — 报纸拆封、报头油墨落定、墨线展开、天气卡苏醒
 *   L2 滚动   — 卡片错峰入场、图片淡入、顶部卷轴进度
 *   L3 交互   — 回到报头、夜读模式（抬升/拿起等纯 CSS 反馈见 input.css）
 *   L4 兜底   — prefers-reduced-motion 全量降级
 *
 * 约定：所有入场类名都挂在 html.js 之下，脚本失效时页面直接可见，不会白屏。
 */

(function () {
  'use strict';

  // ============ 常量 ============
  const THEME_KEY = 'gensokyo-daily:theme';

  /** 加载遮罩最短展示时长：本地读 JSON 只要几毫秒，不兜住的话拆封动画等于没做 */
  const MIN_LOADER_MS = 900;
  /** 同批入场的错峰步长与上限 */
  const STAGGER_STEP_MS = 45;
  const STAGGER_MAX_MS = 300;

  const bootAt = performance.now();
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ============ 工具 ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const raf = (fn) => window.requestAnimationFrame(fn);

  // ============================================================
  // L1 · 首屏入场
  // ============================================================

  /**
   * 触发首屏动画。
   * 用双 rAF 让浏览器先把「初始态」真正提交一次，
   * 否则同一帧内加类会被合并，过渡不播放、元素直接闪现。
   */
  function playEntrance() {
    raf(() => raf(() => document.body.classList.add('is-ready')));
  }

  /**
   * 动画收尾：摘掉 ink-in。
   * 入场结束后 filter 停在 blur(0)，仍会让元素留在独立合成层上；
   * 摘掉类后回到默认样式（视觉无变化），合成层随之释放。
   */
  function cleanupEntrance() {
    window.setTimeout(() => {
      $$('.ink-in').forEach((el) => el.classList.remove('ink-in', 'ink-in--masthead'));
    }, 1800);
  }

  // ============================================================
  // L2 · 滚动入场
  // ============================================================

  /**
   * 为 [data-reveal] 元素挂观察器。
   *
   * 必须在内容渲染完成之后调用——卡片是 fetch 到 JSON 后才 innerHTML 进去的。
   * 同一批进入视口的元素按文档顺序错峰浮现；一次只进来一个时延迟为 0，
   * 所以慢慢往下滚和快速滑到底都是自然的。
   */
  function initReveal() {
    const nodes = $$('[data-reveal]');
    if (!nodes.length) return;

    // 降级：不做动画，直接显示
    if (prefersReduced || !('IntersectionObserver' in window)) {
      nodes.forEach((el) => {
        el.classList.add('is-revealed');
        // 顺手摘掉 data-reveal：留着它元素会一直匹配 .js [data-reveal] 那条
        // opacity:0 规则，虽然被 .is-revealed 覆盖了，但属性残留没有意义
        el.removeAttribute('data-reveal');
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        const batch = [];
        for (const entry of entries) {
          if (entry.isIntersecting) batch.push(entry.target);
        }
        if (!batch.length) return;

        // querySelectorAll 已按文档顺序返回，用它在数组中的下标排序即可
        batch.sort((a, b) => nodes.indexOf(a) - nodes.indexOf(b));

        batch.forEach((el, i) => {
          const delay = Math.min(i * STAGGER_STEP_MS, STAGGER_MAX_MS);
          if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
          el.classList.add('is-revealed');
          io.unobserve(el);

          // 收尾：摘掉内联延迟与过渡，元素回到普通文档流状态
          window.setTimeout(() => {
            el.style.removeProperty('--reveal-delay');
            el.removeAttribute('data-reveal');
          }, delay + 700);
        });
      },
      {
        // 底部内缩 8%，让元素在真正进入视野中段时才浮现，而不是刚露头就播完。
        // 顶部大幅外扩：用户拖动滚动条快速掠过、或点「回到报头」跳转时，
        // 中间区域可能从未在视口里停留过。顶部不外扩的话这些元素会永远停在
        // opacity: 0 —— 内容直接消失，比「没动画」严重得多。
        // 外扩不影响首屏：页面加载时视口下方的元素仍落在 root 之外。
        rootMargin: '9999px 0px -8% 0px',
        threshold: 0.08,
      }
    );

    nodes.forEach((el) => io.observe(el));
  }

  /**
   * 图片淡入。
   * 挂在 load 之后而不是元素插入时——否则动画会在图片还没下载完时就播完，
   * 图片「啪」地直接出现，等于没做。lazy 图进入视口后 load 才触发，时机正好。
   */
  function initImageFade(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-img-fade]').forEach((img) => {
      const show = () => img.classList.add('img-fade');
      if (img.complete && img.naturalWidth > 0) {
        show();
      } else {
        img.addEventListener('load', show, { once: true });
      }
    });
  }

  // ============================================================
  // L2 · 滚动进度 + L3 · 回到报头
  // ============================================================

  const Scroll = {
    bar: null,
    topBtn: null,
    pending: false,

    init() {
      this.bar = $('#scroll-progress-bar');
      this.topBtn = $('#btn-to-top');

      window.addEventListener('scroll', () => this.schedule(), { passive: true });
      window.addEventListener('resize', () => this.schedule(), { passive: true });

      if (this.topBtn) {
        this.topBtn.addEventListener('click', () => {
          window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
        });
      }

      this.render();
    },

    /** 用 rAF 合帧，滚动事件里只做一次标记 */
    schedule() {
      if (this.pending) return;
      this.pending = true;
      raf(() => {
        this.pending = false;
        this.render();
      });
    },

    render() {
      const doc = document.documentElement;
      const y = window.scrollY || doc.scrollTop || 0;
      const max = doc.scrollHeight - window.innerHeight;

      if (this.bar) {
        this.bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }
      if (this.topBtn) {
        this.topBtn.classList.toggle('is-visible', y > window.innerHeight * 0.9);
      }
    },
  };

  // ============================================================
  // L3 · 夜读模式
  // ============================================================

  const Theme = {
    init() {
      let saved = null;
      try {
        saved = window.localStorage.getItem(THEME_KEY);
      } catch (e) {
        // 隐私模式 / file:// 下可能不可用，静默降级为默认日刊
      }

      // 默认日刊。报纸的纸张感是主体，不跟随系统深色自动翻转，
      // 只记住用户主动切换过的选择。
      this.apply(saved === 'night' ? 'night' : 'day', false);

      const btn = $('#btn-theme-toggle');
      if (btn) {
        btn.addEventListener('click', () => {
          const next = document.body.classList.contains('night') ? 'day' : 'night';
          this.apply(next, true);
        });
      }
    },

    apply(mode, persist) {
      const night = mode === 'night';
      const body = document.body;

      // 先挂上过渡类，下一帧再改主题，颜色才会一起走完过渡而不是硬跳
      body.classList.add('theme-switching');
      raf(() => {
        body.classList.toggle('night', night);
        const icon = $('#btn-theme-toggle .tool-btn__icon');
        if (icon) icon.textContent = night ? '☀️' : '🌙';
        const tip = $('#btn-theme-toggle .tool-btn__tip');
        if (tip) tip.textContent = night ? '日间模式' : '夜读模式';
        const btn = $('#btn-theme-toggle');
        if (btn) btn.setAttribute('aria-label', night ? '切换到日间模式' : '切换到夜读模式');
      });
      window.setTimeout(() => body.classList.remove('theme-switching'), 460);

      if (persist) {
        try {
          window.localStorage.setItem(THEME_KEY, mode);
        } catch (e) {
          // 存不进去也不影响本次切换
        }
      }
    },
  };

  // ============================================================
  // 加载遮罩收场
  // ============================================================

  let loaderDismissed = false;

  /**
   * 由 app.js 在数据渲染完成后调用。
   * 会等到 MIN_LOADER_MS 再收起遮罩，保证拆封动画完整播完。
   */
  function dismissLoader() {
    if (loaderDismissed) return;
    loaderDismissed = true;

    // 图片监听尽早挂上：图片加载本身耗时，不该等遮罩退场
    initImageFade(document);

    const elapsed = performance.now() - bootAt;
    const wait = Math.max(0, MIN_LOADER_MS - elapsed);

    window.setTimeout(() => {
      const overlay = $('#loading-overlay');
      if (overlay) {
        overlay.classList.add('is-done');
        window.setTimeout(() => overlay.remove(), 700);
      }

      playEntrance();

      // 滚动入场稍晚一点启动，否则首屏那几张卡会在遮罩后面偷偷播完
      window.setTimeout(() => {
        initReveal();
        Scroll.schedule();
      }, 150);

      cleanupEntrance();
    }, wait);
  }

  // ============================================================
  // 启动
  // ============================================================

  function boot() {
    Theme.init();
    Scroll.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 供 app.js 调用
  window.GD_MOTION = {
    dismissLoader,
    prefersReduced,
  };
})();

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幻想乡日报 (Gensokyo Daily) — 新闻抓取脚本
使用 RSSHub 作为数据中间件，聚合东方 Project 相关资讯。
"""

import json
import os
import re
import time
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import feedparser
import requests

# ============================================================
# 配置区 — 修改这里来适配你自己的 RSSHub 实例
# ============================================================
RSSHUB_BASE = os.environ.get("RSSHUB_BASE", "https://rsshub.app")

# 数据文件路径
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news_data.json")

# 滚动更新策略：每个分类最多保留的条目数
MAX_ITEMS_PER_CATEGORY = 50

# 数据保留天数
MAX_AGE_DAYS = 30

# 请求超时（秒）
REQUEST_TIMEOUT = 30

# 东方相关关键词 2.0 Pro版（分类管理 + 黑名单机制）
# --- 核心关键词：出现任意一个即可判定为东方相关 ---
CORE_KEYWORDS = [
    "东方project", "東方project", "touhou project", "touhou",
    # 日文假名与片假名，提升日文/日区平台命中率
    "トウホウ", "とうほう",
    "幻想乡", "幻想郷", "gensokyo",
    "博丽神社", "博麗神社", "hakurei",
    "ZUN", "上海爱丽丝", "上海アリス幻樂団",
    "例大祭", "reitaisai",
    "thwiki", "THBWiki", "东方吧",
]

# --- 角色关键词 ---
CHARACTER_KEYWORDS = [
    "灵梦", "霊夢", "reimu",
    "魔理沙", "marisa",
    "咲夜", "sakuya",
    "琪露诺", "チルノ", "cirno",
    "妖梦", "妖夢", "youmu",
    "幽幽子", "yuyuko",
    "蕾米莉亚", "remilia",
    "芙兰朵露", "flandre",
    "帕秋莉", "patchouli",
    "射命丸文", "aya shameimaru",
    "河城荷取", "nitori",
    "八云紫", "八雲紫", "yukari",
    "藤原妹红", "mokou",
    "鬼人正邪", "seija",
    "古明地觉", "古明地恋", "satori", "koishi",
    "风见幽香", "yuuka",
    "四季映姬", "eiki",
    "小野塚小町", "komachi",
    "因幡帝", "tewi",
    "铃仙", "鈴仙", "reisen",
    "永琳", "eirin",
    "辉夜", "輝夜", "kaguya",
    "红美铃", "meiling",
    "爱丽丝", "alice margatroid",
    "西行寺", "saigyouji",
    "博丽", "博麗",
]

# --- 作品关键词 ---
GAME_KEYWORDS = [
    "红魔乡", "紅魔郷", "红魔馆", "紅魔館",
    "妖妖梦", "妖々夢",
    "永夜抄",
    "花映塚",
    "风神录", "風神録",
    "地灵殿", "地霊殿",
    "星莲船", "星蓮船",
    "神灵庙", "神霊廟",
    "辉针城", "輝針城",
    "绀珠传", "紺珠伝",
    "天空璋",
    "鬼形兽", "鬼形獣",
    "虹龙洞", "虹龍洞",
    "兽王园", "獣王園",
    "献华抄",
    "刚欲异闻",
    "东方红魔乡", "东方妖妖梦", "东方永夜抄",
    "东方风神录", "东方地灵殿", "东方星莲船",
    "东方神灵庙", "东方辉针城", "东方绀珠传",
    "东方天空璋", "东方鬼形兽", "东方虹龙洞",
    "东方兽王园", "东方献华抄", "东方刚欲异闻",
]

# --- 音乐/二创关键词 ---
MUSIC_KEYWORDS = [
    "东方arrange", "东方编曲", "东方同人音乐",
    "U.N.オーエンは彼女なのか", "ネクロファンタジア",
    "bad apple", "色は匂へど散りぬるを",
    "东方vocal", "东方remix",
    "秘封俱乐部", "秘封倶楽部",
]

# --- 黑名单关键词：如果标题中出现这些词且不包含核心关键词，则排除 ---
BLACKLIST_KEYWORDS = [
    "东方卫视", "东方财富", "东方航空", "东方明珠",
    "东方雨虹", "东方电气", "东方证券", "东方通信",
    "东方园林", "东方日升", "东方盛虹", "东方铁塔",
    "东方美食", "东方甄选", "东方不败",
    "orient", "oriental securities",
]

# 合并为总关键词列表
TOUHOU_KEYWORDS = CORE_KEYWORDS + CHARACTER_KEYWORDS + GAME_KEYWORDS + MUSIC_KEYWORDS

# ============================================================
# RSS 源配置
# ============================================================
RSS_SOURCES = {
    # === 头版头条 (Official) ===
    "official": {
        "label": "头版头条",
        "feeds": [
            {
                "name": "东方官方资讯站",
                # 优先使用原生 WordPress feed，绕过 RSSHub
                "url": "https://touhou-project.news/feed.rss",
                "icon": "📰",
                "priority": 1,
            },

        ],
    },

    # === 社会/民生 (Community) ===
    "community": {
        "label": "社会·民生",
        "feeds": [
            {
                "name": "B站 MMD榜", 
                "url": f"{RSSHUB_BASE}/bilibili/ranking/25/3/1", # 25=MMD分区, 3=三日榜
                "icon": "💃",
                "priority": 1,
                "needs_filter": True, # 依然需要关键词过滤，防止抓到原神/崩铁
            },
            {
                "name": "B站 MAD榜", 
                "url": f"{RSSHUB_BASE}/bilibili/ranking/24/3/1", # 24=MAD分区
                "icon": "🎬",
                "priority": 1,
                "needs_filter": True,
            },
            {
                "name": "B站 游戏榜", 
                "url": f"{RSSHUB_BASE}/bilibili/ranking/17/3/1", # 17=单机分区
                "icon": "🎮",
                "priority": 2,
                "needs_filter": True,
            },
            {
                "name": "Reddit r/touhou",
                # 直接使用 Reddit 原生 RSS
                "url": "https://www.reddit.com/r/touhou/new/.rss",
                "icon": "💬",
                "priority": 2,
            },
            {
                "name": "THWiki 最近更改",
                # 使用 THWiki 原生 Atom feed
                "url": "https://thwiki.cc/index.php?title=Special:%E6%9C%80%E8%BF%91%E6%9B%B4%E6%94%B9&feed=atom",
                "icon": "📚",
                "priority": 3,
            },
        ],
    },

    # === 艺术/副刊 (Art) ===
    "art": {
        "label": "艺术·副刊",
        "feeds": [
            {
                "name": "Safebooru (Touhou)",
                # 使用友好的 Booru 站点替代 Pixiv
                "url": "https://safebooru.org/index.php?page=rss&s=post&q=touhou",
                "icon": "🎨",
                "priority": 1,
            },
        ],
    },
}


# ============================================================
# 工具函数
# ============================================================


def generate_id(title: str, link: str) -> str:
    """根据标题和链接生成唯一 ID"""
    raw = f"{title}|{link}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


def is_touhou_related(text: str) -> bool:
    """更智能的东方相关判断逻辑（2.0 Pro版）"""
    if not text:
        return False
    text_lower = text.lower()

    # 1. 先检查黑名单（一票否决）
    for bad_word in BLACKLIST_KEYWORDS:
        if bad_word.lower() in text_lower:
            # 特殊情况：如果同时出现了"东方Project"或"ZUN"，则无视黑名单
            # （防止"东方卫视报道了东方Project展会"这种新闻被误杀）
            if "project" in text_lower or "zun" in text_lower:
                continue
            return False

    # 2. 强匹配：任一核心/角色/作品/音乐关键词出现即判定为东方相关
    positive_lists = CORE_KEYWORDS + CHARACTER_KEYWORDS + GAME_KEYWORDS + MUSIC_KEYWORDS
    for kw in positive_lists:
        if kw.lower() in text_lower:
            return True

    # 3. 弱匹配处理：单独的“东方/東方”是高度歧义的词，
    #    仅在同时出现角色/作品/音乐等具体关键词时才判定为东方相关。
    if "东方" in text or "東方" in text_lower:
        for kw in CHARACTER_KEYWORDS + GAME_KEYWORDS + MUSIC_KEYWORDS:
            if kw.lower() in text_lower:
                return True
        return False

    # 未命中任何判定条件 -> 非东方相关
    return False


def is_important_zun_tweet(text: str) -> bool:
    """判断 ZUN 的推特是否包含重要信息（用于 is_zun 标记源）。

    策略：基于关键词加权，包含发布/开发/例大祭/公开等词视为重要；
    同时如果带图片也可视作较重要的动态。
    """
    if not text:
        return False
    text_lower = text.lower()

    keywords = [
        "新作", "体験版", "体験", "完成", "入稿", "發售", "公開", "发布", "発売", "発表", "告知", "リリース",
        "例大祭", "コミケ", "夏コミ", "冬コミ", "reitaisai",
        "release", "steam", "配信", "公開", "interview", "インタビュー",
        # 日文假名/片假名与英文
        "トウホウ", "とうほう", "touhou", "東方", "touhou project", "東方project",
    ]

    for kw in keywords:
        if kw.lower() in text_lower:
            return True

    # 如果包含图片标签，通常也比较值得关注
    if "<img" in text_lower:
        return True

    return False


def clean_html(raw_html: str) -> str:
    """移除 HTML 标签，保留纯文本"""
    if not raw_html:
        return ""
    clean = re.sub(r"<[^>]+>", "", raw_html)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:300]  # 摘要截断


def extract_image(entry) -> Optional[str]:
    """从 RSS 条目中尽力提取一张图片 URL"""
    # 尝试 media:content
    if hasattr(entry, "media_content") and entry.media_content:
        for media in entry.media_content:
            if "image" in media.get("type", "") or media.get("url", "").endswith(
                (".jpg", ".png", ".webp", ".gif")
            ):
                return media["url"]

    # 尝试 media:thumbnail
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        return entry.media_thumbnail[0].get("url")

    # 尝试 enclosure
    if hasattr(entry, "enclosures") and entry.enclosures:
        for enc in entry.enclosures:
            if "image" in enc.get("type", ""):
                return enc.get("href") or enc.get("url")

    # 尝试从 description/content 中提取 <img>
    content = ""
    if hasattr(entry, "content") and entry.content:
        content = entry.content[0].get("value", "")
    elif hasattr(entry, "summary"):
        content = entry.summary or ""

    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', content)
    if img_match:
        return img_match.group(1)

    return None


def parse_date(entry) -> str:
    """解析发布时间，返回 ISO 格式字符串"""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).isoformat()
    if hasattr(entry, "updated_parsed") and entry.updated_parsed:
        return datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc).isoformat()
    return datetime.now(timezone.utc).isoformat()


def fetch_feed(url: str, timeout: int = REQUEST_TIMEOUT) -> Optional[feedparser.FeedParserDict]:
    """获取并解析 RSS feed"""
    try:
        headers = {
            "User-Agent": "Gensokyo-Daily/1.0 (RSS Reader; +https://github.com/gensokyo-daily)"
        }
        with requests.Session() as session:
            resp = session.get(url, headers=headers, timeout=timeout)

        # 如果返回非 2xx，尽量打印更多信息以便排查
        if resp.status_code >= 400:
            snippet = resp.text[:500].replace("\n", " ") if resp.text else ""
            print(f"  ⚠ 获取失败: {url} — HTTP {resp.status_code} {resp.reason}")
            if snippet:
                print(f"    → 响应片段: {snippet}")
            return None

        parsed = feedparser.parse(resp.text)
        # feedparser 有 bozo 标志表示解析时出现异常
        if getattr(parsed, "bozo", False):
            be = getattr(parsed, "bozo_exception", None)
            print(f"  ⚠ 解析警告: {url} — {be}")

        return parsed
    except requests.exceptions.RequestException as e:
        # requests 异常时尽量输出状态与响应片段（如果有）
        msg = str(e)
        resp = getattr(e, "response", None)
        if resp is not None:
            try:
                snippet = resp.text[:500].replace("\n", " ")
            except Exception:
                snippet = "(unable to read response body)"
            print(f"  ⚠ 获取失败: {url} — HTTP {resp.status_code} {resp.reason} — {msg}")
            print(f"    → 响应片段: {snippet}")
        else:
            print(f"  ⚠ 获取失败: {url} — {msg}")
        return None
    except Exception as e:
        print(f"  ⚠ 解析失败: {url} — {e}")
        return None


# ============================================================
# 天气模块（虚构 - 幻想乡天气）
# ============================================================


def generate_gensokyo_weather() -> dict:
    """生成幻想乡各地的虚构天气"""
    import random

    locations = [
        {"name": "博丽神社", "name_jp": "博麗神社"},
        {"name": "人间之里", "name_jp": "人間の里"},
        {"name": "红魔馆", "name_jp": "紅魔館"},
        {"name": "白玉楼", "name_jp": "白玉楼"},
        {"name": "永远亭", "name_jp": "永遠亭"},
        {"name": "守矢神社", "name_jp": "守矢神社"},
        {"name": "地灵殿", "name_jp": "地霊殿"},
        {"name": "命�的神殿", "name_jp": "命蓮寺"},
    ]

    conditions = [
        {"text": "晴", "icon": "☀️"},
        {"text": "多云", "icon": "⛅"},
        {"text": "阴", "icon": "☁️"},
        {"text": "小雨", "icon": "🌦️"},
        {"text": "雷阵雨", "icon": "⛈️"},
        {"text": "弹幕暴风", "icon": "🌀"},
        {"text": "妖雾", "icon": "🌫️"},
        {"text": "花粉", "icon": "🌸"},
        {"text": "异变中", "icon": "⚡"},
        {"text": "红雾", "icon": "🌅"},
        {"text": "雪", "icon": "❄️"},
        {"text": "樱吹雪", "icon": "🌸"},
    ]

    weather_data = []
    for loc in locations:
        cond = random.choice(conditions)
        temp = random.randint(-5, 35)
        weather_data.append(
            {
                "location": loc["name"],
                "location_jp": loc["name_jp"],
                "condition": cond["text"],
                "icon": cond["icon"],
                "temperature": temp,
            }
        )

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "forecasts": weather_data,
    }


# ============================================================
# 主抓取逻辑
# ============================================================


def fetch_all_news() -> dict:
    """抓取所有分类的新闻"""
    print("=" * 60)
    print("🗞️  幻想乡日报 — 开始抓取新闻")
    print(f"🔗 使用 RSSHUB_BASE: {RSSHUB_BASE}")
    print(f"📅  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)

    all_news = {}
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)

    for category_key, category_config in RSS_SOURCES.items():
        print(f"\n📂 分类: {category_config['label']}")
        items = []

        for feed_config in category_config["feeds"]:
            print(f"  🔗 正在获取: {feed_config['name']}")
            feed = fetch_feed(feed_config["url"])

            if not feed or not feed.entries:
                print(f"  ⚠ 无数据或获取失败")
                continue

            count = 0
            for entry in feed.entries:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                if not title or not link:
                    continue

                # 需要过滤的源：检查是否与东方相关
                if feed_config.get("needs_filter"):
                    summary_text = clean_html(
                        entry.get("summary", "") + " " + title
                    )
                    if not is_touhou_related(summary_text):
                        continue

                # ZUN 专属过滤：对标记为 is_zun 的源做重要性判断
                if feed_config.get("is_zun"):
                    full_text = clean_html(entry.get("summary", "") + " " + title)
                    if not is_important_zun_tweet(full_text):
                        continue

                item = {
                    "id": generate_id(title, link),
                    "title": title,
                    "link": link,
                    "summary": clean_html(entry.get("summary", "")),
                    "image": extract_image(entry),
                    "source": feed_config["name"],
                    "source_icon": feed_config["icon"],
                    "priority": feed_config["priority"],
                    "published": parse_date(entry),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }

                items.append(item)
                count += 1

            print(f"  ✅ 获取到 {count} 条")

        # 去重（按 id）
        seen_ids = set()
        unique_items = []
        for item in items:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                unique_items.append(item)

        # 按优先级（数值越小优先级越高）和发布时间降序排序
        # 首先把发布时间解析为时间戳，确保排序行为正确
        def _ts(item):
            try:
                return datetime.fromisoformat(item.get("published", "")).timestamp()
            except Exception:
                return 0

        # key: (priority asc, published_ts desc)
        unique_items.sort(key=lambda x: (x.get("priority", 99), -_ts(x)))

        # 截断到最大条目数
        unique_items = unique_items[:MAX_ITEMS_PER_CATEGORY]

        all_news[category_key] = {
            "label": category_config["label"],
            "items": unique_items,
            "count": len(unique_items),
        }

        print(f"  📊 分类 [{category_config['label']}] 共收录 {len(unique_items)} 条")

    return all_news


def merge_with_existing(new_data: dict) -> dict:
    """
    与已有数据合并，实现增量更新。
    新数据覆盖同 id 的旧数据，同时保留未过期的旧条目。
    """
    if not os.path.exists(DATA_FILE):
        return new_data

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except (json.JSONDecodeError, IOError):
        return new_data

    existing_categories = existing.get("categories", {})
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)

    for cat_key, cat_data in new_data.items():
        new_items = {item["id"]: item for item in cat_data["items"]}

        # 从旧数据中保留未过期且不重复的条目
        if cat_key in existing_categories:
            for old_item in existing_categories[cat_key].get("items", []):
                if old_item["id"] not in new_items:
                    try:
                        pub_date = datetime.fromisoformat(old_item["published"])
                        if pub_date.tzinfo is None:
                            pub_date = pub_date.replace(tzinfo=timezone.utc)
                        if pub_date > cutoff:
                            new_items[old_item["id"]] = old_item
                    except (ValueError, KeyError):
                        pass

        merged_list = list(new_items.values())
        merged_list.sort(key=lambda x: x.get("published", ""), reverse=True)
        merged_list = merged_list[:MAX_ITEMS_PER_CATEGORY]

        cat_data["items"] = merged_list
        cat_data["count"] = len(merged_list)

    return new_data


def main():
    """主入口"""
    start_time = time.time()

    # 1. 抓取新闻
    news_data = fetch_all_news()

    # 2. 合并旧数据
    news_data = merge_with_existing(news_data)

    # 3. 生成天气
    weather = generate_gensokyo_weather()

    # 4. 虚构广告
    ads = [
        {
            "id": "ad_kappa",
            "title": "河童重工 最新科技",
            "subtitle": "光学迷彩、等离子炮、自动钓鱼机",
            "description": "河城荷取领衔研发！妖怪山河童工业联合体，为您提供最前沿的幻想科技。来料加工、定制弹幕系统，欢迎咨询。",
            "contact": "妖怪山瀑布旁 河童工坊",
            "icon": "🔧",
        },
        {
            "id": "ad_eientei",
            "title": "永远亭 特供药剂",
            "subtitle": "八意永琳监制 · 蓬莱之药除外",
            "description": "感冒灵、跌打丸、弹幕创伤速愈膏……月之头脑为您守护每一天的健康。本月特惠：蝴蝶梦丸（80文/粒）。",
            "contact": "迷途竹林深处 永远亭药局",
            "icon": "💊",
        },
        {
            "id": "ad_kourindou",
            "title": "香霖堂 古道具店",
            "subtitle": "森近霖之助 · 外界道具专营",
            "description": "本店经营各类外界流入品：Game Boy、打火机、不明用途的塑料板……识货的客官请进。不议价。",
            "contact": "魔法森林入口处",
            "icon": "🏪",
        },
        {
            "id": "ad_moriya",
            "title": "守矢神社 御守特卖",
            "subtitle": "信仰充值 · 有求必应",
            "description": "新年限定御守上架！学业成就、恋爱成就、弹幕回避……诹访子大人亲自加持，信仰值翻倍。参拜即送蛙形饼干。",
            "contact": "妖怪山山顶 守矢神社",
            "icon": "⛩️",
        },
    ]

    # 5. 组装完整数据
    output = {
        "meta": {
            "title": "幻想乡日报",
            "title_jp": "幻想郷日報",
            "subtitle": "Gensokyo Daily",
            "edition": datetime.now(timezone.utc).strftime("第%Y%m%d期"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by": "射命丸文 & GitHub Actions",
            "version": "1.0.0",
        },
        "categories": news_data,
        "weather": weather,
        "ads": ads,
    }

    # 6. 写入文件
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    total_items = sum(cat["count"] for cat in news_data.values())

    print("\n" + "=" * 60)
    print(f"✅ 抓取完成！共 {total_items} 条新闻")
    print(f"⏱️  耗时 {elapsed:.1f} 秒")
    print(f"💾 数据已保存至 {DATA_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()

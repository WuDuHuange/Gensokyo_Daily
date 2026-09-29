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
import html
import uuid
import random
import functools
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import feedparser
import requests

# ============================================================
# ⚙️ B站分区配置 (ID 不变)
# ============================================================
BILIBILI_PARTITIONS = [
    {"name": "B站 MMD榜", "rid": 25, "icon": "💃", "priority": 1},
    {"name": "B站 手书榜", "rid": 24, "icon": "🎬", "priority": 1},
    {"name": "B站 音乐榜", "rid": 28, "icon": "🎵", "priority": 2},
    {"name": "B站 游戏榜", "rid": 17, "icon": "🎮", "priority": 2},
]

# ============================================================
# B站 WBI 签名魔法 (Copy & Paste)
# ============================================================
def get_mixin_key(orig: str):
    '对 imgKey 和 subKey 进行字符顺序打乱编码'
    mixin_key_enc_tab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
        33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
        61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
        36, 20, 34, 44, 52
    ]
    return functools.reduce(lambda s, i: s + orig[i], mixin_key_enc_tab, '')[:32]

def enc_wbi(params: dict, img_key: str, sub_key: str):
    '为请求参数进行 wbi 签名'
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = round(time.time())
    params['wts'] = curr_time # 添加时间戳
    # 按照 key 重排参数
    params = dict(sorted(params.items()))
    # 过滤不用签名的字符
    query = urlencode(params)
    # 计算 w_rid
    w_rid = hashlib.md5((query + mixin_key).encode(encoding='utf-8')).hexdigest()
    params['w_rid'] = w_rid
    return params

def get_wbi_keys():
    '获取最新的 img_key 和 sub_key'
    try:
        resp = requests.get('https://api.bilibili.com/x/web-interface/nav', headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        resp.raise_for_status()
        json_content = resp.json()
        img_url = json_content['data']['wbi_img']['img_url']
        sub_url = json_content['data']['wbi_img']['sub_url']
        img_key = img_url.rsplit('/', 1)[1].split('.')[0]
        sub_key = sub_url.rsplit('/', 1)[1].split('.')[0]
        return img_key, sub_key
    except Exception as e:
        print(f"⚠️ 无法获取 WBI 密钥: {e}")
        return None, None

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
    "thwiki", "THBWiki", "东方吧","东方MMD",
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
    "八云蓝", "八雲藍", "ran",
    "露娜切露德", "luna child",
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

# ============================================================
# ⛔ 黑名单 (Blacklist) - 看到这些词直接丢弃
# ============================================================
BLACKLIST_KEYWORDS = [
    # 竞品游戏 IP (MMD区的大头)
    "原神", "Genshin", "米哈游", "miHoYo", "提瓦特",
    "崩坏", "Honkai", "星穹铁道", "StarRail", "Star Rail", "绝区零", "ZZZ",
    "明日方舟", "Arknights", "鹰角", "Hypergryph", "泰拉大陆",
    "碧蓝档案", "BlueArchive", "Blue Archive", "蔚蓝档案",
    "王者荣耀", "LOL", "英雄联盟", "永劫无间", "Naraka",
    "第五人格", "阴阳师", "赛马娘",
    "Fate", "FGO", "Fate/Grand Order",
    "超时空辉夜姬", "超時空輝夜姫", # 相同的传说原设但是其实不相关
    
    # 虚拟主播 (Vtubers 经常和 MMD 混在一起)
    "Hololive", "Nijisanji", "Asoul", "嘉然", "贝拉", 
    "初音", "Miku", "洛天依", "Vocaloid", # 除非和东方混搭，否则过滤

    # 无关关键词
    "互动视频", "抽奖", "测试", "作业", "课堂", "教程",
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
                "name": "Reddit r/touhou",
                # 直接使用 Reddit 原生 RSS
                "url": "https://www.reddit.com/r/touhou/new/.rss",
                "icon": "💬",
                "priority": 2,
            },
        ],
    },

    # === 艺术/副刊 (Art) ===
    "art": {
        "label": "艺术·副刊",
        "feeds": [
            # Safebooru 已改为 API 调用，此处留空或保留其他RSS源
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
    """
    判断文本是否与东方相关 (黑名单优先策略)
    """
    if not text:
        return False
    text_lower = text.lower()
    
    # 1. ⚔️ 黑名单检查 (一票否决)
    # 只要出现了竞品词汇，直接判死刑，除非它明确标记了是“东方Project”的混合二创
    for bad_word in BLACKLIST_KEYWORDS:
        if bad_word.lower() in text_lower:
            # 唯一的“豁免权”：如果标题里同时硬核地写了 "东方" 或 "Touhou"
            # (防止误杀比如 "东方 x 原神" 的跨界整活)
            if "东方" in text_lower or "東方" in text_lower or "touhou" in text_lower:
                continue 
            
            # 调试日志：让你知道是谁被杀掉了
            # print(f"       [黑名单拦截] 发现关键词: {bad_word}") 
            return False

    # 2. ✅ 正向关键词检查
    # 只要命中一个正向词，就认为是东方相关
    for kw in TOUHOU_KEYWORDS:
        if kw.lower() in text_lower:
            return True
            
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
    """
    移除 HTML 标签并解码实体，保留纯文本。

    ⚠️ 两步顺序不可颠倒：**先剥标签，后解码实体**。
    若先解码，`&lt;script&gt;` 会先变成真标签、再被正则剥掉，等于删掉了本该显示的正文；
    反过来则只剥掉真正的标签，被转义的尖括号安全地留作文字。

    实体解码是必需的：RSS 源里普遍带 `&#160;` `&#8220;` `&#8230;` 这类实体，
    不解码就会原样写进 news_data.json，前端 escapeHtml() 再转义一次，
    最终在页面上显示成可见的 `&#160;` 字面量（2026-09-29 实测 115 条里中 51 条）。
    """
    if not raw_html:
        return ""
    clean = re.sub(r"<[^>]+>", "", raw_html)
    clean = html.unescape(clean)
    # NBSP(U+00A0) 也会被 \s 折叠 —— Python3 的 \s 覆盖 Unicode 空白，
    # 所以 &#160; 解码出的不换行空格会被下面这行一并清掉
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:300]  # 摘要截断


def fetch_bilibili_rank_api(rid: int, label: str) -> list:
    """
    [API直连] 获取 B站指定分区的排行榜数据 (加强伪装版 + WBI签名)
    """
    # 1. 先拿到密钥
    img_key, sub_key = get_wbi_keys()
    if not img_key: 
        print("  ⚠ WBI 签名密钥获取失败，跳过 B站请求")
        return []

    # 2. 准备原始参数
    params = {
        'rid': rid,
        'type': 'all',
        # 'web_location': '333.999', # 有时候需要这个
    }
    
    # 3. 签名！
    signed_params = enc_wbi(params, img_key, sub_key)

    api_url = f"https://api.bilibili.com/x/web-interface/ranking/v2"
    
    # 生成随机指纹 (保持旧有的 Headers 伪装作为辅助)
    buvid3 = str(uuid.uuid4()) + "infoc"
    _uuid = str(uuid.uuid4())
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/v/popular/rank/all",
        "Origin": "https://www.bilibili.com",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        # 模拟浏览器环境头
        "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Cookie": f"buvid3={buvid3}; _uuid={_uuid};" 
    }
    
    print(f"  ⚡ 正在请求 B站 API (分区 {rid}) [WBI签名版]...")
    try:
        # requests 会自动帮你把 signed_params 拼接到 url 后面
        resp = requests.get(api_url, headers=headers, params=signed_params, timeout=15)
        
        if resp.status_code != 200:
            print(f"  ❌ HTTP 状态码错误: {resp.status_code}")
            return []

        data = resp.json()
        
        if data["code"] != 0:
            print(f"  ❌ B站 API 拒绝: Code {data['code']} - {data.get('message', '未知错误')}")
            return []
            
        items = []
        data_list = data.get("data", {}).get("list", [])
        
        for v in data_list[:15]:
            title = v["title"]
            desc = v.get("desc", "") or v.get("dynamic", "") or ""
            
            # 关键词过滤
            combined_text = title + " " + desc
            if not is_touhou_related(combined_text):
                continue
                
            items.append({
                "id": generate_id(v["bvid"], "bilibili"),
                "title": v["title"],
                "link": f"https://www.bilibili.com/video/{v['bvid']}",
                "summary": desc[:80].replace("\n", " ") + "...",
                "image": v["pic"].replace("http://", "https://") if "pic" in v else None,
                "source": f"B站 {label}榜",
                "source_icon": "📺",
                "priority": 1,
                "published": datetime.now(timezone.utc).isoformat(),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
        return items
    except Exception as e:
        print(f"  ⚠ B站 API 请求异常: {e}")
        return []


def fetch_safebooru_api(tags: str = "touhou") -> list:
    """
    [API直连] 获取 Safebooru 图片列表 (JSON)
    """
    # json=1 表示返回 JSON 格式
    # ⬆️ 提高了单次抓取数量 (10 -> 40)，以平衡页面高度，让右侧不显得太空
    api_url = f"https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags={tags}&limit=40"
    headers = {"User-Agent": "GensokyoDaily/1.0"}
    
    print(f"  ⚡ 正在请求 Safebooru API...")
    try:
        resp = requests.get(api_url, headers=headers, timeout=10)
        # Safebooru API 有时返回空或非标准 JSON，需要小心
        if not resp.text.strip():
            return []
            
        data = resp.json()
        items = []
        
        for img in data:
            # 构造图片 URL
            # Safebooru 图片路径通常是 images/{directory}/{image}
            image_url = f"https://safebooru.org/images/{img['directory']}/{img['image']}"
            post_url = f"https://safebooru.org/index.php?page=post&s=view&id={img['id']}"
            
            items.append({
                "id": str(img['id']),
                "title": f"Safebooru: {img['id']}", # 图站通常没标题
                "link": post_url,
                "summary": f"Tags: {img['tags'][:50]}...",
                "image": image_url,
                "source": "Safebooru",
                "source_icon": "🎨",
                "priority": 2,
                "published": datetime.fromtimestamp(int(img.get('change', time.time())), tz=timezone.utc).isoformat(),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
        return items
    except Exception as e:
        print(f"  ⚠ Safebooru API 请求失败: {e}")
        return []


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
        # 使用浏览器 UA 避免被防火墙拦截 (如 THWiki)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
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


def extract_image(entry) -> Optional[str]:
    """尝试从 feed entry 中提取封面图"""
    # 1. 媒体附件 (Safebooru 等)
    if "media_content" in entry:
        for m in entry.media_content:
            if m.get("medium") == "image":
                return m["url"]
    
    # 2. 媒体缩略图 (YouTube 等)
    if "media_thumbnail" in entry:
        return entry.media_thumbnail[0]["url"]
    
    # 3.  enclosure (WordPress 等)
    if "enclosures" in entry:
        for enc in entry.enclosures:
            if enc.get("type", "").startswith("image/"):
                return enc.get("href")
            
    # 4. 从 description/summary 的 HTML 中提取 img 标签
    content = entry.get("summary", "") or entry.get("description", "") or entry.get("content", [{"value": ""}])[0]["value"]
    soup_match = re.search(r'<img [^>]*src="([^"]+)"', content)
    if soup_match:
        return soup_match.group(1)
        
    return None

# ============================================================
# 🛠️ 核心函数：使用老接口直连 B 站
# ============================================================
def fetch_bilibili_partition_newlist(rid: int, partition_name: str) -> list:
    """
    [战术升级] 使用 /x/web-interface/newlist 接口 (最新视频)
    策略：以量取胜。拉取最新 50 条视频，总有几条是东方的。
    """
    # ps=50 表示一次拉 50 条 (最大值)
    api_url = f"https://api.bilibili.com/x/web-interface/newlist?rid={rid}&ps=50&pn=1"
    
    # 伪造 Cookie 依然是必须的
    fake_buvid3 = str(uuid.uuid4()) + "infoc"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
        "Cookie": f"buvid3={fake_buvid3}; nostalgia_conf=-1"
    }
    
    print(f"    ⚡ 正在请求分区 {rid} ({partition_name}) 最新投稿...")
    
    try:
        resp = requests.get(api_url, headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print(f"    ❌ HTTP Error: {resp.status_code}")
            return []

        data = resp.json()
        if data["code"] != 0:
            print(f"    ❌ 业务拒绝: {data['message']}")
            return []
            
        # 获取视频列表 (新接口结构: data -> archives)
        video_list = data.get("data", {}).get("archives", [])
        
        if not video_list:
            print("    ⚠ 返回列表为空")
            return []

        print(f"    ✅ 成功获取 {len(video_list)} 条候选视频，开始筛选...")
        
        items = []
        dropped_count = 0
        
        for v in video_list:
            title = v["title"]
            desc = v.get("desc", "") or ""
            # 获取作者名，增加判断准确度
            author = v.get("owner", {}).get("name", "")
            
            # 组合检查：标题 + 简介 + 作者
            full_text = f"{title} {desc} {author}"
            
            if is_touhou_related(full_text):
                # 命中！
                items.append({
                    "id": generate_id(v["bvid"], "bilibili_new"),
                    "title": title,
                    "link": f"https://www.bilibili.com/video/{v['bvid']}",
                    "summary": desc[:80].replace("\n", " ") + "...",
                    "image": v["pic"].replace("http:", "https:"),
                    "source": partition_name,
                    "source_icon": "📺", # 这里也可以用传进来的 icon
                    "priority": 1,
                    "published": datetime.fromtimestamp(v["pubdate"], tz=timezone.utc).isoformat(),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                })
            else:
                dropped_count += 1
                # 打印前3个被扔掉的标题，让你知道发生了什么 (调试用)
                if dropped_count <= 3:
                    print(f"       [过滤] 扔掉: {title[:20]}...")

        print(f"    📊 筛选结果: {len(items)} 条命中 / {len(video_list)} 条总数")
        return items

    except Exception as e:
        print(f"    ⚠ 连接异常: {e}")
        return []


def fetch_thwiki_api() -> list:
    """
    [API直连] 获取 THWiki 最近更改 (优先直连，失败转代理 + 重试)
    """
    # 1. THWiki 官方 API 参数
    target_url = "https://thwiki.cc/api.php?action=query&list=recentchanges&rcnamespace=0&rcprop=title|ids|timestamp|user|comment&format=json&rclimit=10"
    
    # 辅助函数：处理数据
    def process_data(data):
        items = []
        rc_list = data.get("query", {}).get("recentchanges", [])
        if not rc_list:
            return []
            
        for rc in rc_list:
            title = rc["title"]
            comment = rc.get("comment", "") or "无编辑摘要"
            user = rc.get("user", "匿名用户")
            # 过滤机器人
            if "bot" in user.lower() or "Bot" in user:
                continue
            items.append({
                "id": f"thwiki_{rc['rcid']}",
                "title": f"【百科】{title}",
                "link": f"https://thwiki.cc/{requests.utils.quote(title)}",
                "summary": f"编者: {user}\n备注: {comment}",
                "image": None,
                "source": "THWiki",
                "source_icon": "📚",
                "priority": 2,
                "published": rc["timestamp"],
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            })
        return items

    # --- 阶段 1: 尝试直连 ---
    print(f"  ⚡ 正在尝试直连 THWiki API...")
    try:
        # 直连通常很快，或者直接不通，所以超时设短一点
        resp = requests.get(target_url, timeout=5, headers={
            "User-Agent": "GensokyoDaily/1.0 (Direct)"
        })
        if resp.status_code == 200:
            data = resp.json()
            items = process_data(data)
            if items:
                print(f"    ✅ 直连成功！获取 {len(items)} 条数据")
                return items
            else:
                print("    ⚠ 直连返回数据为空，尝试代理...")
        else:
            print(f"    ⚠ 直连失败 (HTTP {resp.status_code})，切换代理...")
    except Exception as e:
        print(f"    ⚠ 直连异常 ({e})，切换代理...")

    # --- 阶段 2: 代理重试模式 ---
    proxy_url = f"https://api.allorigins.win/get?url={requests.utils.quote(target_url)}"
    print(f"  ⚡ 启动 Plan B: THWiki API (via AllOrigins)...")
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            # ⏳ 把超时时间从 20s 延长到 30s
            resp = requests.get(proxy_url, timeout=30)
            
            if resp.status_code != 200:
                print(f"    ⚠ [第{attempt}次] 代理返回 HTTP {resp.status_code}，重试中...")
                time.sleep(2)
                continue
                
            wrapper_data = resp.json()
            if not wrapper_data.get("contents"):
                print(f"    ⚠ [第{attempt}次] 代理返回空内容，重试中...")
                time.sleep(2)
                continue
                
            real_data = json.loads(wrapper_data["contents"])
            items = process_data(real_data)
            
            if not items:
                print("    ⚠ THWiki 返回列表为空")
                return []
                
            print(f"    ✅ 代理成功获取 {len(items)} 条维基动态")
            return items

        except Exception as e:
            print(f"    ⚠ [第{attempt}次] 连接异常: {e}")
            if attempt < max_retries:
                print("       等待 5 秒后重试...")
                time.sleep(5)
            else:
                print("    💀 最终失败：THWiki 接口多次尝试均超时")
                return []
    return []

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
        {"name": "命莲寺", "name_jp": "命蓮寺"},
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

        # 特殊处理：如果是 community 分类，先插入 B 站分区数据
        if category_key == "community":
            print(f"  👉 启动 B站分区抓取子系统 (Newlist 概率学模式)...")
            bili_items = []
            for part in BILIBILI_PARTITIONS:
                print(f"  🔗 正在抓取: {part['name']}")
                
                # 调用新函数：fetch_bilibili_partition_newlist
                part_items = fetch_bilibili_partition_newlist(part['rid'], part['name'])
                
                if part_items:
                    for item in part_items:
                        item["source_icon"] = part["icon"] # 补上图标
                        item["category"] = "community"
                    bili_items.extend(part_items)
                else:
                    print(f"  ⚠️ 分区 {part['name']} 暂无命中")
            
            print(f"  ✅ B站分区抓取结束，共 {len(bili_items)} 条数据待合并")
            items.extend(bili_items)

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

        # 将items合并到all_news中
        all_news[category_key] = {
            "label": category_config["label"],
            "items": items,
            "count": len(items),
        }

    # === 3. [新增] 专门调用 THWiki API ===
    print(f"\n📂 分类: 百科动态 (THWiki API)")
    wiki_items = fetch_thwiki_api()
    
    if wiki_items:
        # 把维基数据也合并到 community (社会·民生) 版块
        if "community" not in all_news:
            all_news["community"] = {"label": "社会·民生", "items": [], "count": 0}
        
        all_news["community"]["items"].extend(wiki_items)
        all_news["community"]["count"] += len(wiki_items)

    # === 4. [新增] 专门调用 Safebooru API ===
    print(f"\n📂 分类: 艺术·副刊 (Safebooru API)")
    safe_items = fetch_safebooru_api("touhou")
    print(f"  ✅ Safebooru API 获取 {len(safe_items)} 条")
    
    # 将 Safebooru 数据合并到 art 分类中
    if "art" not in all_news:
        all_news["art"] = {"label": "艺术·副刊", "items": [], "count": 0}
    all_news["art"]["items"].extend(safe_items)
    all_news["art"]["count"] += len(safe_items)

    # === 4. 对所有分类进行统一的去重、排序、截断 ===
    for category_key, category_data in all_news.items():
        original_items = category_data["items"]
        
        # 去重（按 id）
        seen_ids = set()
        unique_items = []
        for item in original_items:
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

        # 更新 category_data
        category_data["items"] = unique_items
        category_data["count"] = len(unique_items)
        
        print(f"  📊 分类 [{category_data['label']}] 最终收录 {len(unique_items)} 条")

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

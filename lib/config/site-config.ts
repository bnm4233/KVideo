/**
 * Site Configuration
 * Handles environment variables for site branding and customization
 */

export interface SiteConfig {
  title: string;
  description: string;
  name: string;
  keywords: string[];
}

/**
 * 兜底关键词。可通过 NEXT_PUBLIC_SITE_KEYWORDS 覆盖（英文逗号或中文逗号分隔）。
 */
const DEFAULT_KEYWORDS = [
  '影视聚合搜索',
  '在线影视',
  '多源搜索',
  '电影',
  '电视剧',
  '动漫',
  '综艺',
  'IPTV',
  '直播源',
  '弹幕',
];

function resolveKeywords(value: string | undefined): string[] {
  if (!value) {
    return DEFAULT_KEYWORDS;
  }

  const parsed = value
    .split(/[,，]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_KEYWORDS;
}

/**
 * Site configuration object
 * Uses environment variables with fallback to default values
 * Note: NEXT_PUBLIC_ environment variables are statically embedded at build time
 */
export const siteConfig: SiteConfig = {
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "幕间影视 - 多源影视聚合搜索与在线播放",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "幕间影视是支持多源检索的影视聚合站，一次搜索即可定位电影、电视剧、动漫、综艺与 IPTV 直播，直接在线播放。",
  name: process.env.NEXT_PUBLIC_SITE_NAME || "幕间影视",
  keywords: resolveKeywords(process.env.NEXT_PUBLIC_SITE_KEYWORDS),
};

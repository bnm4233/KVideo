import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/config/site-url';

/**
 * sitemap.xml
 *
 * 只能列出真正可公开索引的固定路由：
 *   /       首页（搜索入口）
 *   /iptv   直播频道
 *
 * 影片内容页 `/movie/[source]/[id]` 的 (source, id) 组合来自第三方源、
 * 总量不可枚举，无法预先写进站点地图，依靠搜索结果里的站内链接被逐步发现。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/iptv`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      // 爬虫进入站内的落脚点：这个页面服务端直出检索入口，
      // 顺着它才能走到 /search?q=* 再走到 /movie/* 内容页。
      url: `${siteUrl}/search`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}

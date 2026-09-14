import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/config/site-url';

/**
 * robots.txt
 *
 * 只处理「不值得占用抓取预算」的路径：
 *   /api/    纯数据接口，没有可展示内容
 *   /player  参数化的播放器外壳，内容入口是 /movie/*
 *
 * 受口令保护或个人化的页面（/settings、/favorites、/premium）不在这里屏蔽，
 * 而是用页面级 `robots: { index: false }` 处理 —— 这样爬虫才能读到 noindex。
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/player'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

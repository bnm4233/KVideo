import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import type { VideoItem, VideoSource } from '@/lib/types';
import { searchVideos } from '@/lib/api/search-api';
import { siteConfig } from '@/lib/config/site-config';
import { buildMoviePath } from '@/lib/config/site-url';
import { listServerSources } from '@/lib/seo/server-sources';
import { parseVideoTitle } from '@/lib/utils/video';
import { htmlToText } from '@/lib/utils/html';

/**
 * 服务端渲染的检索入口页。
 *
 * 存在的唯一理由是「可发现性」：站内其余路由都是客户端渲染，爬虫拿到的 HTML
 * 里没有任何链接，`/movie/*` 内容页就成了孤岛。这个页面服务端直出结果链接，
 * 让爬虫能顺着 /search → /movie/* 走进去。
 *
 * - 不带 q：热门搜索聚合页，可被索引，作为爬虫进入站内的落脚点
 * - 带 q：真实检索结果，标记 noindex + follow —— 结果页本身是薄内容不值得收录，
 *   但必须让爬虫继续跟踪里面的内容页链接
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_SOURCES = 6;
const MAX_RESULTS_PER_SOURCE = 12;
const MAX_TOTAL_RESULTS = 60;
/** 检索预算：超过就放弃剩余上游，宁可少给结果也不要让页面卡死。 */
const SEARCH_BUDGET_MS = 8000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 40;

const DEFAULT_SEED_QUERIES = [
  '电影',
  '电视剧',
  '动漫',
  '综艺',
  '纪录片',
  '动作片',
  '科幻片',
  '喜剧片',
];

type SearchHit = VideoItem & { sourceName: string };

interface SearchCacheEntry {
  at: number;
  videos: SearchHit[];
}

const searchCache = new Map<string, SearchCacheEntry>();

function normalizeQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function getSeedQueries(): string[] {
  const raw = (process.env.SEO_SEED_QUERIES || '').trim();
  if (!raw) {
    return DEFAULT_SEED_QUERIES;
  }

  const parsed = raw
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_SEED_QUERIES;
}

/**
 * 跨源检索并展平成结果列表。
 * 结果缓存在 isolate 内存里，避免爬虫连续抓取时反复打上游。
 */
async function collectVideos(query: string): Promise<{ videos: SearchHit[]; sourceCount: number }> {
  const sources: VideoSource[] = (await listServerSources())
    .filter((source) => source.group !== 'premium')
    .slice(0, MAX_SOURCES);

  if (sources.length === 0) {
    return { videos: [], sourceCount: 0 };
  }

  const cacheKey = `${sources.map((source) => source.id).join(',')}::${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { videos: cached.videos, sourceCount: sources.length };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_BUDGET_MS);

  let videos: SearchHit[] = [];

  try {
    const nameById = new Map(sources.map((source) => [source.id, source.name]));
    const groups = await searchVideos(query, sources, 1, controller.signal);
    const seen = new Set<string>();

    for (const group of groups) {
      for (const video of (group.results ?? []).slice(0, MAX_RESULTS_PER_SOURCE)) {
        const key = `${video.source}:${video.vod_id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        videos.push({
          ...video,
          sourceName: nameById.get(video.source) ?? video.source,
        });
        if (videos.length >= MAX_TOTAL_RESULTS) {
          break;
        }
      }
      if (videos.length >= MAX_TOTAL_RESULTS) {
        break;
      }
    }
  } catch {
    videos = [];
  } finally {
    clearTimeout(timer);
  }

  if (videos.length > 0) {
    searchCache.set(cacheKey, { at: Date.now(), videos });
    if (searchCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey !== undefined) {
        searchCache.delete(oldestKey);
      }
    }
  }

  return { videos, sourceCount: sources.length };
}

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = normalizeQuery(q);

  if (!query) {
    return {
      title: '影视检索',
      description: `${siteConfig.name} 聚合多个片源，输入片名即可一次搜完所有来源。`,
      alternates: { canonical: '/search' },
    };
  }

  return {
    title: `「${query}」的搜索结果`,
    description: `在 ${siteConfig.name} 聚合检索「${query}」的全部片源结果。`,
    // 结果页是薄内容且组合无限，不收录；但必须 follow，让爬虫继续发现 /movie/* 内容页
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = normalizeQuery(q);

  if (!query) {
    const sources = await listServerSources();
    const seeds = getSeedQueries();

    return (
      <div className="min-h-screen bg-black text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight text-white/85 hover:text-white">
              {siteConfig.name}
            </Link>
            <span className="ml-auto text-xs text-white/40">
              已接入 {sources.length} 个片源
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10">
          <h1 className="text-2xl font-semibold">影视检索</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
            {siteConfig.name} 是一个影视聚合检索工具：一次输入片名，同时向所有已配置片源发起查询，
            把各来源的结果汇总在一起，省去逐个站点查找的麻烦。下面是一些常见检索入口。
          </p>

          <h2 className="mt-9 text-base font-semibold text-white/90">热门检索</h2>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {seeds.map((seed) => (
              <Link
                key={seed}
                href={`/search?q=${encodeURIComponent(seed)}`}
                className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/75 transition-colors hover:border-white/35 hover:text-white"
              >
                {seed}
              </Link>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full bg-[var(--accent-color)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
            >
              直接搜索影片
            </Link>
            <Link
              href="/iptv"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition-colors hover:border-white/35 hover:text-white"
            >
              IPTV 直播频道
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { videos } = await collectVideos(query);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-white/85 hover:text-white">
            {siteConfig.name}
          </Link>
          <Link
            href="/search"
            className="ml-auto rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white"
          >
            换个关键词
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-xl font-semibold">
          「{query}」的搜索结果
        </h1>
        <p className="mt-2 text-xs text-white/45">
          共找到 {videos.length} 条结果，来自 {siteConfig.name} 已接入的片源。
        </p>

        {videos.length === 0 ? (
          <div className="mt-10 rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center">
            <p className="text-sm text-white/60">这个词暂时没有搜到结果。</p>
            <p className="mt-2 text-xs text-white/40">
              换个片名试试，或者到首页用完整名称搜索。
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {videos.map((video) => {
              const { cleanTitle } = parseVideoTitle(video.vod_name);
              const title = cleanTitle || video.vod_name;
              const remarks = htmlToText(video.vod_remarks);

              return (
                <li key={`${video.source}-${video.vod_id}`}>
                  <Link
                    href={buildMoviePath(video.source, video.vod_id)}
                    className="group block"
                    title={title}
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5">
                      <Image
                        src={video.vod_pic?.trim() || '/placeholder-poster.svg'}
                        alt={title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                      {remarks && (
                        <span className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-[11px] text-white/85">
                          {remarks}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 line-clamp-2 text-sm text-white/80 transition-colors group-hover:text-white">
                      {title}
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] text-white/35">{video.sourceName}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/35">
          <p>
            本站是影视聚合检索工具，影片资料与播放地址均来自第三方接口，本站不存储任何视频内容。
          </p>
        </footer>
      </main>
    </div>
  );
}

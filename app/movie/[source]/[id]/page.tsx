import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { siteConfig } from '@/lib/config/site-config';
import { buildMoviePath, getSiteUrl, toAbsoluteUrl } from '@/lib/config/site-url';
import { loadMovieDetail, resolveSchemaType } from '@/lib/seo/movie-detail';
import { resolveServerSource } from '@/lib/seo/server-sources';
import { htmlToText } from '@/lib/utils/html';

/**
 * 影片内容页 —— 全站唯一可被搜索引擎收录真实内容的页面。
 *
 * 其它路由都是客户端渲染，服务端吐出来的 HTML 只有外壳，爬虫拿不到
 * 片名/简介/选集这类可索引信息，所以这里必须服务端渲染。
 */

export const runtime = 'edge';
// 内容来自第三方接口，构建期无法预渲染，必须按请求实时取
export const dynamic = 'force-dynamic';

const MAX_EPISODE_LINKS = 200;
const META_DESCRIPTION_LIMIT = 150;
const FALLBACK_POSTER = '/placeholder-poster.svg';

type MoviePageProps = {
  params: Promise<{ source: string; id: string }>;
};

/** 去掉换行与多余空白并截断，用于 meta description。 */
function toMetaDescription(value: string, limit = META_DESCRIPTION_LIMIT): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

/** 演员/导演字段是「/」或「、」分隔的字符串，拆成 schema.org Person 列表。 */
function toPersonList(value?: string): { '@type': 'Person'; name: string }[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[/、,，]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((name) => ({ '@type': 'Person' as const, name }));
}

/**
 * 播放器地址。
 * `episode` 是 `useVideoPlayer` 解析的**数组下标**（parseInt 后按 episodes 长度校验），
 * 所以这里必须传下标而不是集数。
 */
function buildPlayerHref(options: {
  source: string;
  id: string;
  title?: string;
  episodeIndex?: number;
  premium?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('id', options.id);
  params.set('source', options.source);

  if (options.title) {
    params.set('title', options.title);
  }
  if (typeof options.episodeIndex === 'number') {
    params.set('episode', String(options.episodeIndex));
  }
  if (options.premium) {
    params.set('premium', '1');
  }

  return `/player?${params.toString()}`;
}

/** 结构化数据脚本。转义 `<` 以免简介里出现 `</script>` 提前闭合标签。 */
function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const { source, id } = await params;
  const detail = await loadMovieDetail(source, id);

  if (!detail) {
    // 页面会重定向回播放器，这里只给一个不会被收录的兜底
    return {
      title: '影片详情',
      robots: { index: false, follow: false },
    };
  }

  const synopsis = htmlToText(detail.vod_content);
  const subtitle = [detail.type_name, detail.vod_year, detail.vod_area, detail.vod_remarks]
    .map((item) => htmlToText(item))
    .filter(Boolean)
    .join(' · ');

  const description = toMetaDescription(
    synopsis || [detail.vod_name, subtitle].filter(Boolean).join('：'),
  );

  const canonicalPath = buildMoviePath(source, id);
  const posterUrl = toAbsoluteUrl(detail.vod_pic?.trim() || FALLBACK_POSTER);
  const title = `${detail.vod_name}${subtitle ? ` - ${subtitle}` : ''}`;

  return {
    title: detail.vod_name,
    description,
    keywords: [detail.vod_name, detail.type_name, detail.vod_area, detail.vod_year].filter(
      (item): item is string => Boolean(item),
    ),
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'video.movie',
      siteName: siteConfig.name,
      title,
      description,
      url: toAbsoluteUrl(canonicalPath),
      locale: 'zh_CN',
      images: [{ url: posterUrl, alt: detail.vod_name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [posterUrl],
    },
  };
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { source: sourceId, id } = await params;

  if (!sourceId || !id) {
    notFound();
  }

  const serverSource = await resolveServerSource(sourceId);

  // 服务端不认识的源（例如用户只在浏览器里自建的源）、以及口令保护的高级源，
  // 都不适合做公开内容页 —— 直接交回播放器，避免把用户挡在 404 上。
  if (!serverSource || serverSource.group === 'premium') {
    redirect(
      buildPlayerHref({
        source: sourceId,
        id,
        premium: serverSource?.group === 'premium',
      }),
    );
  }

  const detail = await loadMovieDetail(sourceId, id);

  // 片源可识别但上游抓取失败（超时/下架）。这时重定向到播放器，
  // 让用户看到播放器自带的错误提示与重试入口，而不是一堵 404。
  if (!detail) {
    redirect(buildPlayerHref({ source: sourceId, id }));
  }

  const canonicalPath = buildMoviePath(sourceId, id);
  const canonicalUrl = toAbsoluteUrl(canonicalPath);
  const posterSrc = detail.vod_pic?.trim() || FALLBACK_POSTER;
  const synopsis = htmlToText(detail.vod_content);
  const schemaType = resolveSchemaType(detail.type_name);

  const badges = [
    detail.vod_remarks,
    detail.vod_year,
    detail.vod_area,
    detail.type_name,
    detail.vod_lang,
  ]
    .map((item) => htmlToText(item))
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)
    .slice(0, 5);

  const metaRows = [
    { label: '分类', value: htmlToText(detail.type_name) },
    { label: '年份', value: htmlToText(detail.vod_year) },
    { label: '地区', value: htmlToText(detail.vod_area) },
    { label: '语言', value: htmlToText(detail.vod_lang) },
    { label: '状态', value: htmlToText(detail.vod_remarks) },
    { label: '导演', value: htmlToText(detail.vod_director) },
    { label: '主演', value: htmlToText(detail.vod_actor) },
  ].filter((row) => Boolean(row.value));

  const episodes = detail.episodes ?? [];
  const visibleEpisodes = episodes.slice(0, MAX_EPISODE_LINKS);

  // 分类词（如「动作片/科幻片」）是天然的相关检索入口：把内容页和检索页连成
  // 一张互相可达的链接网，爬虫从任意一页进来都能继续往里走。
  const relatedQueries = htmlToText(detail.type_name)
    .split(/[/、,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  const primaryHref = buildPlayerHref({
    source: sourceId,
    id,
    title: detail.vod_name,
  });

  const movieSchema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: detail.vod_name,
    url: canonicalUrl,
    ...(detail.vod_pic ? { image: toAbsoluteUrl(detail.vod_pic) } : {}),
    ...(synopsis ? { description: synopsis } : {}),
    ...(detail.vod_year ? { datePublished: detail.vod_year } : {}),
    ...(detail.vod_area ? { countryOfOrigin: detail.vod_area } : {}),
    ...(detail.vod_lang ? { inLanguage: detail.vod_lang } : {}),
    ...(detail.type_name ? { genre: detail.type_name } : {}),
    ...(detail.vod_director ? { director: toPersonList(detail.vod_director) } : {}),
    ...(detail.vod_actor ? { actor: toPersonList(detail.vod_actor) } : {}),
    ...(schemaType === 'TVSeries' && episodes.length > 0
      ? { numberOfEpisodes: episodes.length }
      : {}),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: '首页',
        item: getSiteUrl(),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: detail.vod_name,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <JsonLd data={movieSchema} />
      <JsonLd data={breadcrumbSchema} />

      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-white/85 transition-colors hover:text-white"
          >
            {siteConfig.name}
          </Link>
          <Link
            href="/"
            className="ml-auto rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white"
          >
            搜索其它影片
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav aria-label="面包屑" className="mb-5 flex items-center gap-2 text-xs text-white/45">
          <Link href="/" className="transition-colors hover:text-white/85">
            首页
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-white/75">{detail.vod_name}</span>
        </nav>

        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative mx-auto aspect-[2/3] w-40 flex-shrink-0 overflow-hidden rounded-xl bg-white/5 sm:mx-0 sm:w-52">
            <Image
              src={posterSrc}
              alt={`${detail.vod_name} 海报`}
              fill
              unoptimized
              priority
              sizes="(max-width: 640px) 160px, 208px"
              referrerPolicy="no-referrer"
              className="object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{detail.vod_name}</h1>

            {badges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-white/70"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}

            {metaRows.length > 0 && (
              <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {metaRows.map((row) => (
                  <div key={row.label} className="flex gap-2">
                    <dt className="flex-shrink-0 text-white/40">{row.label}</dt>
                    <dd className="min-w-0 text-white/80">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {episodes.length > 0 ? (
                <Link
                  href={primaryHref}
                  className="rounded-full bg-[var(--accent-color)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
                >
                  开始播放
                </Link>
              ) : (
                <span className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/50">
                  该片源暂无可播放地址
                </span>
              )}

              <span className="text-xs text-white/40">
                来自「{serverSource.name}」
                {episodes.length > 0 && ` · 共 ${episodes.length} 集`}
              </span>
            </div>
          </div>
        </div>

        {synopsis && (
          <section className="mt-9">
            <h2 className="text-base font-semibold text-white/90">剧情简介</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/65">
              {synopsis}
            </p>
          </section>
        )}

        {visibleEpisodes.length > 0 && (
          <section className="mt-9">
            <h2 className="text-base font-semibold text-white/90">选集播放</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {visibleEpisodes.map((episode, index) => (
                <Link
                  key={`${episode.index}-${episode.name}`}
                  href={buildPlayerHref({
                    source: sourceId,
                    id,
                    title: detail.vod_name,
                    episodeIndex: index,
                  })}
                  className="truncate rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white"
                  title={episode.name || `第 ${index + 1} 集`}
                >
                  {episode.name || `第 ${index + 1} 集`}
                </Link>
              ))}
            </div>

            {episodes.length > visibleEpisodes.length && (
              <p className="mt-3 text-xs text-white/40">
                共 {episodes.length} 集，其余剧集请在播放器中查看。
              </p>
            )}
          </section>
        )}

        {relatedQueries.length > 0 && (
          <section className="mt-9">
            <h2 className="text-base font-semibold text-white/90">相关检索</h2>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {relatedQueries.map((keyword) => (
                <Link
                  key={keyword}
                  href={`/search?q=${encodeURIComponent(keyword)}`}
                  className="rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/35">
          <p>
            本站是影视聚合搜索工具，影片资料与播放地址均来自第三方接口，本站不存储任何视频内容。
            如果内容无法播放，通常是上游片源变动所致，可以返回首页换一个来源搜索。
          </p>
        </footer>
      </main>
    </div>
  );
}

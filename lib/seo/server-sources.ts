/**
 * Server-side Source Registry
 *
 * 站内所有片源都来自部署环境变量，而不是仓库里的静态列表
 * （`DEFAULT_SOURCES` / `PREMIUM_SOURCES` 都是空数组）。
 *
 * 解析链路：
 *   SUBSCRIPTION_SOURCES / NEXT_PUBLIC_SUBSCRIPTION_SOURCES
 *     ├─ JSON 数组：`[{"name":"源A","url":"https://x/api.json"}]`
 *     └─ 逗号分隔的订阅地址：`https://a.json,https://b.json`
 *   → 逐个拉取订阅 JSON → 解析出真正的片源列表（含 id / baseUrl）
 *
 * 服务端渲染的内容页必须能按 id 找到片源，所以这里做一层带缓存的注册表。
 */

import type { VideoSource } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/api/http-utils';
import { parseSourcesFromJson } from '@/lib/utils/source-import-utils';

/** 片源注册表缓存时长。片源变动极少，且每次冷启动都要走一遍网络。 */
const REGISTRY_TTL_MS = 10 * 60 * 1000;

/** 拉取订阅 JSON 的超时时间，独立于影片详情，避免拖垮首屏。 */
const SUBSCRIPTION_TIMEOUT_MS = 8000;

let cachedSources: VideoSource[] | null = null;
let cachedAt = 0;
let inflight: Promise<VideoSource[]> | null = null;

/** 从环境变量中取出订阅地址列表，兼容 JSON 与逗号分隔两种写法。 */
function readSubscriptionUrls(): string[] {
  const raw = (
    process.env.SUBSCRIPTION_SOURCES ||
    process.env.NEXT_PUBLIC_SUBSCRIPTION_SOURCES ||
    ''
  ).trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) =>
          item && typeof (item as { url?: unknown }).url === 'string'
            ? (item as { url: string }).url.trim()
            : '',
        )
        .filter((url) => url.startsWith('http'));
    }
  } catch {
    // 不是 JSON，按逗号分隔的地址处理
  }

  return raw
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.startsWith('http'));
}

/** 拉取并解析单个订阅地址，失败时返回空列表（单条订阅坏掉不影响其它）。 */
async function fetchSubscriptionSources(url: string): Promise<VideoSource[]> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      SUBSCRIPTION_TIMEOUT_MS,
    );

    if (!response.ok) {
      return [];
    }

    const { normalSources, premiumSources } = parseSourcesFromJson(await response.text());
    return [...normalSources, ...premiumSources];
  } catch {
    return [];
  }
}

async function fetchAllSources(): Promise<VideoSource[]> {
  const urls = readSubscriptionUrls();
  if (urls.length === 0) {
    return [];
  }

  const results = await Promise.all(urls.map(fetchSubscriptionSources));

  // 按 id 去重，先出现的订阅优先
  const byId = new Map<string, VideoSource>();
  for (const list of results) {
    for (const source of list) {
      if (!byId.has(source.id)) {
        byId.set(source.id, source);
      }
    }
  }

  return [...byId.values()];
}

/**
 * 读取片源注册表。
 *
 * - 命中 TTL 内缓存直接返回
 * - 并发请求共用同一次网络请求（inflight 去重）
 * - 刷新失败时沿用上一次成功的结果，避免上游抖动导致整站内容页集体失效
 */
async function loadRegistry(): Promise<VideoSource[]> {
  if (cachedSources && Date.now() - cachedAt < REGISTRY_TTL_MS) {
    return cachedSources;
  }

  if (!inflight) {
    inflight = fetchAllSources()
      .then((sources) => {
        cachedSources = sources;
        cachedAt = Date.now();
        return sources;
      })
      .catch(() => cachedSources ?? [])
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}

/** 按 id 查找服务端可见的片源，找不到返回 undefined。 */
export async function resolveServerSource(id: string): Promise<VideoSource | undefined> {
  if (!id) {
    return undefined;
  }

  const sources = await loadRegistry();
  return sources.find((source) => source.id === id);
}

/**
 * 服务端可见的全部片源，供服务端渲染的列表页 / 检索页使用。
 * 已关闭的片源会被剔除。
 */
export async function listServerSources(): Promise<VideoSource[]> {
  const sources = await loadRegistry();
  return sources.filter((source) => source.enabled !== false);
}

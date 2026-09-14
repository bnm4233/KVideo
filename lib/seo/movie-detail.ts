import { cache } from 'react';

import type { VideoDetail } from '@/lib/types';
import { getVideoDetail } from '@/lib/api/detail-api';
import { resolveServerSource } from '@/lib/seo/server-sources';

/**
 * 读取影片详情，供内容页的服务端渲染使用。
 *
 * 返回 null 表示"服务端拿不到可索引的内容"，调用方据此决定降级策略：
 * 高级源（口令保护）不该出现在公开索引里，直接跳过。
 *
 * 用 React `cache` 包裹，保证同一次请求内 `generateMetadata` 与页面组件
 * 只会真正请求一次上游。
 */
export const loadMovieDetail = cache(
  async (sourceId: string, id: string): Promise<VideoDetail | null> => {
    const source = await resolveServerSource(sourceId);
    if (!source || source.group === 'premium') {
      return null;
    }

    try {
      return await getVideoDetail(id, source);
    } catch {
      // 上游超时 / 下架 / 报错统一按"暂无内容"处理，交给调用方降级
      return null;
    }
  },
);

/** 依据分类名推断 schema.org 类型，剧集类内容用 TVSeries 更准确。 */
export function resolveSchemaType(typeName?: string): 'Movie' | 'TVSeries' {
  if (!typeName) {
    return 'Movie';
  }

  return /剧|动漫|动画|综艺|纪录/.test(typeName) ? 'TVSeries' : 'Movie';
}

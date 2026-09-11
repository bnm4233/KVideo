/**
 * MovieGrid - Grid layout for movie cards with infinite scroll
 * Handles movie display and loading states
 */

import { Fragment } from 'react';
import { MovieCard } from './MovieCard';
import { Icons } from '@/components/ui/Icon';
import { InFeedAd, IN_FEED_AD_INTERVAL } from '@/components/ads/AdSlots';

interface DoubanMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface MovieGridProps {
  movies: DoubanMovie[];
  loading: boolean;
  hasMore: boolean;
  onMovieClick: (movie: DoubanMovie) => void;
  prefetchRef: React.RefObject<HTMLDivElement | null>;
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
}

export function MovieGrid({
  movies,
  loading,
  hasMore,
  onMovieClick,
  prefetchRef,
  loadMoreRef
}: MovieGridProps) {
  if (movies.length === 0 && !loading) {
    return <MovieGridEmpty />;
  }

  // 按固定条数切块，广告插在块与块之间，避免整行插入把某一行顶出空位
  const chunks: DoubanMovie[][] = [];
  for (let i = 0; i < movies.length; i += IN_FEED_AD_INTERVAL) {
    chunks.push(movies.slice(i, i + IN_FEED_AD_INTERVAL));
  }

  return (
    <>
      <div className="space-y-4 md:space-y-6">
        {chunks.map((chunk, chunkIndex) => (
          <Fragment key={`chunk-${chunkIndex}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {chunk.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onMovieClick={onMovieClick}
                />
              ))}
            </div>
            {chunkIndex < chunks.length - 1 && <InFeedAd />}
          </Fragment>
        ))}
      </div>

      {/* Prefetch Trigger - Earlier */}
      {hasMore && !loading && <div ref={prefetchRef} className="h-1" />}

      {/* Loading Indicator */}
      {loading && <MovieGridLoading />}

      {/* Intersection Observer Target */}
      {hasMore && !loading && <div ref={loadMoreRef} className="h-20" />}

      {/* No More Content */}
      {!hasMore && movies.length > 0 && <MovieGridNoMore />}
    </>
  );
}

function MovieGridLoading() {
  return (
    <div className="flex justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--accent-color)] border-t-transparent"></div>
        <p className="text-sm text-[var(--text-color-secondary)]">加载中...</p>
      </div>
    </div>
  );
}

function MovieGridNoMore() {
  return (
    <div className="text-center py-12">
      <p className="text-[var(--text-color-secondary)]">没有更多内容了</p>
    </div>
  );
}

function MovieGridEmpty() {
  return (
    <div className="text-center py-20">
      <Icons.Film size={64} className="text-[var(--text-color-secondary)] mx-auto mb-4" />
      <p className="text-[var(--text-color-secondary)]">暂无内容</p>
    </div>
  );
}

'use client';

import { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { VideoCard } from './VideoCard';
import { VideoGroupCard, GroupedVideo } from './VideoGroupCard';
import { settingsStore } from '@/lib/store/settings-store';
import { Video } from '@/lib/types';
import { useResolutionProbe } from '@/lib/hooks/useResolutionProbe';

/** 网格条目：普通卡片或聚合卡片 */
type GridItem =
  | { kind: 'group'; group: GroupedVideo; cardId: string }
  | { kind: 'video'; video: Video; videoUrl: string; cardId: string };

interface VideoGridProps {
  videos: Video[];
  className?: string;
  isPremium?: boolean;
  latencies?: Record<string, number>;
}

export const VideoGrid = memo(function VideoGrid({
  videos,
  className = '',
  isPremium = false,
  latencies = {}
}: VideoGridProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const [displayMode, setDisplayMode] = useState<'normal' | 'grouped'>('normal');
  const gridRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load display mode from settings
  useEffect(() => {
    const settings = settingsStore.getSettings();
    setDisplayMode(settings.searchDisplayMode);

    // Initial load: Check for saved scroll position to ensure we render enough items
    const params = searchParams.toString();
    const scrollKey = `scroll-pos:${pathname}${params ? '?' + params : ''}`;
    const savedPos = sessionStorage.getItem(scrollKey);

    if (savedPos && settings.rememberScrollPosition) {
      const position = parseInt(savedPos, 10);
      if (!isNaN(position) && position > 500) {
        // Approximate visible count needed: 
        // 500 is roughly where the second/third row starts.
        // Each row is ~300-400px high on most screens. 
        // 24 items is 4-6 rows.
        // If scroll is deep, we force a larger initial visible count.
        // 24, 48, 72, 96...
        const estimatedRowsNeeded = Math.ceil(position / 300) + 2;
        // Match CSS breakpoints: sm: 3, md: 4, lg: 5, xl: 6
        const itemsPerRow = window.innerWidth >= 1280 ? 6 :
          (window.innerWidth >= 1024 ? 5 :
            (window.innerWidth >= 768 ? 4 :
              (window.innerWidth >= 640 ? 3 : 2)));
        const neededCount = Math.min(videos.length, estimatedRowsNeeded * itemsPerRow);

        if (neededCount > 24) {
          setVisibleCount(Math.ceil(neededCount / 24) * 24);
        }
      }
    }

    const unsubscribe = settingsStore.subscribe(() => {
      const newSettings = settingsStore.getSettings();
      setDisplayMode(newSettings.searchDisplayMode);
    });

    return () => unsubscribe();
  }, [pathname, searchParams, videos.length]);

  if (videos.length === 0) {
    return null;
  }

  // Build stable list of videos to probe for resolution
  const videosToProbe = useMemo(() => {
    if (displayMode === 'grouped') {
      // For grouped mode, will probe after grouping
      return [];
    }
    return videos.map(v => ({ id: String(v.vod_id), source: v.source }));
  }, [videos, displayMode]);

  // Group videos by name when in grouped mode
  const groupedVideos = useMemo<GroupedVideo[]>(() => {
    if (displayMode !== 'grouped') return [];

    const groups = new Map<string, Video[]>();

    videos.forEach(video => {
      const name = video.vod_name.toLowerCase().trim();
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name)!.push(video);
    });

    return Array.from(groups.entries()).map(([, groupVideos]) => {
      // Sort by latency (lowest first) 
      const sorted = [...groupVideos].sort((a, b) => {
        if (a.latency === undefined) return 1;
        if (b.latency === undefined) return -1;
        return a.latency - b.latency;
      });

      return {
        representative: sorted[0],
        videos: sorted,
        name: sorted[0].vod_name,
      };
    });
  }, [videos, displayMode]);

  // Callback ref for the load more trigger
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();

    if (node) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 24);
        }
      }, { rootMargin: '400px' });

      observerRef.current.observe(node);
    }
  }, []);

  // Memoize the click handler
  const handleCardClick = useCallback((e: React.MouseEvent, videoId: string, videoUrl: string) => {
    const isMobile = window.innerWidth < 1024;

    if (isMobile) {
      if (activeCardId === videoId) {
        window.location.href = videoUrl;
      } else {
        e.preventDefault();
        setActiveCardId(videoId);
      }
    }
  }, [activeCardId]);

  // Normal mode items
  const videoItems = useMemo(() => {
    if (displayMode === 'grouped') return [];

    return videos.map((video, index) => {
      const params: Record<string, string> = {
        id: String(video.vod_id),
        source: video.source,
        title: video.vod_name,
      };

      if (isPremium) {
        params.premium = '1';
      }

      const videoUrl = `/player?${new URLSearchParams(params).toString()}`;

      const cardId = `${video.vod_id}-${index}`;

      return { video, videoUrl, cardId };
    });
  }, [videos, displayMode, isPremium]);

  // Grouped mode items
  const groupItems = useMemo(() => {
    if (displayMode !== 'grouped') return [];

    return groupedVideos.map((group, index) => ({
      group,
      cardId: `group-${group.representative.vod_id}-${index}`,
    }));
  }, [groupedVideos, displayMode]);

  // Build probe list for grouped mode (probe representative of each group)
  const groupedProbeList = useMemo(() => {
    if (displayMode !== 'grouped') return [];
    return groupedVideos.map(g => ({ id: String(g.representative.vod_id), source: g.representative.source }));
  }, [groupedVideos, displayMode]);

  // Probe resolutions
  const probeList = displayMode === 'grouped' ? groupedProbeList : videosToProbe;
  const { resolutions, isProbing } = useResolutionProbe(probeList);

  const totalItems = displayMode === 'grouped' ? groupItems.length : videoItems.length;

  // 当前可见条目（按展示模式统一成一种结构，方便切块）
  const visibleItems: GridItem[] = useMemo(() => {
    if (displayMode === 'grouped') {
      return groupItems
        .slice(0, visibleCount)
        .map(({ group, cardId }) => ({ kind: 'group' as const, group, cardId }));
    }
    return videoItems
      .slice(0, visibleCount)
      .map(({ video, videoUrl, cardId }) => ({ kind: 'video' as const, video, videoUrl, cardId }));
  }, [displayMode, groupItems, videoItems, visibleCount]);

  return (
    <>
      <div
        ref={gridRef}
        className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6 max-w-[1920px] mx-auto ${className}`}
        role="list"
        aria-label="视频搜索结果"
      >
        {visibleItems.map((item) => {
          if (item.kind === 'group') {
            const isActive = activeCardId === item.cardId;
            const resolution = resolutions[`${item.group.representative.source}:${item.group.representative.vod_id}`];
            return (
              <VideoGroupCard
                key={item.cardId}
                group={item.group}
                cardId={item.cardId}
                isActive={isActive}
                onCardClick={handleCardClick}
                isPremium={isPremium}
                latencies={latencies}
                resolution={resolution}
                isProbing={isProbing && !resolution}
              />
            );
          }

          const isActive = activeCardId === item.cardId;
          const resolution = resolutions[`${item.video.source}:${item.video.vod_id}`];
          return (
            <VideoCard
              key={item.cardId}
              video={item.video}
              videoUrl={item.videoUrl}
              cardId={item.cardId}
              isActive={isActive}
              onCardClick={handleCardClick}
              isPremium={isPremium}
              latencies={latencies}
              resolution={resolution}
              isProbing={isProbing && !resolution}
            />
          );
        })}
      </div>

      {/* Load more trigger */}
      {visibleCount < totalItems && (
        <div
          ref={loadMoreRef}
          className="h-20 w-full flex items-center justify-center opacity-0 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </>
  );
});


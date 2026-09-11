'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdFrame } from './AdFrame';

/**
 * 内容区横幅：桌面显示 728x90，窄屏切换为 320x50。
 * 只在匹配到断点后才挂载对应 iframe，避免同时加载两个广告。
 */
export function ResponsiveAdBanner({ className }: { className?: string }) {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return (
    <div className={className}>
      <div className="flex w-full items-center justify-center">
        {isDesktop === true && <AdFrame size="728x90" />}
        {isDesktop === false && <AdFrame size="320x50" />}
      </div>
    </div>
  );
}

/** 中等矩形横幅（300x250），用于内容流收尾 */
export function RectangleAdBanner({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex w-full items-center justify-center">
        <AdFrame size="300x250" />
      </div>
    </div>
  );
}

/** 窄横幅（468x60），用于设置页等窄容器页面 */
export function CompactAdBanner({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex w-full items-center justify-center">
        <AdFrame size="468x60" />
      </div>
    </div>
  );
}

/** 原生信息流广告，宽度自适应容器 */
export function NativeAdBanner({
  className,
  height = 250,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div className={className}>
      <iframe
        src="/ads/native.html"
        title="赞助内容"
        scrolling="no"
        loading="lazy"
        className="w-full"
        style={{ border: 0, display: 'block', height, backgroundColor: 'transparent' }}
      />
    </div>
  );
}

/**
 * 宽屏（≥1536px）两侧的竖向广告。
 * 页面是居中单列布局，超宽屏两侧的留白刚好可以放 160 宽的竖幅。
 * 观看类页面（播放 / 直播）不展示，避免干扰。
 */
export function SideRailAds() {
  const [isWide, setIsWide] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1536px)');
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const isWatchPage = pathname?.startsWith('/player') || pathname?.startsWith('/iptv');
  if (!isWide || isWatchPage) return null;

  return (
    <>
      <div className="fixed left-[64px] top-1/2 z-10 -translate-y-1/2">
        <AdFrame size="160x600" label="左侧广告" />
      </div>
      <div className="fixed right-[64px] top-1/2 z-10 -translate-y-1/2">
        <AdFrame size="160x300" label="右侧广告" />
      </div>
    </>
  );
}

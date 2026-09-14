import type { Metadata } from 'next';
import Link from 'next/link';

import { siteConfig } from '@/lib/config/site-config';

export const metadata: Metadata = {
  title: '页面不存在',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-white">
      <p className="text-6xl font-semibold tracking-tight text-white/15">404</p>
      <h1 className="mt-4 text-xl font-semibold">页面不存在</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/45">
        链接可能已经失效，或者这个影片在当前片源里已经下架了。回首页重新搜索通常能找到其它可用来源。
      </p>
      <Link
        href="/"
        className="mt-7 rounded-full bg-[var(--accent-color)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
      >
        返回 {siteConfig.name} 首页
      </Link>
    </div>
  );
}

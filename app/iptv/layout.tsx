import type { Metadata } from 'next';
import { siteConfig } from '@/lib/config/site-config';

export const metadata: Metadata = {
  title: 'IPTV 直播',
  description: `在 ${siteConfig.name} 观看 IPTV 直播频道，支持自定义直播源订阅、频道分组与快速切换。`,
  alternates: {
    canonical: '/iptv',
  },
};

export default function IPTVLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

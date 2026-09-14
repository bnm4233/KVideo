import type { Metadata } from 'next';

/**
 * 收藏页是个人化数据，无公共内容，不参与索引。
 */
export const metadata: Metadata = {
  title: '我的收藏',
  robots: {
    index: false,
    follow: false,
  },
};

export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

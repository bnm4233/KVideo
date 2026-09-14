import type { Metadata } from 'next';

/**
 * 高级源页面由访问口令保护，属于非公开内容，不参与索引。
 */
export const metadata: Metadata = {
  title: '高级源',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PremiumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

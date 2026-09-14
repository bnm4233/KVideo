import type { Metadata } from 'next';

/**
 * 设置页受访问口令保护，属于非公开内容，不参与索引。
 */
export const metadata: Metadata = {
  title: '设置',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

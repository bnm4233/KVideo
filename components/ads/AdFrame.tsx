'use client';

import type { CSSProperties } from 'react';

/**
 * 各广告位对应的投放 key。
 * key 来自广告平台后台生成的横幅代码，仅用于拼接 invoke.js 地址。
 */
export const AD_KEYS = {
  '728x90': '3fb41a310bd889e6a29429e88e6e8623',
  '320x50': 'b20872b980fad024193f11eaa628252f',
  '160x600': 'c0a061bbd22c600912cde57b83bbcf1b',
  '160x300': '3b34f064b732cec97cb6c4e8649df1be',
  '300x250': '051d871e7d2fd924a84ff7fdde390522',
  '468x60': 'c6ad06dc9fda6265c11dea750766508e',
} as const;

export type AdSize = keyof typeof AD_KEYS;

interface AdFrameProps {
  size: AdSize;
  /** iframe 无障碍标题 */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 通过同域 iframe 加载广告。
 *
 * 为什么不直接把 <script> 注入页面：
 * 1. 横幅脚本依赖全局 `atOptions`，同页多个广告会互相覆盖；
 * 2. 部分横幅脚本执行 document.write，直接注入会清空整页；
 * 3. SPA 路由切换时脚本重复执行难以收敛。
 * 放进 iframe 后每个广告拥有独立 window，以上问题都不存在。
 */
export function AdFrame({ size, label = '广告', className, style }: AdFrameProps) {
  const [width, height] = size.split('x').map(Number) as [number, number];

  return (
    <iframe
      src={`/ads/banner.html?key=${AD_KEYS[size]}&w=${width}&h=${height}`}
      width={width}
      height={height}
      title={label}
      scrolling="no"
      loading="lazy"
      className={className}
      style={{ border: 0, display: 'block', backgroundColor: 'transparent', ...style }}
    />
  );
}

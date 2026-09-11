'use client';

import { useEffect } from 'react';

/** 全站悬浮广告（Social Bar） */
const SOCIAL_BAR_SRC =
  'https://pl31298042.profitableratecpmnetwork.com/7b/30/50/7b3050ee035f8911860abb2f2405f2fb.js';

/**
 * Popunder：会在用户点击页面任意位置时弹窗。
 * 播放页里几乎每次点播放 / 选集 / 进度条都会触发，体验损失较大，默认关闭。
 * 需要时把下面的开关改为 true 即可。
 */
const ENABLE_POPUNDER = false;
const POPUNDER_SRC =
  'https://pl31298040.profitableratecpmnetwork.com/12/8c/2d/128c2d2e2590f72294e9558c143da8e5.js';

function injectOnce(src: string, marker: string) {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`script[data-kvideo-ad="${marker}"]`)) return;

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset.kvideoAd = marker;
  document.body.appendChild(script);
}

/** 全局第三方广告脚本，只在 layout 挂载一次 */
export function AdGlobalScripts() {
  useEffect(() => {
    injectOnce(SOCIAL_BAR_SRC, 'social-bar');
    if (ENABLE_POPUNDER) injectOnce(POPUNDER_SRC, 'popunder');
  }, []);

  return null;
}

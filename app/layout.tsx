import React, { Suspense } from 'react';
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AutoSync } from '@/components/AutoSync'; // <-- 引入了自动同步组件
import { SiteIconProvider } from '@/components/SiteIconProvider';
import { TVProvider } from "@/lib/contexts/TVContext";
import { TVNavigationInitializer } from "@/components/TVNavigationInitializer";
import { Analytics } from "@vercel/analytics/react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { RuntimeConfigInitializer } from "@/components/RuntimeConfigInitializer";
import { siteConfig } from "@/lib/config/site-config";
import { getSiteUrl } from "@/lib/config/site-url";
import { AdKeywordsInjector } from "@/components/AdKeywordsInjector";
import { BackToTop } from "@/components/ui/BackToTop";
import { ScrollPositionManager } from "@/components/ScrollPositionManager";
import { LocaleProvider } from "@/components/LocaleProvider";
import { RuntimeFeaturesProvider } from "@/components/RuntimeFeaturesProvider";
import { VideoTogetherController } from '@/components/VideoTogetherController';
import { shouldEnableVercelAnalytics } from '@/lib/config/deployment';
import { getRuntimeFeatures } from "@/lib/server/runtime-features";
import { resolveSiteIconSrc } from '@/lib/server/site-icon';
import fs from 'fs';
import path from 'path';

const DEFAULT_VIDEOTOGETHER_SCRIPT_URL =
  'https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/extension.website.user.js';

// Server Component specifically for reading env/file (async for best practices)
async function AdKeywordsWrapper() {
  let keywords: string[] = [];

  try {
    // 1. Try reading from file (Docker runtime support)
    const keywordsFile = process.env.AD_KEYWORDS_FILE;
    if (keywordsFile) {
      // Resolve absolute path or relative to CWD
      const filePath = path.isAbsolute(keywordsFile)
        ? keywordsFile
        : path.join(process.cwd(), keywordsFile);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        keywords = content.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
        console.log(`[AdFilter] Loaded ${keywords.length} keywords from file: ${filePath}`);
      } catch (fileError: unknown) {
        // Handle file not found (ENOENT) gracefully
        if ((fileError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn('[AdFilter] Error reading keywords file:', fileError);
        }
      }
    }

    // 2. Fallback to Env var (Runtime or Build time)
    if (keywords.length === 0) {
      const envKeywords = process.env.AD_KEYWORDS || process.env.NEXT_PUBLIC_AD_KEYWORDS;
      if (envKeywords) {
        keywords = envKeywords.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
      }
    }
  } catch (error) {
    console.warn('[AdFilter] Failed to load keywords:', error);
  }

  return <AdKeywordsInjector keywords={keywords} />;
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export async function generateMetadata(): Promise<Metadata> {
  const siteIconSrc = await resolveSiteIconSrc();
  const siteUrl = getSiteUrl();

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: siteConfig.title,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
    applicationName: siteConfig.name,
    keywords: siteConfig.keywords,
    manifest: '/manifest.json',
    // canonical 刻意不在根布局声明：它表示「本页自身地址」，
    // 写在这里会被所有子页面继承成首页地址，导致内容页被判为重复内容。
    icons: {
      icon: siteIconSrc,
      apple: siteIconSrc,
    },
    appleWebApp: {
      capable: true,
      title: siteConfig.name,
      statusBarStyle: 'black-translucent',
    },
    formatDetection: {
      telephone: false,
      email: false,
      address: false,
    },
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title: siteConfig.title,
      description: siteConfig.description,
      url: '/',
      locale: 'zh_CN',
      images: [
        {
          url: siteIconSrc,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: siteConfig.title,
      description: siteConfig.description,
      images: [siteIconSrc],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteIconSrc = await resolveSiteIconSrc();
  const runtimeFeatures = getRuntimeFeatures();
  const videoTogetherScriptUrl =
    process.env.VIDEOTOGETHER_SCRIPT_URL?.trim() || DEFAULT_VIDEOTOGETHER_SCRIPT_URL;
  const videoTogetherSettingUrl = process.env.VIDEOTOGETHER_SETTING_URL?.trim();
  const videoTogetherEnvEnabled = process.env.VIDEOTOGETHER_ENABLED !== 'false';
  const vercelAnalyticsEnabled = shouldEnableVercelAnalytics();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* PWA manifest、Apple 主屏图标/状态栏、主题色与 viewport
            统一由上面的 metadata / viewport 导出生成，此处不再手写重复标签。 */}
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <SiteIconProvider iconSrc={siteIconSrc}>
          <ThemeProvider>
            <RuntimeFeaturesProvider initialFeatures={runtimeFeatures}>
              <VideoTogetherController
                envEnabled={videoTogetherEnvEnabled}
                scriptUrl={videoTogetherScriptUrl}
                settingUrl={videoTogetherSettingUrl}
              />
              <LocaleProvider />

              <TVProvider>
                <TVNavigationInitializer />
                <AutoSync />
                <AdKeywordsWrapper />
                <RuntimeConfigInitializer />
                {children}
                <BackToTop />
                <Suspense fallback={null}>
                  <ScrollPositionManager />
                </Suspense>
              </TVProvider>
              {vercelAnalyticsEnabled ? <Analytics /> : null}
              <ServiceWorkerRegister />
            </RuntimeFeaturesProvider>
          </ThemeProvider>
        </SiteIconProvider>

        {/* ARIA Live Region for Screen Reader Announcements */}
        <div
          id="aria-live-announcer"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        {/* Google Cast SDK */}
        <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" async />

        {/* Scroll Performance Optimization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                let scrollTimer;
                const body = document.body;
                
                function handleScroll() {
                  body.classList.add('scrolling');
                  clearTimeout(scrollTimer);
                  scrollTimer = setTimeout(function() {
                    body.classList.remove('scrolling');
                  }, 150);
                }
                
                let ticking = false;
                window.addEventListener('scroll', function() {
                  if (!ticking) {
                    window.requestAnimationFrame(function() {
                      handleScroll();
                      ticking = false;
                    });
                    ticking = true;
                  }
                }, { passive: true });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}

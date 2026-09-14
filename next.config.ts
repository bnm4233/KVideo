import type { NextConfig } from "next";
import { getLanAllowedDevOrigins } from "./lib/config/lan-access";

const lanAllowedDevOrigins = getLanAllowedDevOrigins();

const nextConfig: NextConfig = {
  ...(lanAllowedDevOrigins.length > 0 ? { allowedDevOrigins: lanAllowedDevOrigins } : {}),

  // Performance optimizations
  reactStrictMode: true,
  poweredByHeader: false,

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  output: 'standalone',
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },

  images: {
    remotePatterns: [
      // Douban images
      {
        protocol: 'https',
        hostname: 'img3.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img1.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img2.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img9.doubanio.com',
      },
      // Video source images - allow all subdomains with wildcards
      {
        protocol: 'http',
        hostname: '**.com',
      },
      {
        protocol: 'https',
        hostname: '**.com',
      },
      {
        protocol: 'http',
        hostname: '**.cn',
      },
      {
        protocol: 'https',
        hostname: '**.cn',
      },
      {
        protocol: 'http',
        hostname: '**.net',
      },
      {
        protocol: 'https',
        hostname: '**.net',
      },
      {
        protocol: 'http',
        hostname: '**.org',
      },
      {
        protocol: 'https',
        hostname: '**.org',
      },
      {
        protocol: 'http',
        hostname: '**.tv',
      },
      {
        protocol: 'https',
        hostname: '**.tv',
      },
      {
        protocol: 'http',
        hostname: '**.io',
      },
      {
        protocol: 'https',
        hostname: '**.io',
      },
      {
        protocol: 'http',
        hostname: '**.xyz',
      },
      {
        protocol: 'https',
        hostname: '**.xyz',
      },
      {
        protocol: 'http',
        hostname: '**.online',
      },
      {
        protocol: 'https',
        hostname: '**.online',
      },
      {
        protocol: 'http',
        hostname: '**.top',
      },
      {
        protocol: 'https',
        hostname: '**.top',
      },
    ],
    // Add image optimization for better performance
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },

  // Cloudflare Pages 使用 @cloudflare/next-on-pages，所有页面运行在 Edge runtime，
  // 不存在 fs / path 等 Node 内置模块。app/layout.tsx 与 lib/server/site-icon.ts
  // 仍为 Docker / 自托管保留文件读取能力（AD_KEYWORDS_FILE / SITE_ICON_FILE），
  // 这里让 Edge 构建把这两个模块解析成空对象，避免 "Can't resolve 'fs'" 构建失败。
  // 运行时已通过 NEXT_RUNTIME 判断跳过文件读取，不会真正调用到它们。
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    return config;
  },
};

export default nextConfig;

import fs from 'fs';
import path from 'path';

export const DEFAULT_SITE_ICON_PATH = '/icon.png';
const LEGACY_SITE_ICON_ROUTE = '/api/site-icon';

/**
 * Cloudflare Pages 通过 @cloudflare/next-on-pages 把所有页面跑在 Edge runtime，
 * 那里没有 fs / path 等 Node 内置模块。next.config.ts 会在 Edge 构建时把这两个模块
 * 解析成空对象以保证构建通过，所以这里必须在 Edge 下避免真正调用它们，
 * 否则会拿到空对象并抛出 "isAbsolute is not a function"。
 * 文件方式（SITE_ICON_FILE）因此只对 Node 部署（Docker / 自托管）生效。
 */
function canReadFiles(): boolean {
  return process.env.NEXT_RUNTIME !== 'edge';
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function getIconFileCandidates(filePath: string): string[] {
  if (path.isAbsolute(filePath)) {
    return [filePath];
  }

  const currentWorkingDirectory = process.cwd();
  const candidates = [path.join(currentWorkingDirectory, filePath)];
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;

  if (currentWorkingDirectory.endsWith(standaloneSuffix)) {
    candidates.push(path.resolve(currentWorkingDirectory, '..', '..', filePath));
  }

  return [...new Set(candidates)];
}

function normalizeIconUrl(iconUrl?: string | null): string | null {
  const value = iconUrl?.trim();

  if (!value) {
    return null;
  }

  if (value === LEGACY_SITE_ICON_ROUTE) {
    console.warn('[SiteIcon] Ignoring legacy /api/site-icon path.');
    return null;
  }

  return value;
}

async function resolveIconFileAsDataUrl(iconFile: string): Promise<string | null> {
  if (!canReadFiles()) {
    return null;
  }

  const resolvedFilePaths = getIconFileCandidates(iconFile);
  let lastError: unknown = null;

  for (const resolvedFilePath of resolvedFilePaths) {
    try {
      const fileBuffer = await fs.promises.readFile(resolvedFilePath);
      const mimeType = getMimeType(resolvedFilePath);
      return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(
    `[SiteIcon] Failed to read SITE_ICON_FILE from any supported path: ${resolvedFilePaths.join(', ')}`,
    lastError,
  );
  return null;
}

export async function resolveSiteIconSrc(): Promise<string> {
  const resolvedRuntimeIcon = normalizeIconUrl(process.env.SITE_ICON_RESOLVED_URL);
  if (resolvedRuntimeIcon) {
    return resolvedRuntimeIcon;
  }

  const runtimeIconUrl = normalizeIconUrl(
    process.env.SITE_ICON_URL?.trim() || process.env.NEXT_PUBLIC_SITE_ICON_URL?.trim(),
  );
  if (runtimeIconUrl) {
    return runtimeIconUrl;
  }

  const iconFile = process.env.SITE_ICON_FILE?.trim();
  if (iconFile) {
    const dataUrl = await resolveIconFileAsDataUrl(iconFile);
    if (dataUrl) {
      return dataUrl;
    }
  }

  return DEFAULT_SITE_ICON_PATH;
}

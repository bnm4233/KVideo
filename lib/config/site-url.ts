/**
 * Canonical Site URL
 * Resolves the public origin used by metadata, robots.txt and sitemap.xml.
 *
 * Resolution order (first usable value wins):
 *   1. NEXT_PUBLIC_SITE_URL - explicit override; using a custom domain? set this
 *   2. SITE_URL             - server-only override
 *   3. CF_PAGES_URL         - injected by Cloudflare Pages; its per-deployment
 *                             hash prefix is stripped so the origin stays stable
 *   4. FALLBACK_SITE_URL    - project default (`kvideo.pages.dev`)
 */

const FALLBACK_SITE_URL = 'https://kvideo.pages.dev';

/**
 * Normalize a raw URL into a protocol-prefixed, trailing-slash-free origin.
 * Returns an empty string when the value cannot be parsed.
 */
function normalizeSiteUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    // Validate early so `metadataBase` never receives a malformed URL.
    new URL(withProtocol);
  } catch {
    return '';
  }

  return withProtocol.replace(/\/+$/, '');
}

/**
 * CF Pages 的 `CF_PAGES_URL` 是「本次部署」的地址，形如
 * `https://<hash>.<project>.pages.dev`，其中 `<hash>` 每次构建都会变。
 * 直接拿它当 canonical / sitemap 的 origin 会导致两个后果：
 *   1. 收录到的是一次性地址，下次部署即失效；
 *   2. 与 Search Console 里验证的生产域名 host 不一致，
 *      Google 会报「此位置的 Sitemap 不允许此网址」。
 * 这里剥离部署 hash，让 origin 在多次构建之间保持稳定。
 */
function stripPagesDeploymentHash(value: string): string {
  return value.replace(/^(https?:\/\/)[0-9a-f]{8,40}\.([^/]+\.pages\.dev)$/i, '$1$2');
}

/** Public origin of this deployment, without a trailing slash. */
export function getSiteUrl(): string {
  const explicit =
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeSiteUrl(process.env.SITE_URL);

  if (explicit) {
    return explicit;
  }

  const cfPages = normalizeSiteUrl(process.env.CF_PAGES_URL);
  if (cfPages) {
    return stripPagesDeploymentHash(cfPages);
  }

  return FALLBACK_SITE_URL;
}

/** Turn a site-relative path into an absolute URL. */
export function toAbsoluteUrl(path: string): string {
  if (!path) {
    return getSiteUrl();
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${getSiteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Canonical (and crawlable) path for a video content page. */
export function buildMoviePath(source: string, id: string | number): string {
  return `/movie/${encodeURIComponent(source)}/${encodeURIComponent(String(id))}`;
}

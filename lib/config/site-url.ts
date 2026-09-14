/**
 * Canonical Site URL
 * Resolves the public origin used by metadata, robots.txt and sitemap.xml.
 *
 * Resolution order (first usable value wins):
 *   1. NEXT_PUBLIC_SITE_URL - explicit override, use this for a custom domain
 *   2. SITE_URL             - server-only override
 *   3. CF_PAGES_URL         - injected automatically by Cloudflare Pages
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

/** Public origin of this deployment, without a trailing slash. */
export function getSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.CF_PAGES_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeSiteUrl(candidate);
    if (normalized) {
      return normalized;
    }
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

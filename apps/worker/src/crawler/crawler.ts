import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';

/**
 * Budgeted, polite, fetch-based crawler — phase 1 workhorse.
 * No headless browser yet: works for SSR/static pages, which covers the
 * sites Zahra targets first. Lighthouse/Playwright arrive in a later pass
 * behind the same interface.
 */

export interface CrawlBudget {
  maxPages: number;
  fetchTimeoutMs?: number;
}

export interface CrawledPage {
  url: string;
  statusCode: number;
  redirectedTo?: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1Count: number;
  wordCount: number;
  contentHash: string | null;
  internalLinks: string[];
}

export interface BrokenLink {
  from: string;
  to: string;
  statusCode: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  brokenLinks: BrokenLink[];
  startedAt: Date;
  finishedAt: Date;
}

const USER_AGENT = 'ZahraBot/0.1 (+https://github.com/zahra-seo/zahra)';
const DEFAULT_TIMEOUT = 10_000;
const MAX_SITEMAPS = 5;

export async function crawlSite(baseUrl: string, budget: CrawlBudget): Promise<CrawlResult> {
  const startedAt = new Date();
  const origin = new URL(baseUrl).origin;
  const timeout = budget.fetchTimeoutMs ?? DEFAULT_TIMEOUT;

  const disallowed = await fetchRobotsDisallows(origin, timeout);
  const seeds = await fetchSitemapUrls(origin, timeout);

  const queue: string[] = dedupe([normalizeUrl(baseUrl), ...seeds.map(normalizeUrl)]);
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const brokenLinks: BrokenLink[] = [];
  const linkSources = new Map<string, string>(); // url -> first page linking to it

  while (queue.length > 0 && pages.length < budget.maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (!isAllowed(url, disallowed)) continue;

    const page = await fetchPage(url, timeout);
    if (!page) continue;
    pages.push(page);

    if (page.statusCode === 404 || page.statusCode >= 500) {
      brokenLinks.push({ from: linkSources.get(url) ?? origin, to: url, statusCode: page.statusCode });
    }

    for (const link of page.internalLinks) {
      const normalized = normalizeUrl(link);
      if (!visited.has(normalized) && new URL(normalized).origin === origin) {
        if (!linkSources.has(normalized)) linkSources.set(normalized, url);
        queue.push(normalized);
      }
    }
  }

  return { pages, brokenLinks, startedAt, finishedAt: new Date() };
}

async function fetchPage(url: string, timeoutMs: number): Promise<CrawledPage | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const base: CrawledPage = {
      url,
      statusCode: res.status,
      redirectedTo: res.redirected ? res.url : undefined,
      title: null,
      metaDescription: null,
      canonical: null,
      h1Count: 0,
      wordCount: 0,
      contentHash: null,
      internalLinks: [],
    };

    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('text/html')) return base;

    const html = await res.text();
    const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });

    const text = root.textContent.replace(/\s+/g, ' ').trim();
    const links = root
      .querySelectorAll('a[href]')
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:'))
      .map((href) => safeResolve(href, res.url || url))
      .filter((u): u is string => u !== null);

    return {
      ...base,
      title: root.querySelector('title')?.textContent.trim() || null,
      metaDescription: root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null,
      canonical: root.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || null,
      h1Count: root.querySelectorAll('h1').length,
      wordCount: text ? text.split(' ').length : 0,
      contentHash: createHash('sha256').update(html).digest('hex').slice(0, 32),
      internalLinks: dedupe(links),
    };
  } catch {
    // Timeout / DNS / TLS errors: skip silently, the page simply isn't recorded this cycle.
    return null;
  }
}

async function fetchRobotsDisallows(origin: string, timeoutMs: number): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const lines = (await res.text()).split('\n');

    const disallows: string[] = [];
    let applies = false;
    for (const raw of lines) {
      const line = raw.split('#')[0].trim();
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(key)) {
        applies = value === '*' || /zahrabot/i.test(value);
      } else if (applies && /^disallow$/i.test(key) && value) {
        disallows.push(value);
      }
    }
    return disallows;
  } catch {
    return [];
  }
}

async function fetchSitemapUrls(origin: string, timeoutMs: number): Promise<string[]> {
  const urls: string[] = [];
  const sitemaps = [`${origin}/sitemap.xml`];
  let fetched = 0;

  while (sitemaps.length > 0 && fetched < MAX_SITEMAPS) {
    const sitemapUrl = sitemaps.shift()!;
    fetched += 1;
    try {
      const res = await fetch(sitemapUrl, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      if (/<sitemapindex/i.test(xml)) {
        sitemaps.push(...locs);
      } else {
        urls.push(...locs);
      }
    } catch {
      // sitemap unreachable — not fatal
    }
  }
  return urls;
}

function isAllowed(url: string, disallows: string[]): boolean {
  const path = new URL(url).pathname;
  return !disallows.some((rule) => path.startsWith(rule.replace(/\*$/, '')));
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}

function safeResolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

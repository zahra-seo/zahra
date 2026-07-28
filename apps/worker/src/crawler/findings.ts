import type { Severity } from '@zahra-seo/shared';
import type { BrokenLink, CrawledPage } from './crawler';

/**
 * Turn a crawl into normalized findings — see docs/architecture.fr.md §4.2.
 * Every finding carries a stable fingerprint (kind + entity) so re-crawls
 * update instead of duplicating, and stale findings can be auto-resolved.
 */

export interface DerivedFinding {
  kind: string;
  severity: Severity;
  entityType: 'page' | 'site';
  entityRef: string;
  evidence: Record<string, unknown>;
  fingerprint: string;
}

/** Kinds this module produces — used to scope stale-finding resolution. */
export const CRAWL_FINDING_KINDS = [
  'missing_meta',
  'duplicate_meta',
  'thin_content',
  'broken_link',
  'multiple_h1',
] as const;

const THIN_CONTENT_WORDS = 150;

export function deriveFindings(pages: CrawledPage[], brokenLinks: BrokenLink[]): DerivedFinding[] {
  const findings: DerivedFinding[] = [];
  const htmlPages = pages.filter((p) => p.statusCode === 200);

  for (const page of htmlPages) {
    const missing: string[] = [];
    if (!page.title) missing.push('title');
    if (!page.metaDescription) missing.push('meta_description');
    if (missing.length > 0) {
      findings.push({
        kind: 'missing_meta',
        severity: 'medium',
        entityType: 'page',
        entityRef: page.url,
        evidence: { missing },
        fingerprint: `missing_meta:${page.url}`,
      });
    }

    if (page.wordCount > 0 && page.wordCount < THIN_CONTENT_WORDS) {
      findings.push({
        kind: 'thin_content',
        severity: 'low',
        entityType: 'page',
        entityRef: page.url,
        evidence: { wordCount: page.wordCount, threshold: THIN_CONTENT_WORDS },
        fingerprint: `thin_content:${page.url}`,
      });
    }

    if (page.h1Count > 1) {
      findings.push({
        kind: 'multiple_h1',
        severity: 'low',
        entityType: 'page',
        entityRef: page.url,
        evidence: { h1Count: page.h1Count },
        fingerprint: `multiple_h1:${page.url}`,
      });
    }
  }

  findings.push(...deriveDuplicates(htmlPages, 'title'));
  findings.push(...deriveDuplicates(htmlPages, 'metaDescription'));

  for (const broken of brokenLinks) {
    findings.push({
      kind: 'broken_link',
      severity: broken.statusCode >= 500 ? 'high' : 'medium',
      entityType: 'page',
      entityRef: broken.to,
      evidence: { linkedFrom: broken.from, statusCode: broken.statusCode },
      fingerprint: `broken_link:${broken.to}`,
    });
  }

  return findings;
}

function deriveDuplicates(pages: CrawledPage[], field: 'title' | 'metaDescription'): DerivedFinding[] {
  const byValue = new Map<string, string[]>();
  for (const page of pages) {
    const value = page[field];
    if (!value) continue;
    const urls = byValue.get(value) ?? [];
    urls.push(page.url);
    byValue.set(value, urls);
  }

  const findings: DerivedFinding[] = [];
  for (const [value, urls] of byValue) {
    if (urls.length < 2) continue;
    for (const url of urls) {
      findings.push({
        kind: 'duplicate_meta',
        severity: 'medium',
        entityType: 'page',
        entityRef: url,
        evidence: { field, value, duplicatedOn: urls.filter((u) => u !== url) },
        fingerprint: `duplicate_meta:${field}:${url}`,
      });
    }
  }
  return findings;
}

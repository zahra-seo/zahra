import { describe, expect, it } from 'vitest';
import { deriveFindings } from '../src/crawler/findings';
import type { CrawledPage } from '../src/crawler/crawler';

function page(overrides: Partial<CrawledPage>): CrawledPage {
  return {
    url: 'https://site.test/',
    statusCode: 200,
    title: 'A perfectly fine title',
    metaDescription: 'A perfectly fine description for this page.',
    canonical: null,
    h1Count: 1,
    wordCount: 500,
    contentHash: 'abc',
    internalLinks: [],
    ...overrides,
  };
}

describe('deriveFindings', () => {
  it('flags missing title and/or meta description', () => {
    const found = deriveFindings([page({ url: 'https://site.test/a', title: null, metaDescription: null })], []);
    const missing = found.find((f) => f.kind === 'missing_meta');
    expect(missing).toBeDefined();
    expect(missing!.evidence.missing).toEqual(['title', 'meta_description']);
    expect(missing!.fingerprint).toBe('missing_meta:https://site.test/a');
  });

  it('flags thin content under 150 words but not empty (non-HTML) pages', () => {
    const found = deriveFindings(
      [page({ url: 'https://site.test/thin', wordCount: 30 }), page({ url: 'https://site.test/bin', wordCount: 0 })],
      [],
    );
    expect(found.filter((f) => f.kind === 'thin_content').map((f) => f.entityRef)).toEqual(['https://site.test/thin']);
  });

  it('flags duplicated titles on every affected page, with cross-references', () => {
    const found = deriveFindings(
      [
        page({ url: 'https://site.test/a', title: 'Same', metaDescription: 'Unique description for page A.' }),
        page({ url: 'https://site.test/b', title: 'Same', metaDescription: 'Unique description for page B.' }),
      ],
      [],
    );
    const dups = found.filter((f) => f.kind === 'duplicate_meta' && f.evidence.field === 'title');
    expect(dups).toHaveLength(2);
    expect(dups[0].evidence.duplicatedOn).toEqual(['https://site.test/b']);
  });

  it('ignores non-200 pages for content checks but reports broken links', () => {
    const found = deriveFindings(
      [page({ url: 'https://site.test/gone', statusCode: 404, title: null, metaDescription: null })],
      [{ from: 'https://site.test/', to: 'https://site.test/gone', statusCode: 404 }],
    );
    expect(found.some((f) => f.kind === 'missing_meta')).toBe(false);
    const broken = found.find((f) => f.kind === 'broken_link');
    expect(broken?.severity).toBe('medium');
    expect(broken?.evidence.linkedFrom).toBe('https://site.test/');
  });

  it('is idempotent: same input, same fingerprints', () => {
    const input = [page({ url: 'https://site.test/a', title: null })];
    const a = deriveFindings(input, []).map((f) => f.fingerprint);
    const b = deriveFindings(input, []).map((f) => f.fingerprint);
    expect(a).toEqual(b);
  });
});

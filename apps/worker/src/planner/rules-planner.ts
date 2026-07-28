import type { ActionKind, Severity } from '@zahra-seo/shared';

/**
 * Planner v0 — deterministic rules, the no-API-key fallback.
 * Kept alongside the Claude planner forever: it is the safety net and the
 * reference behavior for tests.
 */

export interface Rule {
  action: ActionKind;
  title: (entityRef: string) => string;
  rationale: (evidence: Record<string, unknown>, entityRef: string) => string;
  hypothesis: (entityRef: string) => Record<string, unknown>;
  estimate: (severity: Severity) => { impact: number; confidence: number; effort: number };
}

const severityImpact: Record<Severity, number> = { low: 0.3, medium: 0.5, high: 0.7, critical: 0.9 };

export const RULES: Record<string, Rule> = {
  missing_meta: {
    action: 'fix_meta_tags',
    title: (ref) => `Compléter les meta tags de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `Balises manquantes détectées au crawl : ${((ev.missing as string[]) ?? []).join(', ')}. ` +
      `Un title et une meta description corrects améliorent le CTR en SERP.`,
    hypothesis: (ref) => ({ metric: 'gsc.ctr', scope: 'page', scopeRef: ref, direction: 'increase', windowDays: 14 }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.8, effort: 0.2 }),
  },
  duplicate_meta: {
    action: 'fix_meta_tags',
    title: (ref) => `Dédupliquer les meta tags de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `${String(ev.field)} identique à ${((ev.duplicatedOn as string[]) ?? []).length} autre(s) page(s). ` +
      `Les balises dupliquées diluent la pertinence perçue de chaque page.`,
    hypothesis: (ref) => ({ metric: 'gsc.ctr', scope: 'page', scopeRef: ref, direction: 'increase', windowDays: 14 }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.7, effort: 0.25 }),
  },
  thin_content: {
    action: 'update_content',
    title: (ref) => `Renforcer le contenu de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `Contenu maigre (${String(ev.wordCount)} mots). Les pages trop courtes peinent à se positionner ` +
      `et diluent la qualité perçue du site.`,
    hypothesis: (ref) => ({ metric: 'gsc.position', scope: 'page', scopeRef: ref, direction: 'increase', windowDays: 28 }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.5, effort: 0.6 }),
  },
  broken_link: {
    action: 'redirect_fix',
    title: (ref) => `Corriger le lien cassé vers ${shortUrl(ref)}`,
    rationale: (ev) =>
      `URL en erreur ${String(ev.statusCode)}, liée depuis ${String(ev.linkedFrom)}. ` +
      `Les liens cassés gaspillent le budget de crawl et dégradent l'expérience.`,
    hypothesis: (ref) => ({ metric: 'crawl.broken_links', scope: 'site', scopeRef: ref, direction: 'decrease', windowDays: 14 }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.9, effort: 0.2 }),
  },
};

export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

import { GoogleAuth, type ServiceAccount } from './google-auth';

/**
 * Google Search Console — Search Analytics client.
 * Data arrives with ~2 days of latency; quotas are generous for daily syncs
 * but the caller should still be gentle (one project = a few requests/day).
 */

export interface GscRow {
  date: string;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSiteDay {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const ROW_LIMIT = 25_000;

export class SearchConsoleClient {
  private readonly auth: GoogleAuth;

  constructor(account: ServiceAccount) {
    this.auth = new GoogleAuth(account, [SCOPE]);
  }

  /** Daily site totals (exact, one row per date). */
  async siteDaily(siteUrl: string, startDate: string, endDate: string): Promise<GscSiteDay[]> {
    const rows = await this.query(siteUrl, { startDate, endDate, dimensions: ['date'] });
    return rows.map((r) => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
  }

  /** date × page × query rows, paged. */
  async pageQueryDaily(siteUrl: string, startDate: string, endDate: string): Promise<GscRow[]> {
    const out: GscRow[] = [];
    let startRow = 0;
    for (;;) {
      const rows = await this.query(siteUrl, {
        startDate,
        endDate,
        dimensions: ['date', 'page', 'query'],
        rowLimit: ROW_LIMIT,
        startRow,
      });
      for (const r of rows) {
        out.push({
          date: r.keys[0],
          page: r.keys[1],
          query: r.keys[2],
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: r.ctr,
          position: r.position,
        });
      }
      if (rows.length < ROW_LIMIT) return out;
      startRow += ROW_LIMIT;
    }
  }

  private async query(
    siteUrl: string,
    body: Record<string, unknown>,
  ): Promise<Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>> {
    const token = await this.auth.getAccessToken();
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'web', ...body }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GSC query failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };
    return data.rows ?? [];
  }
}

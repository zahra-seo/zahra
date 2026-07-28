# Google Search Console & GA4 — setup

Zahra reads real search data through a **Google service account** — no OAuth dance, ideal for self-hosting. One service account can serve all your projects.

## 1. Create the service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create (or pick) a project — e.g. `zahra-seo`.
2. **APIs & Services → Enable APIs**: enable **Google Search Console API** (and **Google Analytics Data API** for GA4, phase 3.2).
3. **IAM & Admin → Service Accounts → Create**: name it `zahra`, no roles needed.
4. Open the account → **Keys → Add key → JSON**. Download the file.

## 2. Give it access to your data

- **Search Console**: [search.google.com/search-console](https://search.google.com/search-console) → your property → *Settings → Users and permissions → Add user* → paste the service account email (`zahra@…iam.gserviceaccount.com`) with **Full** or **Restricted** (read) permission.
- **GA4** (later): *Admin → Property access management* → add the same email as **Viewer**.

## 3. Configure Zahra

In the worker `.env`, either point to the file or inline it:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/zahra-sa.json
# or
GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"…","private_key":"…"}'
```

Then declare the property on the project:

```bash
curl -X PUT localhost:3000/api/projects/<id>/integrations/gsc \
  -H 'content-type: application/json' \
  -d '{"siteUrl":"sc-domain:facturaal.com"}'
```

`siteUrl` is the GSC property identifier: `sc-domain:example.com` for a domain property, or `https://example.com/` (trailing slash included) for a URL-prefix property.

## 4. What happens next

Every cycle now also enqueues a **GSC sync**: incremental, from the last synced date (minus a 3-day revision window — GSC data stabilizes late) to today minus 2 days (data latency). First run backfills 30 days. Rows land in `metric_snapshots`:

- scope `site`: one row per day (clicks, impressions, ctr, position)
- scope `page_keyword`: one row per day × page × query

The integration's `status` flips to `connected` and `last_sync_at` updates after each successful sync. These snapshots feed the Evaluator (action verdicts) and, next, the planner's opportunity detection (high-impression / low-CTR queries, declining pages, cannibalization).

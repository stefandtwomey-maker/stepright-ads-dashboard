# StepRight Ads Dashboard

Single-page HTML dashboard for StepRight that toggles between **Google Ads** and **Meta Ads** views, both read from the same Google Sheet.

```
Google Ads ┐                                                          ┌─► /?platform=google
           ├─► Make.com ─► Google Sheet (2 tabs) ─► opensheet.elk.sh ─┤
Meta Ads  ─┘                                                          └─► /?platform=meta
```

Sibling-of: [`notion-leadgen-dashboard`](https://github.com/stefandtwomey-maker/notion-leadgen-dashboard) and [`notion-fb-ads-dashboard`](https://github.com/stefandtwomey-maker/notion-fb-ads-dashboard) (built for a different client, Fearless). Same pattern — different sheet, different client, single dashboard with platform toggle.

---

## What this contains

- **`index.html`** — single-file dashboard with a platform toggle in the top-right header. The toggle switches the data tab and re-fetches without a full reload. Falls back to platform-specific sample data if the sheet tab is empty/unshared.
- **Source sheet:** [Stepright Meta and Google Ads Dashboard](https://docs.google.com/spreadsheets/d/1H3qkvv-yYxAX53YmCIUWJPFtwypQh0JGTY4K4bJPLRA/edit)
  - Sheet ID: `1H3qkvv-yYxAX53YmCIUWJPFtwypQh0JGTY4K4bJPLRA`
  - Tab `Google Ads Daily Log` — 9 cols, Make scenario writes here
  - Tab `Meta Ad Daily Daily Log` — 8 cols, Make scenario writes here

---

## Column structure

### Google Ads Daily Log (A–I)
`Date | Campaign | Type | Status | Spend | Impressions | Clicks | Leads | Purchases`

All three of `Submit lead form`, `Calls from ads (1)`, and `Purchase-stepright.ie` are tagged **Primary** in Google Ads (the user keeps them all primary for Smart Bidding). To split conversions correctly, the Make scenario uses **two `Run a Custom Report` modules**:
- Module 1 (GAQL): campaign-level totals — returns one row per (campaign, day) with total spend, impressions, clicks, conversions.
- Module 2 (GAQL parameterised by module 1 row): filtered to `segments.conversion_action_name = 'Purchase-stepright.ie'` — returns 0 or 1 row.

Then in Set Variables: `purchases_int = ifempty(M2.conversions, 0)` and `leads_int = M1.conversions − purchases_int`.

> **Gotcha:** If the purchase action name ever changes in Google Ads, edit the literal `'Purchase-stepright.ie'` inside the Module 2 GAQL query. Also if you add a fourth primary action, you'll over-count leads — re-tag or extend the split logic.

### Meta Ad Daily Daily Log (A–H)
`Date | Campaign | Type | Status | Spend | Impressions | Clicks | Leads`

Meta tracks lead conversions only. Make scenario extracts the `lead` action_type from the Facebook Insights `actions` array.

> Note: the Meta tab has a duplicate-word typo (`Daily Daily`) in its name. The dashboard JS references that exact string — if you rename the tab, also update `PLATFORMS.meta.tab` in `index.html`.

---

## Make.com scenarios (both already cloned, inactive drafts)

| Scenario | ID | Trigger module | Status |
|---|---|---|---|
| `StepRight Google Ads Report` | 5923458 | `google-ads-reports:runCampaignReport` | needs Account ID + Campaign IDs |
| `StepRight Meta Ads Report`   | 5923531 | `facebook-insights:GetAdAccountInsights` | needs Business Manager + Ad Account + Campaign |

Each writes one row per campaign per day, into the corresponding tab in the sheet above.

---

## Dashboard URL convention

- `https://<deploy-url>/` — defaults to Google Ads
- `https://<deploy-url>/?platform=meta` — opens directly on Meta view (useful for separate Notion embeds)

The toggle is fully client-side — no rebuild needed to flip platforms.

---

## Deploy

Auto-deployed to Vercel from `main`. Push → rebuild.

---

## Troubleshooting

**Badge stays "Sample data":**
- The Make scenario hasn't run yet, or
- the sheet isn't shared as "Anyone with the link → Viewer", or
- the tab name in `PLATFORMS.<id>.tab` doesn't match exactly (case-sensitive).

**Google Ads purchases column always 0:**
- Your conversion actions aren't split between primary (leads) and secondary (purchases). In Google Ads → Conversions, set the lead conversion(s) as "Primary" and the purchase conversion as "Secondary". `metrics.conversions` returns primary, `metrics.allConversions` returns everything.

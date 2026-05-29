// Daily FB Insights → Google Sheets cron job.
// Runs at 06:00 Europe/Dublin per vercel.json schedule.
//
// Pulls yesterday's campaign-level Meta Ads insights for the configured ad account,
// computes leads_int by summing lead/pixel_lead/lead_grouped action_types,
// appends one row per campaign to the Meta Ad Daily Daily Log tab.
//
// Env vars required:
//   FB_ACCESS_TOKEN        - long-lived FB access token (system user)
//   META_AD_ACCOUNT_ID     - numeric ad account id (no "act_" prefix)
//   GOOGLE_SERVICE_ACCOUNT_KEY_B64 - base64-encoded service account JSON key
//   STEPRIGHT_SHEET_ID     - target spreadsheet id
//   CRON_SECRET            - shared secret to gate the endpoint (Vercel auto-adds Authorization header on crons)

import { google } from 'googleapis';

const META_TAB = 'Meta Ad Daily Daily Log';
const LEAD_ACTION_TYPES = ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped'];

export default async function handler(req, res) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rows = await fetchMetaRows();
    if (rows.length === 0) {
      return res.json({ ok: true, written: 0, note: 'No campaigns with delivery yesterday.' });
    }
    await appendRows(rows);
    return res.json({ ok: true, written: rows.length, sample: rows[0] });
  } catch (err) {
    console.error('cron-meta failed:', err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

async function fetchMetaRows() {
  const token = process.env.FB_ACCESS_TOKEN;
  const acct = process.env.META_AD_ACCOUNT_ID;
  if (!token || !acct) throw new Error('Missing FB_ACCESS_TOKEN or META_AD_ACCOUNT_ID');

  const url = new URL(`https://graph.facebook.com/v19.0/act_${acct}/insights`);
  url.searchParams.set('fields', 'campaign_name,spend,impressions,clicks,inline_link_clicks,reach,actions');
  url.searchParams.set('date_preset', 'yesterday');
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('access_token', token);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`FB API ${resp.status}: ${await resp.text()}`);
  const payload = await resp.json();

  const out = [];
  for (const item of payload.data || []) {
    const spend = Math.round(parseFloat(item.spend || '0') * 100) / 100;
    const clicks = parseInt(item.inline_link_clicks || '0', 10);
    const leads = LEAD_ACTION_TYPES.reduce((sum, type) => {
      const entry = (item.actions || []).find(a => a.action_type === type);
      return sum + (entry ? parseInt(entry.value, 10) : 0);
    }, 0);

    out.push([
      item.date_start,                  // Date
      item.campaign_name,               // Campaign
      'Meta',                           // Type
      'Active',                         // Status
      spend,                            // Spend
      parseInt(item.impressions || '0', 10),  // Impressions
      clicks,                           // Clicks
      leads                             // Leads
    ]);
  }
  return out;
}

async function appendRows(rows) {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, 'base64').toString('utf8');
  const key = JSON.parse(keyJson);
  const sheetId = process.env.STEPRIGHT_SHEET_ID;
  if (!sheetId) throw new Error('Missing STEPRIGHT_SHEET_ID');

  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${META_TAB}!A2`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });
}

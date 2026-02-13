// Build-time fetch of Wakapi (self-hosted WakaTime) coding stats.
//
// SECURITY: the API key is read from the environment only — a gitignored
// `.env` locally, a GitHub Actions secret in CI. It is never committed and
// never shipped to the browser; only the sanitized result returned below is
// baked into the static site. If the key is absent (e.g. a contributor's PR
// build) this returns null and the page simply omits the section.

const API_URL = process.env.WAKAPI_API_URL;
const API_KEY = process.env.WAKAPI_API_KEY;

const PRETTY = {
  Gdscript3: 'GDScript',
  Qml: 'QML',
  Tsx: 'TSX',
  Jsx: 'JSX',
  Json: 'JSON',
};

module.exports = async function wakapi() {
  if (!API_KEY || !API_URL) {
    console.warn('[wakapi] WAKAPI_API_KEY / WAKAPI_API_URL not set — skipping coding stats (fine for local / PR builds).');
    return null;
  }

  try {
    const auth = Buffer.from(API_KEY).toString('base64');
    const res = await fetch(
      `${API_URL}/api/compat/wakatime/v1/users/current/stats/last_7_days`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (!res.ok) {
      console.warn(`[wakapi] request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const { data } = await res.json();
    if (!data) return null;

    const languages = (data.languages || [])
      .filter((l) => l.name && l.name !== 'Unknown' && l.name !== 'Other')
      .slice(0, 6)
      .map((l) => ({ name: PRETTY[l.name] || l.name, percent: Math.round(l.percent), text: l.text }));

    return {
      range: data.human_readable_range || 'last 7 days',
      total: data.human_readable_total || '',
      dailyAverage: data.human_readable_daily_average || '',
      languages,
    };
  } catch (err) {
    console.warn('[wakapi] error fetching stats:', err.message);
    return null;
  }
};

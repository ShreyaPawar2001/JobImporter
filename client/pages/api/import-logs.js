// client/pages/api/import-logs.js
export default async function handler(req, res) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  try {
    // forward query params (page, pageSize, etc.)
    const query = new URLSearchParams(req.query).toString();
    const url = `${serverUrl}/api/import-logs${query ? `?${query}` : ''}`;

    const backendRes = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    const json = await backendRes.json();
    return res.status(backendRes.status).json(json);
  } catch (err) {
    console.error('import-logs proxy error:', err);
    return res.status(500).json({ error: 'Unable to fetch import logs' });
  }
}

// client/pages/api/trigger-import.js
export default async function handler(req, res) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  try {
    const method = req.method === 'POST' ? 'POST' : 'GET';
    let url = `${serverUrl}/api/trigger-import`;

    const fetchOptions = {
      method,
      headers: { 'Accept': 'application/json' }
    };

    if (method === 'POST') {
      // forward JSON body
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body || {});
    } else {
      // forward querystring (e.g. ?feeds=...)
      const qs = new URLSearchParams(req.query).toString();
      if (qs) url = `${url}?${qs}`;
    }

    const backendRes = await fetch(url, fetchOptions);
    const json = await backendRes.json();
    return res.status(backendRes.status).json(json);
  } catch (err) {
    console.error('trigger-import proxy error:', err);
    return res.status(500).json({ error: 'Unable to trigger import' });
  }
}

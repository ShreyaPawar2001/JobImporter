// client/pages/api/status.js
export default async function handler(req, res) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
  try {
    const backendRes = await fetch(`${serverUrl}/api/status`);
    const json = await backendRes.json();
    return res.status(backendRes.status).json(json);
  } catch (err) {
    console.error('status proxy error:', err);
    return res.status(500).json({ error: 'Backend unreachable' });
  }
}

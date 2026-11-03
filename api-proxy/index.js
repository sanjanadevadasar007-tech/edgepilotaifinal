const express = require('express');

const app = express();
const ROUTES = new Map([
  ['/api/health', 'GET'],
  ['/api/recommend', 'POST'],
  ['/api/explain', 'POST'],
  ['/api/simulate', 'POST'],
  ['/api/counterfactuals', 'POST'],
  ['/api/optimize', 'POST'],
  ['/api/report', 'POST'],
]);

app.use(express.json({ limit: '24kb' }));

app.use(async (req, res) => {
  const requestUrl = new URL(req.originalUrl, 'http://localhost');
  const allowedMethod = ROUTES.get(requestUrl.pathname);

  if (!allowedMethod) {
    return res.status(404).json({ error: 'API route not found.' });
  }

  if (req.method !== allowedMethod) {
    res.setHeader('Allow', allowedMethod);
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const backendUrl = process.env.BACKEND_URL;
  const apiAuthToken = process.env.API_AUTH_TOKEN;
  if (!backendUrl || !apiAuthToken) {
    return res.status(503).json({
      error: 'Backend proxy is not configured. Set the backend binding and API_AUTH_TOKEN.',
    });
  }

  let destination;
  try {
    destination = new URL(
      `${backendUrl.replace(/\/+$/, '')}${requestUrl.pathname}${requestUrl.search}`,
    );
    if (!['http:', 'https:'].includes(destination.protocol)) {
      throw new Error('Backend URL must use HTTP or HTTPS.');
    }
  } catch (error) {
    console.error('Invalid backend service binding', error);
    return res.status(500).json({ error: 'Backend proxy URL is invalid.' });
  }

  const headers = {
    authorization: `Bearer ${apiAuthToken}`,
    accept: req.get('accept') || '*/*',
  };
  let body;
  if (allowedMethod === 'POST') {
    if (req.body === undefined) {
      return res.status(400).json({ error: 'Request body is required.' });
    }
    body = JSON.stringify(req.body);
    headers['content-type'] = req.get('content-type') || 'application/json';
  }

  try {
    const response = await fetch(destination, {
      method: allowedMethod,
      headers,
      body,
      signal: AbortSignal.timeout(55_000),
    });
    const responseBody = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    return res.status(response.status).send(responseBody);
  } catch (error) {
    console.error('Backend API proxy request failed', error);
    return res.status(502).json({ error: 'Unable to reach the backend service.' });
  }
});

module.exports = app;

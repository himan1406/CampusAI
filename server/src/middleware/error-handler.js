export function errorHandler(error, _req, res, _next) {
  console.error('[CampusOS API]', error?.message || 'Unknown error');
  if (error?.message?.includes('CORS policy')) return res.status(403).json({ error: 'Origin is not allowed' });
  res.status(500).json({ error: 'Internal server error' });
}

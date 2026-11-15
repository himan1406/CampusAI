import '../config/env.js';
import { verifyAccessToken } from '../auth.js';

export function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  // Real bearer tokens always take precedence, even while the old Sprint 1 UI
  // uses the temporary local development identity.
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email, dev: false };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
  }

  // Temporary local-only bridge for the Sprint 1 frontend. Never enable in production.
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true') {
    req.user = { id: process.env.DEV_USER_ID || 'demo-student', email: 'demo@localhost', dev: true };
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

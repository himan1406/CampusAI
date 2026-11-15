import cors from 'cors';
import '../config/env.js';

const allowedOrigins = new Set([process.env.WEB_ORIGIN || 'http://localhost:5173']);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Requests without an Origin are permitted for local health checks and server-to-server calls.
    if (!origin || allowedOrigins.has(origin) || (process.env.NODE_ENV === 'development' && origin === 'null')) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CampusOS CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

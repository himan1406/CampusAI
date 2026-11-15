import './config/env.js';
import { app } from './app.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`CampusOS API listening on http://localhost:${port}`));
async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

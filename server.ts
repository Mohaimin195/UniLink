import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';
import { getDb } from './server/db/connection.ts';
import { runMigrations } from './server/db/migrations.ts';
import { seedDatabase } from './server/db/seed.ts';
import { parseCookie, resolveSessionUser } from './server/middleware/auth.ts';
import { startExpiryWorker } from './server/services/expiryWorker.ts';
import { wsHub } from './server/wsHub.ts';

async function bootstrap() {
  const db = getDb();
  runMigrations(db);
  seedDatabase(db, { includeDemoData: true });
  startExpiryWorker(db, 30_000);

  const app = createApiApp(db);
  const server = http.createServer(app);

  // Real-time WebSocket server on /ws
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws') {
      return;
    }
    const token = reqUrl.searchParams.get('token') || parseCookie(request.headers.cookie, 'unilink_session') || '';
    const resolved = token ? resolveSessionUser(db, token) : null;
    if (!resolved || resolved.user.accountStatus !== 'active') {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, resolved.user.id);
    });
  });

  wss.on('connection', (ws, userId: string) => {
    wsHub.register(userId, ws);
    ws.send(JSON.stringify({ type: 'ws:connected', data: { userId } }));

    ws.on('close', () => {
      wsHub.unregister(userId, ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`UniLink server running on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start UniLink server:', err);
  process.exit(1);
});

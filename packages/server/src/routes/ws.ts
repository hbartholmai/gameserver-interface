import type { FastifyInstance } from 'fastify';
// Erweitert die Routen-Optionen um `websocket` und den Socket-Parameter.
import '@fastify/websocket';
import '@fastify/cookie';
import { TOPIC, clientMessageSchema, type ServerMessage } from '@gsp/shared';
import type { AuthService } from '../auth/sessions.js';
import type { Hub } from '../services/hub.js';
import type { LogService } from '../services/logs.js';
import type { Ticker } from '../services/ticker.js';
import { SESSION_COOKIE } from './auth.js';

/**
 * Ein WebSocket je Client. Themen werden einzeln abonniert; beim Abonnieren
 * eines Log-Themas wird der bestehende Puffer sofort nachgeliefert, damit der
 * Konsolen-Reiter nicht leer startet.
 */
export async function websocketRoute(
  app: FastifyInstance,
  deps: { auth: AuthService; hub: Hub; logs: LogService; ticker: Ticker },
): Promise<void> {
  const { auth, hub, logs, ticker } = deps;

  app.get('/api/ws', { websocket: true }, (socket, request) => {
    const session = auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!session) {
      socket.close(4401, 'Nicht angemeldet');
      return;
    }

    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const subscriber = hub.add(send);

    socket.on('message', (raw: Buffer) => {
      let parsed;
      try {
        parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const message = parsed.data;

      if (message.type === 'ping') return send({ type: 'pong' });

      if (message.type === 'subscribe') {
        hub.subscribe(subscriber, message.topic);
        if (message.topic === TOPIC.metrics) {
          // Sofort ein Bild liefern, statt bis zum nächsten Takt zu warten.
          send({ type: 'metrics', at: new Date().toISOString(), host: ticker.hostStatus(), instances: [] });
        }
        if (message.topic.startsWith('logs:')) {
          const instanceId = message.topic.slice('logs:'.length);
          const lines = logs.buffer(instanceId);
          if (lines.length > 0) send({ type: 'log', instanceId, lines });
        }
        return;
      }

      hub.unsubscribe(subscriber, message.topic);
    });

    socket.on('close', () => hub.remove(subscriber));
    socket.on('error', () => hub.remove(subscriber));
  });
}

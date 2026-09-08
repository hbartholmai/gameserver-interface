import { serverMessageSchema, type ClientMessage, type ServerMessage } from '@gsp/shared';

type Handler = (message: ServerMessage) => void;

/**
 * WebSocket-Verbindung mit Themen-Abonnements und automatischem Neuaufbau.
 * Abonnements werden gemerkt und nach einem Verbindungsabbruch erneut gesetzt,
 * damit die Oberfläche ohne Zutun weiterläuft.
 */
export class LiveConnection {
  private socket: WebSocket | null = null;
  private readonly topics = new Set<string>();
  private readonly handlers = new Set<Handler>();
  private reconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private closed = false;

  connect(): void {
    if (this.socket || this.closed) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/api/ws`);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectDelay = 1000;
      for (const topic of this.topics) this.send({ type: 'subscribe', topic });
    });

    socket.addEventListener('message', (event) => {
      let parsed;
      try {
        parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      for (const handler of this.handlers) handler(parsed.data);
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      if (this.closed) return;
      // Abstand verdoppeln, gedeckelt — ein neu startender Server soll nicht
      // von Verbindungsversuchen überrollt werden.
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(15_000, this.reconnectDelay * 2);
    });

    socket.addEventListener('error', () => socket.close());
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  subscribe(topic: string): void {
    if (this.topics.has(topic)) return;
    this.topics.add(topic);
    this.send({ type: 'subscribe', topic });
  }

  unsubscribe(topic: string): void {
    if (!this.topics.delete(topic)) return;
    this.send({ type: 'unsubscribe', topic });
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

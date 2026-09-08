import type { ServerMessage } from '@gsp/shared';

type Sink = (message: ServerMessage) => void;

interface Subscriber {
  sink: Sink;
  topics: Set<string>;
}

/**
 * Themenbasierte Verteilung an die verbundenen WebSocket-Clients. Nachrichten
 * gehen nur an Clients, die das jeweilige Thema abonniert haben — der
 * Log-Stream einer Instanz belastet damit keine Clients, die einen anderen
 * Reiter offen haben.
 */
export class Hub {
  private readonly subscribers = new Set<Subscriber>();

  add(sink: Sink): Subscriber {
    const subscriber: Subscriber = { sink, topics: new Set() };
    this.subscribers.add(subscriber);
    return subscriber;
  }

  remove(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber);
  }

  subscribe(subscriber: Subscriber, topic: string): void {
    subscriber.topics.add(topic);
  }

  unsubscribe(subscriber: Subscriber, topic: string): void {
    subscriber.topics.delete(topic);
  }

  /** Anzahl Clients, die ein Thema hören — spart Arbeit bei niemandem. */
  listenerCount(topic: string): number {
    let count = 0;
    for (const subscriber of this.subscribers) {
      if (subscriber.topics.has(topic)) count += 1;
    }
    return count;
  }

  publish(topic: string, message: ServerMessage): void {
    for (const subscriber of this.subscribers) {
      if (!subscriber.topics.has(topic)) continue;
      try {
        subscriber.sink(message);
      } catch {
        // Ein defekter Client darf die Zustellung an die übrigen nicht stoppen.
        this.subscribers.delete(subscriber);
      }
    }
  }

  /** An alle Clients, unabhängig von Abonnements. */
  broadcast(message: ServerMessage): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.sink(message);
      } catch {
        this.subscribers.delete(subscriber);
      }
    }
  }
}

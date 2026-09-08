import {
  LOG_BUFFER_LENGTH,
  TOPIC,
  clockHms,
  getTemplate,
  type LogLine,
} from '@gsp/shared';
import type { Store, InstanceRecord } from '../db/store.js';
import type { Runtime } from '../runtime/types.js';
import type { Hub } from './hub.js';

interface Stream {
  buffer: LogLine[];
  players: Set<string>;
  /** Der Server hat seine Startmeldung geschrieben. */
  ready: boolean;
  abort: AbortController;
  /**
   * Ob gerade tatsächlich gelesen wird. Das Abbruchsignal allein genügt nicht:
   * Ein Stream kann von sich aus enden — etwa weil der Container weg war — ohne
   * dass abgebrochen wurde. Ohne dieses Kennzeichen würde `attach` das Lesen
   * dann nie wieder aufnehmen und der Status bliebe auf „Startet“ stehen.
   */
  active: boolean;
}

/**
 * Liest die Container-Logs, stuft jede Zeile ein, verfolgt Beitritte und
 * Abgänge und verteilt neue Zeilen an die Abonnenten. Der Ringpuffer je Instanz
 * entspricht mit 140 Zeilen der Vorgabe aus dem Design.
 */
export class LogService {
  private readonly streams = new Map<string, Stream>();

  constructor(
    private readonly runtime: Runtime,
    private readonly store: Store,
    private readonly hub: Hub,
  ) {}

  buffer(instanceId: string): LogLine[] {
    return this.streams.get(instanceId)?.buffer ?? [];
  }

  players(instanceId: string): Set<string> {
    return this.streams.get(instanceId)?.players ?? new Set();
  }

  isReady(instanceId: string): boolean {
    return this.streams.get(instanceId)?.ready ?? false;
  }

  /** Schreibt eine Zeile aus dem Panel selbst in den Puffer (Befehle, Fehler). */
  append(instanceId: string, line: LogLine): void {
    const stream = this.ensure(instanceId);
    stream.buffer.push(line);
    if (stream.buffer.length > LOG_BUFFER_LENGTH) {
      stream.buffer.splice(0, stream.buffer.length - LOG_BUFFER_LENGTH);
    }
    this.hub.publish(TOPIC.logs(instanceId), { type: 'log', instanceId, lines: [line] });
  }

  /** Beginnt, die Logs einer Instanz zu verfolgen. Mehrfachaufrufe sind sicher. */
  attach(instance: InstanceRecord): void {
    const stream = this.ensure(instance.id);
    if (stream.active) return;
    stream.abort = new AbortController();
    stream.active = true;
    void this.pump(instance, stream);
  }

  detach(instanceId: string): void {
    const stream = this.streams.get(instanceId);
    if (!stream) return;
    stream.abort.abort();
    stream.active = false;
  }

  /** Setzt Bereitschaft und Spielerliste zurück — beim Stoppen einer Instanz. */
  reset(instanceId: string): void {
    const stream = this.streams.get(instanceId);
    if (!stream) return;
    stream.ready = false;
    stream.players.clear();
    this.store.closeAllPlayerSessions(instanceId);
  }

  remove(instanceId: string): void {
    this.detach(instanceId);
    this.streams.delete(instanceId);
  }

  private ensure(instanceId: string): Stream {
    let stream = this.streams.get(instanceId);
    if (!stream) {
      stream = {
        buffer: [],
        players: new Set(),
        ready: false,
        abort: new AbortController(),
        active: false,
      };
      this.streams.set(instanceId, stream);
      // Nach einem Neustart des Panels sind Sitzungen aus der DB maßgeblich.
      for (const name of this.store.openSessions(instanceId).keys()) stream.players.add(name);
    }
    return stream;
  }

  private async pump(instance: InstanceRecord, stream: Stream): Promise<void> {
    const template = getTemplate(instance.game);
    const patterns = template.logPatterns;

    try {
      for await (const raw of this.runtime.logs(instance.containerName, {
        follow: true,
        tail: LOG_BUFFER_LENGTH,
        signal: stream.abort.signal,
      })) {
        const text = (patterns.clean ? patterns.clean(raw) : raw).trim();
        if (!text) continue;

        const line: LogLine = { time: clockHms(), level: patterns.level(raw), text };
        stream.buffer.push(line);
        if (stream.buffer.length > LOG_BUFFER_LENGTH) {
          stream.buffer.splice(0, stream.buffer.length - LOG_BUFFER_LENGTH);
        }

        this.trackPlayers(instance, stream, raw);
        if (!stream.ready && patterns.ready.test(raw)) stream.ready = true;

        this.hub.publish(TOPIC.logs(instance.id), { type: 'log', instanceId: instance.id, lines: [line] });
      }
    } catch (err) {
      if (stream.abort.signal.aborted) return;
      // Ein abgerissener Log-Stream ist im Design als Fehlerfall vorgesehen.
      this.append(instance.id, {
        time: clockHms(),
        level: 'ERROR',
        text: `Log-Verbindung abgerissen: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      stream.active = false;
    }
  }

  private trackPlayers(instance: InstanceRecord, stream: Stream, raw: string): void {
    const patterns = getTemplate(instance.game).logPatterns;

    const joined = patterns.join.exec(raw)?.[1]?.trim();
    if (joined && !stream.players.has(joined)) {
      stream.players.add(joined);
      this.store.openPlayerSession(instance.id, joined);
      this.store.addEvent(instance.id, `${joined} hat sich verbunden`);
      this.hub.publish(TOPIC.events, {
        type: 'event',
        instanceId: instance.id,
        event: { time: hm(), text: `${joined} hat sich verbunden` },
      });
      return;
    }

    const left = patterns.leave?.exec(raw)?.[1]?.trim();
    if (left && stream.players.has(left)) {
      stream.players.delete(left);
      this.store.closePlayerSession(instance.id, left);
      this.store.addEvent(instance.id, `${left} hat die Verbindung getrennt`);
      this.hub.publish(TOPIC.events, {
        type: 'event',
        instanceId: instance.id,
        event: { time: hm(), text: `${left} hat die Verbindung getrennt` },
      });
    }
  }

  /**
   * Gleicht die aus dem Log gelesene Liste gegen eine gezählte Spielerzahl ab.
   * Valheim meldet beim Verlassen keinen Namen — ohne diesen Abgleich blieben
   * Spieler dauerhaft in der Liste stehen.
   */
  reconcileCount(instanceId: string, actual: number): void {
    const stream = this.streams.get(instanceId);
    if (!stream) return;
    while (stream.players.size > actual) {
      const oldest = stream.players.values().next().value;
      if (oldest === undefined) break;
      stream.players.delete(oldest);
      this.store.closePlayerSession(instanceId, oldest);
    }
  }
}

function hm(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

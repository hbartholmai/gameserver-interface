import { randomUUID } from 'node:crypto';
import { DEFAULT_FAKE_LOG, findTemplate, renderFakeLine } from '@gsp/shared';
import {
  INSTANCE_LABEL,
  type ContainerSpec,
  type ContainerState,
  type ExecResult,
  type LogOptions,
  type PullProgress,
  type Runtime,
  type RuntimeHealth,
  type StatsSample,
} from './types.js';

interface FakeContainer {
  spec: ContainerSpec;
  id: string;
  running: boolean;
  startedAt: number | null;
  exitCode: number | null;
  cpuCounter: number;
  memBytes: number;
  netRx: number;
  netTx: number;
  players: string[];
  lines: string[];
  listeners: Set<(line: string) => void>;
  timer: NodeJS.Timeout | null;
}

const NAME_POOL = ['skadi', 'Torvald', 'lena_k', 'Ragnvald', 'mo', 'Hilde', 'per_a', 'Sigrun'];

/**
 * Erzeugt die Logzeile aus der `fakeLog`-Angabe der Vorlage. Früher stand hier
 * eine feste Tabelle je Spiel — und wer ein Log-Muster änderte, musste daran
 * denken, sie mitzupflegen, sonst liefen die Tests gegen ein Format, das es in
 * Wirklichkeit nicht gab. Die eigentliche Erzeugung liegt in `@gsp/shared`
 * neben den Mustern, damit ein Test beide gegeneinander prüfen kann.
 */
function render(
  game: string,
  kind: 'join' | 'leave' | 'chatter' | 'ready',
  name: string,
  n: number,
): string {
  const spec = findTemplate(game)?.definition.fakeLog ?? DEFAULT_FAKE_LOG;
  return renderFakeLine(spec, kind, name, n);
}

/**
 * Laufzeit ohne Docker. Sie dient als Test-Double und als Entwicklungsmodus
 * (`GSP_RUNTIME=fake`) und übernimmt die Simulationslogik des Design-Prototyps:
 * Random-Walk auf CPU und RAM, gelegentliche Beitritte und Abgänge,
 * spielspezifische Logzeilen und ein verzögerter Start.
 */
export class FakeRuntime implements Runtime {
  readonly kind = 'fake' as const;
  private readonly containers = new Map<string, FakeContainer>();
  /** Verzögerung bis „Online“ — im Design 2200 ms. In Tests auf 0 gesetzt. */
  constructor(
    private readonly startupMs = 2200,
    /** Dauer des simulierten Image-Pulls. Tests setzen 0, damit sie schnell bleiben. */
    private readonly pullMs = 6000,
  ) {}

  async health(): Promise<RuntimeHealth> {
    return { ok: true, version: 'fake-1.0', error: null };
  }

  /**
   * Simulierter Image-Pull. Die Byte-Zahlen sind erfunden, aber sie laufen über
   * `pullMs` hinweg hoch — ohne das ließe sich die Fortschrittsanzeige ohne
   * Docker nie in Bewegung beurteilen, sondern immer nur fertig.
   */
  async pull(_image: string, onProgress?: (p: PullProgress) => void): Promise<void> {
    const gesamtBytes = 1_180_000_000;
    const schritte = this.pullMs > 0 ? 24 : 1;
    const pause = this.pullMs / schritte;

    for (let i = 1; i <= schritte; i += 1) {
      const anteil = i / schritte;
      onProgress?.({
        percent: anteil * 100,
        // Dieselben Statustexte, die die Docker-Engine schickt.
        message: anteil < 0.7 ? 'Downloading' : anteil < 1 ? 'Extracting' : 'Pull complete',
        currentBytes: Math.round(gesamtBytes * anteil),
        totalBytes: gesamtBytes,
      });
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    }
  }

  async create(spec: ContainerSpec): Promise<string> {
    const id = randomUUID().replace(/-/g, '');
    this.containers.set(spec.name, {
      spec,
      id,
      running: false,
      startedAt: null,
      exitCode: null,
      cpuCounter: 20 + Math.random() * 30,
      memBytes: spec.memoryMb * 1024 * 1024 * 0.3,
      netRx: 0,
      netTx: 0,
      players: [],
      lines: [],
      listeners: new Set(),
      timer: null,
    });
    return id;
  }

  async remove(name: string): Promise<void> {
    const c = this.containers.get(name);
    if (c?.timer) clearInterval(c.timer);
    this.containers.delete(name);
  }

  async start(name: string): Promise<void> {
    const c = this.need(name);
    if (c.running) return;
    c.running = true;
    c.startedAt = Date.now();
    c.exitCode = null;
    const game = c.spec.labels.game ?? 'minecraft';
    setTimeout(() => {
      if (!c.running) return;
      this.emit(c, render(game, 'ready', '', 1200));
    }, this.startupMs);
    c.timer = setInterval(() => this.tick(c, game), 2000);
    // Der Simulations-Timer darf den Prozess nicht am Beenden hindern.
    c.timer.unref?.();
  }

  async stop(name: string): Promise<void> {
    const c = this.need(name);
    if (c.timer) clearInterval(c.timer);
    c.timer = null;
    c.running = false;
    c.startedAt = null;
    c.exitCode = 0;
    c.players = [];
    c.memBytes = 0;
  }

  async restart(name: string): Promise<void> {
    await this.stop(name);
    await this.start(name);
  }

  async inspect(name: string): Promise<ContainerState> {
    const c = this.containers.get(name);
    if (!c) return { id: null, exists: false, running: false, startedAt: null, exitCode: null, error: null };
    return {
      id: c.id,
      exists: true,
      running: c.running,
      startedAt: c.startedAt ? new Date(c.startedAt).toISOString() : null,
      exitCode: c.exitCode,
      error: null,
    };
  }

  async stats(name: string): Promise<StatsSample | null> {
    const c = this.containers.get(name);
    if (!c) return null;
    const limit = c.spec.memoryMb * 1024 * 1024;
    return {
      at: Date.now(),
      cpuPctOfHost: c.running ? (c.cpuCounter / 100) * c.spec.cpus * 100 : 0,
      memBytes: c.running ? c.memBytes : 0,
      memLimitBytes: limit,
      netRxBytes: c.netRx,
      netTxBytes: c.netTx,
    };
  }

  async *logs(name: string, options: LogOptions): AsyncIterable<string> {
    const c = this.need(name);
    const tail = options.tail ?? 200;
    for (const line of c.lines.slice(-tail)) yield line;
    if (!options.follow) return;

    const queue: string[] = [];
    let wake: (() => void) | null = null;
    const listener = (line: string) => {
      queue.push(line);
      wake?.();
    };
    c.listeners.add(listener);
    try {
      while (!options.signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            options.signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          wake = null;
        }
        while (queue.length > 0) {
          const line = queue.shift();
          if (line !== undefined) yield line;
        }
      }
    } finally {
      c.listeners.delete(listener);
    }
  }

  async exec(name: string, cmd: string[]): Promise<ExecResult> {
    const c = this.need(name);
    return { exitCode: 0, stdout: `fake exec: ${cmd.join(' ')} (${c.spec.name})`, stderr: '' };
  }

  async list(): Promise<{ name: string; state: ContainerState }[]> {
    return Promise.all(
      [...this.containers.values()].map(async (c) => ({
        name: c.spec.labels[INSTANCE_LABEL] ?? c.spec.name,
        state: await this.inspect(c.spec.name),
      })),
    );
  }

  /** Spielerliste, die der Fake-Spieladapter statt echter Abfragen liefert. */
  playersOf(name: string): string[] {
    return this.containers.get(name)?.players ?? [];
  }

  private tick(c: FakeContainer, game: string): void {
    if (!c.running) return;
    const format = (kind: 'join' | 'leave' | 'chatter' | 'ready', name: string, n: number) =>
      render(game, kind, name, n);
    const limit = c.spec.memoryMb * 1024 * 1024;

    c.cpuCounter = Math.min(97, Math.max(4, c.cpuCounter + (Math.random() - 0.5) * 9));
    c.memBytes = Math.min(limit * 0.96, Math.max(limit * 0.05, c.memBytes + (Math.random() - 0.5) * 2e8));
    c.netRx += Math.round(Math.random() * 200_000);
    c.netTx += Math.round(Math.random() * 500_000);

    if (Math.random() < 0.06) {
      if (Math.random() < 0.5 && c.players.length > 0) {
        const gone = c.players.pop()!;
        this.emit(c, format('leave', gone, 9000 + Math.floor(Math.random() * 900)));
      } else {
        const free = NAME_POOL.filter((n) => !c.players.includes(n));
        const next = free[Math.floor(Math.random() * free.length)];
        if (next) {
          c.players.push(next);
          this.emit(c, format('join', next, Math.floor(Math.random() * 9000)));
        }
      }
    }
    if (Math.random() < 0.35) {
      this.emit(c, format('chatter', c.players[0] ?? 'Konsole', 60 + Math.floor(Math.random() * 480)));
    }
  }

  private emit(c: FakeContainer, line: string): void {
    c.lines.push(line);
    if (c.lines.length > 500) c.lines.splice(0, c.lines.length - 500);
    for (const listener of c.listeners) listener(line);
  }

  private need(name: string): FakeContainer {
    const c = this.containers.get(name);
    if (!c) {
      const err = new Error(`Container ${name} existiert nicht`) as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
    return c;
  }
}

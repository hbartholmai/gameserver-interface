import { HISTORY_LENGTH, type Metrics, type Player } from '@gsp/shared';
import type { InstanceRecord, Store } from '../db/store.js';
import type { Runtime, StatsSample } from '../runtime/types.js';
import { getAdapter } from '../games/index.js';
import type { LogService } from './logs.js';
import { directorySize, filesystemUsage } from './diskusage.js';

interface Live {
  cpuHist: number[];
  ramHist: number[];
  playerHist: number[];
  previous: StatsSample | null;
  netRxRate: number;
  netTxRate: number;
  players: Player[];
  pingMs: number | null;
  tps: string | null;
  version: string | null;
  maxPlayers: number | null;
  diskUsed: number;
  diskTotal: number;
  worldSize: number;
  lastProbe: number;
  lastPersist: number;
}

function emptyHistory(): number[] {
  return Array.from({ length: HISTORY_LENGTH }, () => 0);
}

function push(history: number[], value: number): void {
  history.push(value);
  if (history.length > HISTORY_LENGTH) history.splice(0, history.length - HISTORY_LENGTH);
}

/**
 * Sammelt Messwerte je Instanz und hält die Verläufe als Ringpuffer mit
 * `HISTORY_LENGTH` Werten — genau die Punktzahl, die die Sparklines im Design
 * zeichnen.
 *
 * Die Serverabfrage über das Spielprotokoll (Ping, Spielerliste) ist teurer als
 * das Auslesen der Container-Statistik und läuft deshalb in größerem Abstand.
 */
export class MetricsService {
  private readonly live = new Map<string, Live>();

  constructor(
    private readonly runtime: Runtime,
    private readonly store: Store,
    private readonly logs: LogService,
    private readonly publicHost: string,
    private readonly volumeDir: string,
    private readonly probeIntervalMs = 6000,
  ) {}

  remove(instanceId: string): void {
    this.live.delete(instanceId);
  }

  snapshot(instance: InstanceRecord): { metrics: Metrics; players: Player[]; version: string | null } {
    const live = this.ensure(instance.id);
    const limitBytes = instance.memoryMb * 1024 * 1024;
    return {
      metrics: {
        cpuPct: live.cpuHist[live.cpuHist.length - 1] ?? 0,
        memBytes: live.ramHist[live.ramHist.length - 1] ?? 0,
        memLimitBytes: limitBytes,
        diskUsedBytes: live.diskUsed,
        diskTotalBytes: live.diskTotal,
        worldSizeBytes: live.worldSize,
        netRxBytesPerSec: live.netRxRate,
        netTxBytesPerSec: live.netTxRate,
        uptimeSec: 0, // wird vom Instanzdienst aus dem Containerzustand gesetzt
        tps: live.tps,
        pingMs: live.pingMs,
        cpuHist: [...live.cpuHist],
        ramHist: [...live.ramHist],
        playerHist: [...live.playerHist],
        peakPlayers: instance.peakPlayers,
        avgPlayers24h: this.store.avgPlayers24h(instance.id),
      },
      players: live.players,
      version: live.version,
    };
  }

  /** Ein Messzyklus für eine Instanz. */
  async collect(instance: InstanceRecord, running: boolean): Promise<void> {
    const live = this.ensure(instance.id);

    if (!running) {
      push(live.cpuHist, 0);
      push(live.ramHist, 0);
      push(live.playerHist, 0);
      live.previous = null;
      live.netRxRate = 0;
      live.netTxRate = 0;
      live.players = [];
      live.pingMs = null;
      live.tps = null;
      return;
    }

    const sample = await this.runtime.stats(instance.containerName).catch(() => null);
    if (sample) {
      // Der Docker-Wert bezieht sich auf den ganzen Host. Im Panel ist die
      // Auslastung der zugeteilten Kerne aussagekräftiger — 100 % bedeutet
      // damit „das CPU-Kontingent dieser Instanz ist ausgeschöpft“.
      const cpuPct = instance.cpus > 0 ? sample.cpuPctOfHost / instance.cpus : sample.cpuPctOfHost;
      push(live.cpuHist, Math.max(0, Math.min(100, cpuPct)));
      push(live.ramHist, sample.memBytes);

      if (live.previous) {
        const seconds = Math.max(0.001, (sample.at - live.previous.at) / 1000);
        live.netRxRate = Math.max(0, (sample.netRxBytes - live.previous.netRxBytes) / seconds);
        live.netTxRate = Math.max(0, (sample.netTxBytes - live.previous.netTxBytes) / seconds);
      }
      live.previous = sample;
    }

    await this.updateDisk(instance, live);

    const now = Date.now();
    if (now - live.lastProbe >= this.probeIntervalMs) {
      live.lastProbe = now;
      await this.probe(instance, live);
    }

    push(live.playerHist, live.players.length);

    if (live.players.length > instance.peakPlayers) {
      this.store.updateInstance(instance.id, { peakPlayers: live.players.length });
    }

    // Persistenz nur alle 30 s — für den 24-Stunden-Durchschnitt reicht das.
    if (now - live.lastPersist >= 30_000) {
      live.lastPersist = now;
      this.store.addMetricSample(
        instance.id,
        live.cpuHist[live.cpuHist.length - 1] ?? 0,
        live.ramHist[live.ramHist.length - 1] ?? 0,
        live.players.length,
      );
    }
  }

  private async probe(instance: InstanceRecord, live: Live): Promise<void> {
    const adapter = getAdapter(instance.game);
    const ctx = {
      instance,
      runtime: this.runtime,
      store: this.store,
      publicHost: this.publicHost,
      logPlayers: this.logs.players(instance.id),
    };

    try {
      const probe = await adapter.probe(ctx);
      if (probe) {
        live.pingMs = probe.pingMs;
        live.tps = probe.tps;
        live.version = probe.version;
        live.maxPlayers = probe.maxPlayers;
        // Bei Valheim liefert die Abfrage nur eine Zahl — die Namensliste aus
        // dem Log wird daran angeglichen.
        if (probe.playerCount !== null && probe.names === null) {
          this.logs.reconcileCount(instance.id, probe.playerCount);
        }
      }
      live.players = await adapter.listPlayers(ctx);
    } catch {
      // Eine fehlgeschlagene Abfrage ist kein Fehlerzustand der Instanz — der
      // Server kann noch hochfahren. Die letzten bekannten Werte bleiben stehen.
    }
  }

  private async updateDisk(instance: InstanceRecord, live: Live): Promise<void> {
    const root = `${this.volumeDir}/${instance.id}`;
    const usage = await filesystemUsage(root);
    live.diskTotal = usage.total;
    live.diskUsed = usage.used;
    live.worldSize = directorySize(root);
  }

  private ensure(instanceId: string): Live {
    let live = this.live.get(instanceId);
    if (!live) {
      live = {
        cpuHist: emptyHistory(),
        ramHist: emptyHistory(),
        playerHist: emptyHistory(),
        previous: null,
        netRxRate: 0,
        netTxRate: 0,
        players: [],
        pingMs: null,
        tps: null,
        version: null,
        maxPlayers: null,
        diskUsed: 0,
        diskTotal: 0,
        worldSize: 0,
        lastProbe: 0,
        lastPersist: 0,
      };
      this.live.set(instanceId, live);
    }
    return live;
  }
}

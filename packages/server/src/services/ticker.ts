import { TOPIC, type HostStatus } from '@gsp/shared';
import type { Config } from '../config.js';
import type { Store } from '../db/store.js';
import type { Runtime } from '../runtime/types.js';
import type { Hub } from './hub.js';
import type { InstanceService } from './instances.js';
import type { MetricsService } from './metrics.js';

/**
 * Erhebt im Takt von `refreshMs` die Messwerte aller Instanzen und schickt
 * einen Gesamtschnappschuss an die Abonnenten des Themas `metrics`. Ist
 * niemand verbunden, wird nur seltener gemessen — ein unbeobachtetes Panel
 * soll den Host nicht belasten.
 */
export class Ticker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private idleSkips = 0;
  private lastHealthCheck = 0;
  private health: { ok: boolean; version: string | null; error: string | null } = {
    ok: true,
    version: null,
    error: null,
  };

  constructor(
    private readonly config: Config,
    private readonly runtime: Runtime,
    private readonly store: Store,
    private readonly instances: InstanceService,
    private readonly metrics: MetricsService,
    private readonly hub: Hub,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.config.refreshMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  hostStatus(): HostStatus {
    return this.lastHost;
  }

  private lastHost: HostStatus = {
    runtime: 'docker',
    reachable: true,
    error: null,
    version: null,
    hostCpuPct: 0,
    instancesTotal: 0,
    instancesOnline: 0,
    playersTotal: 0,
    nodeLabel: 'node 01',
  };

  private async tick(): Promise<void> {
    // Ein langsamer Zyklus darf sich nicht mit dem nächsten überlappen.
    if (this.running) return;

    const listeners = this.hub.listenerCount(TOPIC.metrics);
    if (listeners === 0) {
      // Ohne Zuhörer nur jeden zehnten Takt messen — die Verläufe bleiben
      // dadurch grob aktuell, ohne dauernd Abfragen zu erzeugen.
      this.idleSkips += 1;
      if (this.idleSkips < 10) return;
    }
    this.idleSkips = 0;
    this.running = true;

    try {
      await this.checkHealth();
      const records = this.instances.list();
      const payload = [];
      let cpuSum = 0;
      let onlineCount = 0;
      let playersTotal = 0;

      for (const record of records) {
        const state = await this.instances.statusOf(record);
        await this.metrics.collect(record, state.running);
        const snapshot = this.metrics.snapshot(record);
        const players = state.running ? snapshot.players : [];

        if (state.running) {
          cpuSum += snapshot.metrics.cpuPct;
          onlineCount += 1;
        }
        if (state.status === 'Online') playersTotal += players.length;

        payload.push({
          id: record.id,
          status: state.status,
          running: state.running,
          updating: false,
          error: state.error,
          metrics: { ...snapshot.metrics, uptimeSec: state.uptimeSec },
          players,
        });
      }

      this.lastHost = {
        runtime: this.runtime.kind,
        reachable: this.health.ok,
        error: this.health.error,
        version: this.health.version,
        hostCpuPct: onlineCount > 0 ? cpuSum / onlineCount : 0,
        instancesTotal: records.length,
        instancesOnline: onlineCount,
        playersTotal,
        nodeLabel: this.config.nodeLabel,
      };

      this.hub.publish(TOPIC.metrics, {
        type: 'metrics',
        at: new Date().toISOString(),
        host: this.lastHost,
        instances: payload,
      });
    } finally {
      this.running = false;
    }
  }

  /** Erreichbarkeit des Container-Backends — speist das globale Fehlerbanner. */
  private async checkHealth(): Promise<void> {
    if (Date.now() - this.lastHealthCheck < 15_000) return;
    this.lastHealthCheck = Date.now();
    this.health = await this.runtime.health();
  }

  /** Räumt alte Messwerte auf; wird stündlich aufgerufen. */
  prune(): void {
    this.store.pruneMetrics();
  }
}

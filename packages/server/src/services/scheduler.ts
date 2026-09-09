import { CronExpressionParser } from 'cron-parser';
import type { InstanceService } from './instances.js';

/**
 * Führt geplante Backups aus. Geprüft wird jede Minute; fällig ist ein Backup,
 * wenn seit dem letzten Lauf ein Cron-Zeitpunkt überschritten wurde. Nach einem
 * Neustart des Panels wird ein verpasster Zeitpunkt nicht nachgeholt.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly lastRun = new Map<string, number>();

  constructor(private readonly instances: InstanceService) {}

  start(): void {
    if (this.timer) return;
    const startedAt = Date.now();
    for (const instance of this.instances.list()) {
      this.lastRun.set(instance.id, startedAt);
    }
    this.timer = setInterval(() => this.tick(), 60_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Öffentlich, damit Tests einen Zyklus ohne Warten auslösen können. */
  tick(now = Date.now()): void {
    for (const instance of this.instances.list()) {
      const cron = instance.backupCron.trim();
      if (!cron) continue;

      const since = this.lastRun.get(instance.id) ?? now;
      if (since === now) {
        this.lastRun.set(instance.id, now);
        continue;
      }

      let due = false;
      try {
        const schedule = CronExpressionParser.parse(cron, { currentDate: new Date(since) });
        due = schedule.next().getTime() <= now;
      } catch {
        // Ungültiger Ausdruck: nicht ausführen, aber auch nicht dauernd prüfen.
        this.lastRun.set(instance.id, now);
        continue;
      }

      if (!due) continue;
      this.lastRun.set(instance.id, now);
      this.instances.backup(instance.id, 'auto');
    }
  }
}

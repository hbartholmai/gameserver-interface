import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

// Bestehende Instanzen wieder verfolgen und die Messung aufnehmen.
app.services.instances.attachAll();
app.services.ticker.start();
app.services.scheduler.start();

// Alte Messwerte stündlich aufräumen.
const prune = setInterval(() => app.services.ticker.prune(), 3600_000);
prune.unref();

try {
  await app.server.listen({ port: config.port, host: config.host });
  app.server.log.info(
    { runtime: config.runtime, dataDir: config.dataDir },
    `Gameserver-Panel läuft auf http://${config.host}:${config.port}`,
  );
} catch (err) {
  app.server.log.error({ err }, 'Start fehlgeschlagen');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

import type { FakeLogSpec } from '../schema/template-definition.js';

/**
 * Erzeugt eine simulierte Logzeile aus der `fakeLog`-Angabe einer Vorlage.
 *
 * Liegt bewusst neben den Log-Mustern in `@gsp/shared` und nicht in der
 * Fake-Runtime: so kann ein Test belegen, dass die erzeugten Zeilen zu den
 * Mustern **derselben** Vorlage passen. Vorher lagen Muster und Simulation in
 * verschiedenen Paketen, und wer eines änderte, prüfte anschließend gegen ein
 * Format, das es in Wirklichkeit nicht gab.
 */
export function renderFakeLine(
  spec: FakeLogSpec,
  kind: 'join' | 'leave' | 'ready' | 'chatter',
  name: string,
  n: number,
  now = new Date(),
): string {
  return spec[kind]
    .replaceAll('{time}', formatTime(spec.timeFormat, now))
    .replaceAll('{name}', name)
    .replaceAll('{n}', String(n));
}

/** Für Vorlagen ohne eigene Angabe — erkennbar generisch, nicht spielecht. */
export const DEFAULT_FAKE_LOG: FakeLogSpec = {
  timeFormat: 'iso',
  join: '[{time}] Player {name} joined the game',
  leave: '[{time}] Player {name} left the game',
  ready: '[{time}] Server is now online',
  chatter: '[{time}] Autosave complete ({n} ms)',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(format: FakeLogSpec['timeFormat'], d: Date): string {
  const hms = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  switch (format) {
    case 'hms':
      return hms;
    case 'dmy':
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${hms}`;
    case 'iso':
      return d.toISOString().replace('T', ' ').slice(0, 19);
  }
}

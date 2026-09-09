import { describe, expect, it } from 'vitest';
import { describeCron } from './instances.js';

describe('describeCron', () => {
  it('beschreibt tägliche Zeitpläne wie im Design', () => {
    expect(describeCron('0 4 * * *', 7)).toBe('täglich 04:00 · 7 Tage');
    expect(describeCron('0 3 * * *', 14)).toBe('täglich 03:00 · 14 Tage');
  });

  it('meldet einen leeren Ausdruck als deaktiviert', () => {
    expect(describeCron('', 7)).toBe('deaktiviert');
    expect(describeCron('   ', 7)).toBe('deaktiviert');
  });

  it('gibt komplexere Ausdrücke unverändert wieder', () => {
    expect(describeCron('*/15 * * * *', 3)).toBe('*/15 * * * * · 3 Tage');
    expect(describeCron('0 4 * * 1', 7)).toBe('0 4 * * 1 · 7 Tage');
  });

  it('lässt die Aufbewahrung weg, wenn sie nicht gesetzt ist', () => {
    expect(describeCron('0 4 * * *', 0)).toBe('täglich 04:00');
  });
});

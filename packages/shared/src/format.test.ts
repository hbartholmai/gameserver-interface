import { describe, expect, it } from 'vitest';
import {
  backupStamp,
  formatBytes,
  formatDecimal,
  formatPercent,
  formatPing,
  formatPlaytime,
  formatRate,
  formatTimestamp,
  formatUptime,
  formatDauer,
} from './format.js';
import { pingColor } from './schema/common.js';

describe('Formatierung', () => {
  it('schreibt Größen mit Dezimalkomma wie im Design', () => {
    expect(formatBytes(5.4 * 1024 ** 3)).toBe('5,4 GB');
    expect(formatBytes(840 * 1024 ** 2)).toBe('840 MB');
    expect(formatBytes(0)).toBe('0 MB');
  });

  it('formatiert Datenraten', () => {
    expect(formatRate(82 * 1024)).toBe('82 kB/s');
    expect(formatRate(1.2 * 1024 ** 2)).toBe('1,2 MB/s');
  });

  it('rundet Prozentwerte und markiert Unbekanntes', () => {
    expect(formatPercent(41.4)).toBe('41 %');
    expect(formatPercent(Number.NaN)).toBe('— %');
  });

  it('schreibt Laufzeiten wie im Prototyp', () => {
    expect(formatUptime(71.5 * 3600)).toBe('71 h 30 m');
    expect(formatUptime(12 * 60)).toBe('12 m');
    expect(formatUptime(0)).toBe('0 m');
  });

  it('gibt Startdauern sekundengenau an', () => {
    // Der Grund für die eigene Funktion: formatUptime rundet auf Minuten und
    // würde einen 90-Sekunden-Start als „1 m“ ausgeben.
    expect(formatDauer(45)).toBe('45 s');
    expect(formatDauer(160)).toBe('2 m 40 s');
    expect(formatDauer(0)).toBe('0 s');
    expect(formatDauer(null)).toBe('—');
  });

  it('schreibt Spielzeiten und markiert fehlende Werte', () => {
    expect(formatPlaytime(2 * 3600 + 14 * 60)).toBe('2 h 14 min');
    expect(formatPlaytime(48 * 60)).toBe('48 min');
    expect(formatPlaytime(null)).toBe('—');
  });

  it('zeigt einen fehlenden Ping als Gedankenstrich', () => {
    expect(formatPing(38)).toBe('38 ms');
    expect(formatPing(null)).toBe('—');
  });

  it('folgt der Ping-Farbskala des Designs', () => {
    expect(pingColor(38)).toBe('#3ee08f');
    expect(pingColor(55)).toBe('#3ee08f');
    expect(pingColor(56)).toBe('#f0b429');
    expect(pingColor(91)).toBe('#ff6b6b');
    expect(pingColor(null)).toBe('#8b98a8');
  });

  it('benennt Zeitpunkte relativ zum heutigen Tag', () => {
    const jetzt = new Date(2026, 8, 9, 12, 0);
    expect(formatTimestamp(new Date(2026, 8, 9, 4, 0).toISOString(), jetzt)).toBe('heute 04:00');
    expect(formatTimestamp(new Date(2026, 8, 8, 3, 0).toISOString(), jetzt)).toBe('gestern 03:00');
    expect(formatTimestamp(new Date(2026, 8, 2, 19, 12).toISOString(), jetzt)).toBe('02.09. 19:12');
    expect(formatTimestamp(null)).toBe('—');
  });

  it('erzeugt sortierbare Backup-Zeitstempel', () => {
    expect(backupStamp(new Date(2026, 8, 9, 4, 0))).toBe('2026-09-09-0400');
  });

  it('schreibt Durchschnitte mit Dezimalkomma', () => {
    expect(formatDecimal(3.42)).toBe('3,4');
    expect(formatDecimal(4, 0)).toBe('4');
  });
});

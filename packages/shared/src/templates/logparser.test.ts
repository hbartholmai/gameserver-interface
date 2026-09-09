import { describe, expect, it } from 'vitest';
import { getTemplate } from './index.js';

describe('Minecraft-Logmuster', () => {
  const { logPatterns } = getTemplate('minecraft');

  it('erkennt Beitritt und Abgang', () => {
    const beitritt = '[12:34:56] [Server thread/INFO]: Kai_Baut[/1.2.3.4:5678] logged in with entity id 42';
    expect(logPatterns.join.exec(beitritt)?.[1]).toBe('Kai_Baut');

    const abgang = '[12:35:01] [Server thread/INFO]: Kai_Baut lost connection: Disconnected';
    expect(logPatterns.leave?.exec(abgang)?.[1]).toBe('Kai_Baut');
  });

  it('erkennt die Startmeldung', () => {
    expect(logPatterns.ready.test('[12:30:00] [Server thread/INFO]: Done (12.345s)! For help, type "help"')).toBe(true);
    expect(logPatterns.ready.test('[12:29:00] [Server thread/INFO]: Starting minecraft server')).toBe(false);
  });

  it('entfernt Zeitstempel und Thread-Präfix', () => {
    expect(logPatterns.clean?.('[12:34:56] [Server thread/INFO]: Saved the game')).toBe('Saved the game');
  });

  it('stuft Warnungen und Fehler ein', () => {
    expect(logPatterns.level('[12:00:00] [Server thread/WARN]: Can\'t keep up!')).toBe('WARN');
    expect(logPatterns.level('[12:00:00] [Server thread/ERROR]: Kaputt')).toBe('ERROR');
    expect(logPatterns.level('[12:00:00] [Server thread/INFO]: Alles gut')).toBe('INFO');
  });
});

describe('Valheim-Logmuster', () => {
  const { logPatterns } = getTemplate('valheim');

  it('liest den Spielernamen aus der ZDOID-Zeile', () => {
    const zeile = '09/08/2026 23:12:04: Got character ZDOID from Freyja_88 : -12345:1';
    expect(logPatterns.join.exec(zeile)?.[1]).toBe('Freyja_88');
  });

  it('hat bewusst kein Abgangsmuster — Valheim nennt dort keinen Namen', () => {
    expect(logPatterns.leave).toBeUndefined();
  });

  it('erkennt die Startmeldung und entfernt den Zeitstempel', () => {
    expect(logPatterns.ready.test('09/08/2026 23:10:00: DungeonDB Start 1200')).toBe(true);
    expect(logPatterns.clean?.('09/08/2026 23:10:00: World saved ( 431ms )')).toBe('World saved ( 431ms )');
  });
});

describe('Enshrouded-Logmuster', () => {
  const { logPatterns } = getTemplate('enshrouded');

  it('erkennt Beitritt und Abgang', () => {
    expect(logPatterns.join.exec("[2026-09-08 23:00:00] Player 'skadi' connected")?.[1]).toBe('skadi');
    expect(logPatterns.leave?.exec("[2026-09-08 23:05:00] Player 'skadi' disconnected")?.[1]).toBe('skadi');
  });

  it('erkennt die Startmeldung', () => {
    expect(logPatterns.ready.test('[2026-09-08 22:59:00] Server is now online')).toBe(true);
  });
});

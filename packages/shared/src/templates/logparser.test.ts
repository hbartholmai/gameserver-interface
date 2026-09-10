import { describe, expect, it } from 'vitest';
import { getTemplate, loadBuiltinTemplates } from './index.js';

// Die Muster werden auf Modulebene gelesen — die Registry muss vorher stehen.
loadBuiltinTemplates();

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

  // Zeilen aus dem Log eines laufenden `mornedhels/enshrouded-server`,
  // mitsamt dem supervisord-Präfix, das der Parser tatsächlich zu sehen bekommt.
  const zeile = (text: string) => `2026-09-10 00:37:14.083 supervisord: enshrouded-server ${text}`;

  it('erkennt Beitritt und Abgang', () => {
    const beitritt = zeile("[server] Player 'Henner' logged in with Permissions:");
    const abgang = zeile("[server] Remove Player 'Henner'");
    expect(logPatterns.join.exec(beitritt)?.[1]).toBe('Henner');
    expect(logPatterns.leave?.exec(abgang)?.[1]).toBe('Henner');
  });

  it('hält die Anmeldung mit der internen Nummer nicht für einen Spielernamen', () => {
    // Dieselbe Anmeldung, eine Zeile früher — hier steht der Handle statt des Namens.
    expect(logPatterns.join.test(zeile("[server] Machine '1': Player '0(0)' logged in"))).toBe(false);
  });

  it('erkennt die Startmeldung erst im Zustand Run', () => {
    expect(logPatterns.ready.test(zeile('[game_server] Switching state from LoadEcsScene to Run after 169.01 ms'))).toBe(true);
    // Die Sitzung ist da, aber der Server lädt noch die Welt — bei großen
    // Welten Minuten vor dem ersten Spieler.
    const sitzung = zeile("[Session] finished transition from 'Lobby' to 'Host_Online' (current='Host_Online')!");
    expect(logPatterns.ready.test(sitzung)).toBe(false);
  });
});

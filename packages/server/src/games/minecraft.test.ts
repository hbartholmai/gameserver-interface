import { describe, expect, it } from 'vitest';
import { parsePlayerList, parseTps } from './minecraft.js';

describe('parsePlayerList', () => {
  it('liest Anzahl und Namen aus der list-Antwort', () => {
    const antwort = 'There are 3 of a max of 10 players online: Freyja_88, Bjorn, tilo';
    expect(parsePlayerList(antwort)).toEqual({
      online: 3,
      max: 10,
      names: ['Freyja_88', 'Bjorn', 'tilo'],
    });
  });

  it('kommt mit einem leeren Server zurecht', () => {
    const ergebnis = parsePlayerList('There are 0 of a max of 20 players online: ');
    expect(ergebnis.online).toBe(0);
    expect(ergebnis.names).toEqual([]);
  });
});

describe('parseTps', () => {
  it('formatiert den Ein-Minuten-Wert mit Dezimalkomma', () => {
    expect(parseTps('TPS from last 1m, 5m, 15m: 19.87, 19.9, 20.0')).toBe('19,9 TPS');
  });

  it('gibt null zurück, wenn der Befehl unbekannt ist', () => {
    expect(parseTps('Unknown command')).toBeNull();
  });
});

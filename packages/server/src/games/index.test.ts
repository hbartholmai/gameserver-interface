import { describe, expect, it } from 'vitest';
import { compileTemplate, minecraftDefinition, palworldDefinition, valheimDefinition } from '@gsp/shared';
import { adapterFor } from './index.js';
import { rconAdapter } from './minecraft.js';
import { a2sAdapter } from './valheim.js';

/**
 * Verglichen wird die Identität der Methoden, nicht ihr Ergebnis: die Frage ist
 * allein, woher jede Fähigkeit stammt — ausführen ließe sie sich ohne Container
 * ohnehin nicht.
 */
describe('adapterFor', () => {
  it('nimmt bei Palworld die Spielerliste aus der Steam-Abfrage, die Konsole aus RCON', () => {
    const adapter = adapterFor(compileTemplate(palworldDefinition));
    expect(adapter.listPlayers).toBe(a2sAdapter.listPlayers);
    expect(adapter.probe).toBe(a2sAdapter.probe);
    expect(adapter.sendCommand).toBe(rconAdapter.sendCommand);
  });

  it('lässt Kick und Bann bei Palworld beim Steam-Adapter — die Vorlage sagt sie nicht zu', () => {
    const adapter = adapterFor(compileTemplate(palworldDefinition));
    expect(adapter.kick).toBe(a2sAdapter.kick);
    expect(adapter.ban).toBe(a2sAdapter.ban);
  });

  it('gibt bei Minecraft alles an RCON', () => {
    const adapter = adapterFor(compileTemplate(minecraftDefinition));
    expect(adapter.sendCommand).toBe(rconAdapter.sendCommand);
    expect(adapter.kick).toBe(rconAdapter.kick);
  });

  it('lässt eine Vorlage ohne RCON unangetastet', () => {
    const adapter = adapterFor(compileTemplate(valheimDefinition));
    expect(adapter).toBe(a2sAdapter);
  });
});

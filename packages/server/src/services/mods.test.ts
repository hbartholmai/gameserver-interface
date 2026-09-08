import { describe, expect, it } from 'vitest';
import { parseModName } from './mods.js';

describe('parseModName', () => {
  it('trennt Name und Version', () => {
    expect(parseModName('EssentialsX-2.20.1.jar')).toEqual({ name: 'EssentialsX', version: '2.20.1' });
    expect(parseModName('LuckPerms-5.4.102.jar')).toEqual({ name: 'LuckPerms', version: '5.4.102' });
  });

  it('erkennt ein vorangestelltes v', () => {
    expect(parseModName('Chunky-v1.4.16.jar')).toEqual({ name: 'Chunky', version: '1.4.16' });
  });

  it('lässt Namen ohne erkennbare Version stehen', () => {
    expect(parseModName('BepInEx.dll')).toEqual({ name: 'BepInEx', version: '—' });
  });
});

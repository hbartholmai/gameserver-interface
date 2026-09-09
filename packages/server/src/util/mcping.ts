import { connect } from 'node:net';

export interface McStatus {
  versionName: string;
  players: number;
  maxPlayers: number;
  /** Namen aus der Beispielliste — Mojang liefert höchstens ~12 Einträge. */
  sample: string[];
  pingMs: number;
}

/**
 * Minecraft „Server List Ping“ (Handshake + Status). Liefert Versionstext,
 * Spielerzahl und Rundlaufzeit — dieselben Daten, die der Spiel-Client in der
 * Serverliste anzeigt.
 */
export async function pingMinecraft(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<McStatus | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (value: McStatus | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(null));
    socket.on('error', () => finish(null));

    socket.on('connect', () => {
      const handshake = Buffer.concat([
        varInt(0x00),
        varInt(-1), // Protokollversion: -1 = „nur Status abfragen“
        varInt(Buffer.byteLength(host)),
        Buffer.from(host, 'utf8'),
        (() => {
          const b = Buffer.alloc(2);
          b.writeUInt16BE(port);
          return b;
        })(),
        varInt(1), // nächster Zustand: Status
      ]);
      socket.write(Buffer.concat([varInt(handshake.length), handshake]));
      socket.write(Buffer.concat([varInt(1), varInt(0x00)]));
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const packet = readPacket(buffer);
      if (!packet) return;
      try {
        const json = JSON.parse(packet) as {
          version?: { name?: string };
          players?: { online?: number; max?: number; sample?: { name: string }[] };
        };
        finish({
          versionName: json.version?.name ?? 'unbekannt',
          players: json.players?.online ?? 0,
          maxPlayers: json.players?.max ?? 0,
          sample: (json.players?.sample ?? []).map((p) => p.name),
          pingMs: Date.now() - started,
        });
      } catch {
        finish(null);
      }
    });
  });
}

/** Liest Paketlänge, Paket-ID und die JSON-Zeichenkette, sobald vollständig. */
function readPacket(buffer: Buffer): string | null {
  const length = readVarInt(buffer, 0);
  if (!length) return null;
  if (buffer.length < length.offset + length.value) return null;

  const id = readVarInt(buffer, length.offset);
  if (!id || id.value !== 0x00) return null;

  const strLen = readVarInt(buffer, id.offset);
  if (!strLen) return null;
  if (buffer.length < strLen.offset + strLen.value) return null;

  return buffer.subarray(strLen.offset, strLen.offset + strLen.value).toString('utf8');
}

function varInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  if (value < 0) v = (value + 2 ** 32) >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, start: number): { value: number; offset: number } | null {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < buffer.length) {
    const byte = buffer[offset];
    if (byte === undefined) return null;
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
    if (shift > 35) return null;
  }
  return null;
}

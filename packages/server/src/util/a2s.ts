import { createSocket } from 'node:dgram';

export interface A2sInfo {
  name: string;
  map: string;
  players: number;
  maxPlayers: number;
  /** Rundlaufzeit der Abfrage in Millisekunden. */
  pingMs: number;
}

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO = Buffer.concat([HEADER, Buffer.from('TSource Engine Query\0', 'latin1')]);

/**
 * Steam-Abfrage A2S_INFO. Valheim beantwortet sie auf dem Query-Port und
 * liefert damit Spielerzahl und Rundlaufzeit — Spielernamen enthält die
 * Antwort nicht, die stammen aus dem Log.
 *
 * Seit 2020 fordern Steam-Server erst eine Challenge an (Antworttyp `A`); die
 * Abfrage wird dann mit angehängter Challenge wiederholt.
 */
export async function queryA2sInfo(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<A2sInfo | null> {
  const socket = createSocket('udp4');
  const started = Date.now();

  try {
    return await new Promise<A2sInfo | null>((resolve) => {
      let settled = false;
      let challengeTried = false;

      const finish = (value: A2sInfo | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), timeoutMs);
      timer.unref?.();

      socket.on('error', () => finish(null));
      socket.on('message', (msg) => {
        const type = msg[4];
        if (type === 0x41 && !challengeTried) {
          challengeTried = true;
          socket.send(Buffer.concat([A2S_INFO, msg.subarray(5, 9)]), port, host, (err) => {
            if (err) finish(null);
          });
          return;
        }
        if (type !== 0x49) return finish(null);
        try {
          finish({ ...parseInfo(msg), pingMs: Date.now() - started });
        } catch {
          finish(null);
        }
      });

      socket.send(A2S_INFO, port, host, (err) => {
        if (err) finish(null);
      });
    });
  } finally {
    socket.close();
  }
}

function parseInfo(msg: Buffer): Omit<A2sInfo, 'pingMs'> {
  // 4 Byte Header, 1 Byte Typ, 1 Byte Protokollversion.
  let offset = 6;
  const read = (): string => {
    const end = msg.indexOf(0, offset);
    const value = msg.subarray(offset, end === -1 ? undefined : end).toString('utf8');
    offset = (end === -1 ? msg.length : end) + 1;
    return value;
  };
  const name = read();
  const map = read();
  read(); // Ordner
  read(); // Spiel
  offset += 2; // App-ID
  const players = msg[offset] ?? 0;
  const maxPlayers = msg[offset + 1] ?? 0;
  return { name, map, players, maxPlayers };
}

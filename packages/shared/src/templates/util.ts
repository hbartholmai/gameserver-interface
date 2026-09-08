import type { LogLevel } from '../schema/common.js';

/**
 * Stuft eine rohe Logzeile anhand von Schlüsselwörtern ein. Die drei Spiele
 * schreiben unterschiedliche Formate, aber alle markieren Warnungen und Fehler
 * mit einem dieser Wörter.
 */
export function levelFromKeywords(line: string): LogLevel {
  if (/\b(ERROR|SEVERE|FATAL|Exception|Traceback)\b/i.test(line)) return 'ERROR';
  if (/\bWARN(ING)?\b/i.test(line)) return 'WARN';
  return 'INFO';
}

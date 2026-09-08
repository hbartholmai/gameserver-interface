import type { ReactNode } from 'react';
import { STATUS_COLOR, type InstanceStatus } from '@gsp/shared';

export function SektionsLabel({ text, rechts }: { text: string; rechts?: ReactNode }) {
  return (
    <div className="sektionslabel">
      <span>// {text}</span>
      {rechts !== undefined && <span>{rechts}</span>}
    </div>
  );
}

export function StatusChip({ status }: { status: InstanceStatus }) {
  return (
    <span className="status-chip" style={{ color: STATUS_COLOR[status] }}>
      {status}
    </span>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={className ? `panel ${className}` : 'panel'}>{children}</section>;
}

export function Leerzustand({ text }: { text: string }) {
  return <p className="leerzustand">// {text}</p>;
}

/**
 * Sparkline nach Vorgabe des Designs: feste Koordinaten 0–100, Skalierung über
 * `preserveAspectRatio="none"`, Strichstärke unabhängig davon konstant.
 */
export function Sparkline({
  werte,
  hoehe = 40,
  gefuellt = true,
  farbe = 'var(--akzent)',
  maximum,
}: {
  werte: number[];
  hoehe?: number;
  gefuellt?: boolean;
  farbe?: string;
  maximum?: number;
}) {
  const viewHeight = gefuellt ? 30 : 24;
  if (werte.length === 0) return <div style={{ height: hoehe }} />;

  const max = Math.max(maximum ?? 0, ...werte, 1);
  const schritt = werte.length > 1 ? 100 / (werte.length - 1) : 100;
  const punkte = werte.map((wert, index) => {
    const x = index * schritt;
    const y = viewHeight - (Math.max(0, wert) / max) * viewHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 100 ${viewHeight}`}
      preserveAspectRatio="none"
      height={hoehe}
      width="100%"
      aria-hidden="true"
      style={{ display: 'block', marginTop: 'var(--s-3)' }}
    >
      {gefuellt && (
        <polygon
          points={`0,${viewHeight} ${punkte.join(' ')} 100,${viewHeight}`}
          fill="rgba(62,224,143,0.10)"
        />
      )}
      <polyline
        points={punkte.join(' ')}
        fill="none"
        stroke={farbe}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Balken({ anteil, farbe = 'var(--akzent)' }: { anteil: number; farbe?: string }) {
  const breite = Math.max(0, Math.min(100, anteil));
  return (
    <div className="balken">
      <span style={{ width: `${breite}%`, background: farbe }} />
    </div>
  );
}

export function KvListe({ eintraege }: { eintraege: [string, string][] }) {
  return (
    <div className="kv-liste">
      {eintraege.map(([schluessel, wert]) => (
        <div className="kv-zeile" key={schluessel}>
          <span className="kv-zeile__schluessel">{schluessel}</span>
          <span className="kv-zeile__wert">{wert}</span>
        </div>
      ))}
    </div>
  );
}

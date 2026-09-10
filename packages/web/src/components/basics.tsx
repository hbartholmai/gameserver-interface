import type { ReactNode } from 'react';
import { STATUS_COLOR, type InstanceStatus } from '@gsp/shared';

export function SectionLabel({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <div className="sectionlabel">
      <span>// {text}</span>
      {right !== undefined && <span>{right}</span>}
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

export function Empty({ text }: { text: string }) {
  return <p className="empty">// {text}</p>;
}

/**
 * Sparkline nach Vorgabe des Designs: feste Koordinaten 0–100, Skalierung über
 * `preserveAspectRatio="none"`, Strichstärke unabhängig davon konstant.
 */
export function Sparkline({
  values,
  height = 40,
  filled = true,
  farbe = 'var(--akzent)',
  maximum,
}: {
  values: number[];
  height?: number;
  filled?: boolean;
  farbe?: string;
  maximum?: number;
}) {
  const viewHeight = filled ? 30 : 24;
  if (values.length === 0) return <div style={{ height: height }} />;

  const max = Math.max(maximum ?? 0, ...values, 1);
  const schritt = values.length > 1 ? 100 / (values.length - 1) : 100;
  const punkte = values.map((value, index) => {
    const x = index * schritt;
    const y = viewHeight - (Math.max(0, value) / max) * viewHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 100 ${viewHeight}`}
      preserveAspectRatio="none"
      height={height}
      width="100%"
      aria-hidden="true"
      style={{ display: 'block', marginTop: 'var(--s-3)' }}
    >
      {filled && (
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

export function Bar({ ratio, farbe = 'var(--akzent)' }: { ratio: number; farbe?: string }) {
  const breite = Math.max(0, Math.min(100, ratio));
  return (
    <div className="bar">
      <span style={{ width: `${breite}%`, background: farbe }} />
    </div>
  );
}

export function KvList({ entries }: { entries: [string, string][] }) {
  return (
    <div className="kv-list">
      {entries.map(([key, value]) => (
        <div className="kv-row" key={key}>
          <span className="kv-row__key">{key}</span>
          <span className="kv-row__value">{value}</span>
        </div>
      ))}
    </div>
  );
}

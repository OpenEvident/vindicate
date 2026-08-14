interface HealthRingProps {
  score: number;
  size?: number;
  stroke?: number;
}

function colorForScore(score: number): string {
  if (score >= 85) return "var(--ord-emerald)";
  if (score >= 70) return "var(--ord-amber)";
  return "var(--ord-red)";
}

export function HealthRing({ score, size = 132, stroke = 9 }: HealthRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(score, 100));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="color-mix(in oklab, var(--vs-border) 70%, transparent)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colorForScore(clamped)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

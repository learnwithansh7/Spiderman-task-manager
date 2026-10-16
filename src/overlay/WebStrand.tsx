import React, { useMemo } from 'react';

interface WebStrandProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  swayAngleDeg: number;
  timeSec: number;
  isDescending?: boolean;
}

/**
 * WebStrand renders a thick, chaotic, multi-fiber spider-web cord.
 * As requested: "for wave use line but thik line and uorganised manner add tomany lines"
 * - A heavy, thick primary web bundle with micro-flutter
 * - Multiple tangled secondary filament strands crisscrossing and spiraling
 * - Scattered web fibrils connecting and wrapping around the main cord
 */
export const WebStrand: React.FC<WebStrandProps> = ({
  startX,
  startY,
  endX,
  endY,
  swayAngleDeg,
  timeSec,
  isDescending = false,
}) => {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 2) return null;

  // Normal vector perpendicular to the main thread line
  const nx = -dy / length;
  const ny = dx / length;

  // Static pseudorandom seed offsets for chaotic fibers so they stay consistent across frames
  const chaoticFibres = useMemo(() => {
    return [
      // { offset: normal offset px, freq: wave frequency, speed: wave speed, amp: amplitude factor, phase: phase offset, width: stroke width, opacity: alpha }
      // Core thick bundle
      { offset: 0, freq: 2.2, speed: 6.0, amp: 1.0, phase: 0.0, width: 3.8, opacity: 0.95 },
      { offset: -2.0, freq: 3.1, speed: 7.2, amp: 1.2, phase: 1.2, width: 2.5, opacity: 0.85 },
      { offset: 2.2, freq: 2.7, speed: 5.5, amp: 1.1, phase: 2.4, width: 2.8, opacity: 0.85 },

      // Tangled disorganized wavy strands
      { offset: -4.5, freq: 4.5, speed: 9.0, amp: 1.8, phase: 0.8, width: 1.8, opacity: 0.75 },
      { offset: 4.8, freq: 4.0, speed: 8.5, amp: 1.7, phase: 3.1, width: 1.9, opacity: 0.75 },
      { offset: -7.0, freq: 5.2, speed: 10.0, amp: 2.3, phase: 4.5, width: 1.4, opacity: 0.65 },
      { offset: 6.5, freq: 5.8, speed: 11.0, amp: 2.2, phase: 1.7, width: 1.4, opacity: 0.65 },

      // Wild outer stray fibers spiraling outwards
      { offset: -9.5, freq: 6.5, speed: 12.0, amp: 3.0, phase: 2.8, width: 1.0, opacity: 0.5 },
      { offset: 9.0, freq: 7.0, speed: 13.0, amp: 2.8, phase: 5.0, width: 1.0, opacity: 0.5 },
      { offset: -12.0, freq: 8.0, speed: 14.5, amp: 3.5, phase: 3.6, width: 0.8, opacity: 0.4 },
      { offset: 11.5, freq: 8.5, speed: 15.0, amp: 3.4, phase: 0.5, width: 0.8, opacity: 0.4 },
    ];
  }, []);

  const segments = Math.max(16, Math.min(48, Math.floor(length / 10)));
  const baseSwayAmp = Math.min(12, Math.max(2, Math.abs(swayAngleDeg) * 0.9 + (isDescending ? 4 : 1)));

  // Build SVG path for each disorganized fiber
  const fibrePaths = chaoticFibres.map((fibre) => {
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i <= segments; i++) {
      const s = i / segments; // 0 to 1
      const baseX = startX + dx * s;
      const baseY = startY + dy * s;

      // Pin ends at anchor and feet
      const envelope = Math.sin(s * Math.PI);

      // Disorganized chaotic wave calculation
      const wave = Math.sin(s * Math.PI * fibre.freq - timeSec * fibre.speed + fibre.phase);
      const microWave = Math.sin(s * Math.PI * (fibre.freq * 2.3) + timeSec * (fibre.speed * 1.6)) * 0.4;
      const disp = (fibre.offset + (wave + microWave) * baseSwayAmp * fibre.amp) * envelope;

      points.push({
        x: baseX + nx * disp,
        y: baseY + ny * disp,
      });
    }

    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const pPrev = points[i - 1];
      const pCurr = points[i];
      const midX = ((pPrev.x + pCurr.x) / 2).toFixed(1);
      const midY = ((pPrev.y + pCurr.y) / 2).toFixed(1);
      d += ` Q ${pPrev.x.toFixed(1)} ${pPrev.y.toFixed(1)}, ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

    return {
      d,
      width: fibre.width,
      opacity: fibre.opacity,
    };
  });

  // Cross-filament ties / micro-web rings between fibers
  const crossStruts: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const strutSteps = Math.floor(length / 35);
  for (let step = 1; step < strutSteps; step++) {
    const s = step / strutSteps;
    const baseX = startX + dx * s;
    const baseY = startY + dy * s;
    const envelope = Math.sin(s * Math.PI);
    const strutAmp = 8 * envelope;

    crossStruts.push({
      x1: baseX + nx * (-strutAmp + Math.sin(s * 17) * 2),
      y1: baseY + ny * (-strutAmp + Math.sin(s * 17) * 2),
      x2: baseX + nx * (strutAmp + Math.cos(s * 23) * 2),
      y2: baseY + ny * (strutAmp + Math.cos(s * 23) * 2),
    });
  }

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <defs>
        {/* Depth shadow ensures chaotic web fibers pop against light and dark backgrounds */}
        <filter id="web-depth" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0, 0, 0, 0.65)" />
        </filter>
        {/* Soft glowing ambient halo for thick web cord */}
        <filter id="web-thick-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.0" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#web-depth)">
        {/* Cross-linking disorganized web ties */}
        {crossStruts.map((strut, idx) => (
          <line
            key={`cross-${idx}`}
            x1={strut.x1.toFixed(1)}
            y1={strut.y1.toFixed(1)}
            x2={strut.x2.toFixed(1)}
            y2={strut.y2.toFixed(1)}
            stroke="rgba(240, 248, 255, 0.65)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ))}

        {/* Render all chaotic disordered strands */}
        {fibrePaths.map((fibre, idx) => (
          <path
            key={`fibre-${idx}`}
            d={fibre.d}
            fill="none"
            stroke={`rgba(245, 250, 255, ${fibre.opacity})`}
            strokeWidth={fibre.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={idx < 3 ? 'url(#web-thick-glow)' : undefined}
          />
        ))}
      </g>
    </svg>
  );
};

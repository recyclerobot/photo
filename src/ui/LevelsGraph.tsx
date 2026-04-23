import { useCallback, useRef } from 'react';

export interface LevelsParams {
  inputBlack: number;
  inputWhite: number;
  gamma: number;
  outputBlack: number;
  outputWhite: number;
}

interface Props {
  params: LevelsParams;
  onChange: (patch: Partial<LevelsParams>) => void;
}

const SIZE = 180;
const PAD = 10;
const PLOT = SIZE - PAD * 2;

/** Apply Levels transfer function to a 0..1 input. */
function applyLevels(c: number, p: LevelsParams): number {
  const span = Math.max(1e-4, p.inputWhite - p.inputBlack);
  let t = (c - p.inputBlack) / span;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const g = Math.max(0.01, p.gamma);
  // AdjustmentFilter: pow(color, 1/uGamma) — replicate so the graph matches the filter.
  t = Math.pow(t, 1 / g);
  return p.outputBlack + t * (p.outputWhite - p.outputBlack);
}

type Handle = 'inBlack' | 'inWhite' | 'gamma' | 'outBlack' | 'outWhite';

export function LevelsGraph({ params, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<Handle | null>(null);

  // Build curve polyline.
  const pts: string[] = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    const y = applyLevels(x, params);
    const px = PAD + x * PLOT;
    const py = PAD + (1 - y) * PLOT;
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }

  const toLocal = useCallback((evt: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = SIZE / rect.width;
    const sy = SIZE / rect.height;
    return {
      x: (evt.clientX - rect.left) * sx,
      y: (evt.clientY - rect.top) * sy,
    };
  }, []);

  const updateFromPointer = useCallback(
    (evt: React.PointerEvent<SVGSVGElement>) => {
      const handle = dragRef.current;
      if (!handle) return;
      const { x, y } = toLocal(evt);
      const nx = Math.min(1, Math.max(0, (x - PAD) / PLOT));
      const ny = Math.min(1, Math.max(0, 1 - (y - PAD) / PLOT));
      switch (handle) {
        case 'inBlack':
          onChange({ inputBlack: Math.min(nx, params.inputWhite - 0.01) });
          break;
        case 'inWhite':
          onChange({ inputWhite: Math.max(nx, params.inputBlack + 0.01) });
          break;
        case 'outBlack':
          onChange({ outputBlack: ny });
          break;
        case 'outWhite':
          onChange({ outputWhite: ny });
          break;
        case 'gamma': {
          // Solve gamma so curve passes through (nx, ny):
          //   ny = oB + ((nx - iB)/(iW - iB))^(1/g) * (oW - oB)
          const span = Math.max(1e-4, params.inputWhite - params.inputBlack);
          const tx = (nx - params.inputBlack) / span;
          const oSpan = params.outputWhite - params.outputBlack;
          if (tx <= 0 || tx >= 1 || Math.abs(oSpan) < 1e-4) return;
          const ty = (ny - params.outputBlack) / oSpan;
          if (ty <= 0 || ty >= 1) return;
          // ty = tx^(1/g) → 1/g = log(ty)/log(tx) → g = log(tx)/log(ty)
          const g = Math.log(tx) / Math.log(ty);
          if (Number.isFinite(g) && g > 0.01 && g < 10) {
            onChange({ gamma: g });
          }
          break;
        }
      }
    },
    [
      onChange,
      params.inputBlack,
      params.inputWhite,
      params.outputBlack,
      params.outputWhite,
      toLocal,
    ],
  );

  const onPointerDown = (handle: Handle) => (evt: React.PointerEvent<SVGSVGElement>) => {
    evt.stopPropagation();
    dragRef.current = handle;
    (evt.target as Element).setPointerCapture?.(evt.pointerId);
  };

  const onPointerMove = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    updateFromPointer(evt);
  };

  const onPointerUp = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      (evt.target as Element).releasePointerCapture?.(evt.pointerId);
      dragRef.current = null;
    }
  };

  // Handle positions.
  const ibX = PAD + params.inputBlack * PLOT;
  const iwX = PAD + params.inputWhite * PLOT;
  const obY = PAD + (1 - params.outputBlack) * PLOT;
  const owY = PAD + (1 - params.outputWhite) * PLOT;
  // Gamma handle: midpoint of input range, evaluate curve.
  const gMidX = (params.inputBlack + params.inputWhite) / 2;
  const gMidY = applyLevels(gMidX, params);
  const gx = PAD + gMidX * PLOT;
  const gy = PAD + (1 - gMidY) * PLOT;

  return (
    <div className="my-1 flex justify-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[180px] w-[180px] touch-none select-none rounded border border-black/40 bg-zinc-900"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} stroke="#3f3f46" strokeWidth={0.5}>
            <line x1={PAD + g * PLOT} y1={PAD} x2={PAD + g * PLOT} y2={PAD + PLOT} />
            <line x1={PAD} y1={PAD + g * PLOT} x2={PAD + PLOT} y2={PAD + g * PLOT} />
          </g>
        ))}
        {/* Frame */}
        <rect
          x={PAD}
          y={PAD}
          width={PLOT}
          height={PLOT}
          fill="none"
          stroke="#52525b"
          strokeWidth={1}
        />
        {/* Identity reference */}
        <line
          x1={PAD}
          y1={PAD + PLOT}
          x2={PAD + PLOT}
          y2={PAD}
          stroke="#52525b"
          strokeDasharray="2 2"
          strokeWidth={0.75}
        />
        {/* Curve */}
        <polyline points={pts.join(' ')} fill="none" stroke="#60a5fa" strokeWidth={1.5} />

        {/* Input handles on bottom edge */}
        <line
          x1={PAD}
          y1={PAD + PLOT + 4}
          x2={PAD + PLOT}
          y2={PAD + PLOT + 4}
          stroke="#27272a"
          strokeWidth={2}
        />
        <Triangle
          x={ibX}
          y={PAD + PLOT + 4}
          color="#000"
          stroke="#a1a1aa"
          dir="up"
          onPointerDown={onPointerDown('inBlack')}
        />
        <Triangle
          x={iwX}
          y={PAD + PLOT + 4}
          color="#fff"
          stroke="#a1a1aa"
          dir="up"
          onPointerDown={onPointerDown('inWhite')}
        />

        {/* Output handles on left edge */}
        <line x1={PAD - 4} y1={PAD} x2={PAD - 4} y2={PAD + PLOT} stroke="#27272a" strokeWidth={2} />
        <Triangle
          x={PAD - 4}
          y={obY}
          color="#000"
          stroke="#a1a1aa"
          dir="right"
          onPointerDown={onPointerDown('outBlack')}
        />
        <Triangle
          x={PAD - 4}
          y={owY}
          color="#fff"
          stroke="#a1a1aa"
          dir="right"
          onPointerDown={onPointerDown('outWhite')}
        />

        {/* Gamma handle on curve */}
        <circle
          cx={gx}
          cy={gy}
          r={5}
          fill="#fbbf24"
          stroke="#18181b"
          strokeWidth={1}
          style={{ cursor: 'grab' }}
          onPointerDown={onPointerDown('gamma') as any}
        />
      </svg>
    </div>
  );
}

function Triangle({
  x,
  y,
  color,
  stroke,
  dir,
  onPointerDown,
}: {
  x: number;
  y: number;
  color: string;
  stroke: string;
  dir: 'up' | 'right';
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const s = 5;
  const points =
    dir === 'up'
      ? `${x - s},${y + s} ${x + s},${y + s} ${x},${y}`
      : `${x - s},${y - s} ${x - s},${y + s} ${x},${y}`;
  return (
    <polygon
      points={points}
      fill={color}
      stroke={stroke}
      strokeWidth={0.75}
      style={{ cursor: dir === 'up' ? 'ew-resize' : 'ns-resize' }}
      onPointerDown={onPointerDown as any}
    />
  );
}

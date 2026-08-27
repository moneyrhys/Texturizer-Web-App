import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * Knob — SVG rotary control. Vertical drag to change. Shift = fine. Double click = reset.
 *
 * Props:
 *  value        current value (number)
 *  min, max     range
 *  defaultValue value used on double-click reset
 *  step         optional (finer control has step*0.1 with shift)
 *  onChange     (nextValue) => void
 *  label        upper label
 *  format       function(value) -> string for readout
 *  size         px
 *  accent       hex color for arc
 *  testId
 */
export default function Knob({
  value,
  min = 0,
  max = 1,
  defaultValue = 0,
  step = 0.01,
  onChange,
  label,
  format = (v) => v.toFixed(2),
  size = 92,
  accent = "#f0863a",
  testId,
}) {
  const dragRef = useRef({ dragging: false, startY: 0, startVal: 0, shift: false });
  const [hover, setHover] = useState(false);

  const clamp = (v) => Math.max(min, Math.min(max, v));
  const norm = (value - min) / (max - min);

  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      dragging: true,
      startY: e.clientY,
      startVal: value,
      shift: e.shiftKey,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dy = d.startY - e.clientY;
    const range = max - min;
    const sensitivity = (e.shiftKey || d.shift ? 0.001 : 0.005) * range;
    let next = d.startVal + dy * sensitivity;
    next = clamp(next);
    // snap to step for tidy values (only when not shift)
    if (!(e.shiftKey || d.shift) && step > 0) {
      next = Math.round(next / step) * step;
    }
    onChange?.(next);
  };
  const onPointerUp = (e) => {
    dragRef.current.dragging = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onDoubleClick = () => onChange?.(defaultValue);
  const onWheel = (e) => {
    e.preventDefault();
    const range = max - min;
    const delta = (e.deltaY > 0 ? -1 : 1) * (e.shiftKey ? 0.002 : 0.02) * range;
    let next = clamp(value + delta);
    if (!e.shiftKey && step > 0) next = Math.round(next / step) * step;
    onChange?.(next);
  };

  // SVG arc geometry
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const startA = Math.PI * 0.75;                // bottom-left
  const endA   = Math.PI * 2.25;                // bottom-right
  const angle  = startA + norm * (endA - startA);

  const arcPath = describeArc(cx, cy, r, startA, angle);
  const trackPath = describeArc(cx, cy, r, startA, endA);

  // indicator line
  const indR1 = r * 0.35;
  const indR2 = r * 0.82;
  const ix1 = cx + Math.cos(angle) * indR1;
  const iy1 = cy + Math.sin(angle) * indR1;
  const ix2 = cx + Math.cos(angle) * indR2;
  const iy2 = cy + Math.sin(angle) * indR2;

  return (
    <div className="flex flex-col items-center select-none" data-testid={testId}>
      <div
        className="font-label text-[10px] mb-2"
        style={{ color: hover ? accent : "var(--text-dim)", transition: "color 120ms" }}
      >
        {label}
      </div>
      <svg
        className="knob-shell"
        width={size}
        height={size}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        <defs>
          <radialGradient id={`kg-${label}`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2a2a34" />
            <stop offset="60%" stopColor="#1a1a20" />
            <stop offset="100%" stopColor="#0a0a0e" />
          </radialGradient>
          <linearGradient id={`kb-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3a44" />
            <stop offset="100%" stopColor="#0f0f13" />
          </linearGradient>
        </defs>

        {/* outer bezel */}
        <circle cx={cx} cy={cy} r={r + 6} fill={`url(#kb-${label})`} />
        <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="#05050a" strokeWidth="1" />

        {/* track */}
        <path d={trackPath} stroke="#0a0a10" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* value arc */}
        <path
          d={arcPath}
          stroke={accent}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}
        />

        {/* tick marks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const t = i / 10;
          const a = startA + t * (endA - startA);
          const rr1 = r + 8;
          const rr2 = r + 12;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * rr1}
              y1={cy + Math.sin(a) * rr1}
              x2={cx + Math.cos(a) * rr2}
              y2={cy + Math.sin(a) * rr2}
              stroke={t <= norm ? accent : "#3a3a44"}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={t <= norm ? 0.9 : 0.5}
            />
          );
        })}

        {/* knob body */}
        <circle cx={cx} cy={cy} r={r - 6} fill={`url(#kg-${label})`} stroke="#05050a" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r - 6} fill="none" stroke="#3a3a44" strokeOpacity="0.4" strokeWidth="1" />

        {/* indicator */}
        <line
          x1={ix1} y1={iy1} x2={ix2} y2={iy2}
          stroke={accent} strokeWidth="3" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${accent})` }}
        />
        {/* center screw */}
        <circle cx={cx} cy={cy} r="3" fill="#0a0a0e" stroke="#3a3a44" strokeWidth="0.5" />
      </svg>
      <div
        className="readout font-mono text-[11px] px-2 py-1 rounded mt-2 min-w-[56px] text-center"
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {format(value)}
      </div>
    </div>
  );
}

function describeArc(cx, cy, r, startA, endA) {
  const x1 = cx + Math.cos(startA) * r;
  const y1 = cy + Math.sin(startA) * r;
  const x2 = cx + Math.cos(endA) * r;
  const y2 = cy + Math.sin(endA) * r;
  const large = endA - startA > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * WaveformDisplay
 *  - Renders AudioBuffer as canvas peaks (min/max per pixel column)
 *  - Draggable loop start / end handles
 *  - Live playhead (fed by getReadPos() polled via RAF)
 *
 * Props:
 *  buffer          AudioBuffer | null
 *  loopStart       seconds
 *  loopEnd         seconds
 *  onLoopChange    (start, end) => void
 *  getReadPos      () => seconds (live cursor)
 *  isPlaying       bool (drives cursor animation)
 *  accent, ledColor
 */
export default function WaveformDisplay({
  buffer,
  loopStart,
  loopEnd,
  onLoopChange,
  onScrub,
  getReadPos,
  isPlaying,
  accent = "#f0863a",
  ledColor = "#6ee7b7",
}) {
  const wrapRef = useRef(null);
  const bgCanvasRef = useRef(null);     // peaks (rendered once per buffer)
  const cursorCanvasRef = useRef(null); // playhead (rendered per frame)
  const [wrapW, setWrapW] = useState(0);
  const dragRef = useRef({ mode: null, startX: 0, startS: 0, startE: 0 });

  const duration = buffer ? buffer.duration : 0;

  // observe container width for responsive canvas
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setWrapW(Math.floor(w));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // downsampled peaks: memoised per buffer + width
  const peaks = useMemo(() => {
    if (!buffer || wrapW < 20) return null;
    const w = wrapW;
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
    const step = Math.floor(ch0.length / w);
    const out = new Float32Array(w * 2); // min, max pairs
    for (let x = 0; x < w; x++) {
      let mn = 1, mx = -1;
      const start = x * step;
      const end = Math.min(ch0.length, start + step);
      for (let i = start; i < end; i++) {
        const v = (ch0[i] + ch1[i]) * 0.5;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      out[x * 2] = mn;
      out[x * 2 + 1] = mx;
    }
    return out;
  }, [buffer, wrapW]);

  // draw static peaks
  useEffect(() => {
    const cv = bgCanvasRef.current;
    if (!cv || wrapW === 0) return;
    const H = 120;
    const dpr = window.devicePixelRatio || 1;
    cv.width = wrapW * dpr;
    cv.height = H * dpr;
    cv.style.width = wrapW + "px";
    cv.style.height = H + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, wrapW, H);

    // center line
    g.fillStyle = "#20202a";
    g.fillRect(0, H / 2 - 0.5, wrapW, 1);

    if (!peaks || !buffer) {
      g.fillStyle = "#3a3a44";
      g.font = "10px 'Barlow Condensed'";
      g.textAlign = "center";
      g.fillText("NO SOURCE LOADED", wrapW / 2, H / 2 + 4);
      return;
    }

    // waveform (out-of-loop dim, in-loop bright)
    const px2sec = duration / wrapW;
    for (let x = 0; x < wrapW; x++) {
      const mn = peaks[x * 2];
      const mx = peaks[x * 2 + 1];
      const y1 = H / 2 - mx * (H / 2 - 4);
      const y2 = H / 2 - mn * (H / 2 - 4);
      const t = x * px2sec;
      const inLoop = t >= loopStart && t <= loopEnd;
      g.fillStyle = inLoop ? "#5a4b3a" : "#2a2a34";
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    // loop region highlight (bright orange overlay strokes at top/bottom)
    const xs = (loopStart / duration) * wrapW;
    const xe = (loopEnd / duration) * wrapW;
    g.fillStyle = accent + "18";
    g.fillRect(xs, 0, xe - xs, H);
    g.fillStyle = accent;
    for (let x = Math.floor(xs); x < xe; x++) {
      const mn = peaks[x * 2];
      const mx = peaks[x * 2 + 1];
      const y1 = H / 2 - mx * (H / 2 - 4);
      const y2 = H / 2 - mn * (H / 2 - 4);
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    // handles
    g.fillStyle = accent;
    g.fillRect(xs - 1, 0, 2, H);
    g.fillRect(xe - 1, 0, 2, H);
    // handle grips
    g.fillStyle = "#ffffff";
    g.fillRect(xs - 4, H / 2 - 8, 8, 16);
    g.fillRect(xe - 4, H / 2 - 8, 8, 16);
    g.fillStyle = accent;
    g.fillRect(xs - 3, H / 2 - 7, 6, 14);
    g.fillRect(xe - 3, H / 2 - 7, 6, 14);
  }, [peaks, wrapW, buffer, duration, loopStart, loopEnd, accent]);

  // playhead animation
  useEffect(() => {
    const cv = cursorCanvasRef.current;
    if (!cv) return;
    const H = 120;
    const dpr = window.devicePixelRatio || 1;
    cv.width = wrapW * dpr;
    cv.height = H * dpr;
    cv.style.width = wrapW + "px";
    cv.style.height = H + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf;
    const draw = () => {
      g.clearRect(0, 0, wrapW, H);
      if (buffer && duration > 0 && getReadPos) {
        const pos = getReadPos();
        const x = (pos / duration) * wrapW;
        g.fillStyle = ledColor;
        g.globalAlpha = 0.9;
        g.fillRect(x - 0.5, 0, 1.5, H);
        g.globalAlpha = 0.35;
        g.fillRect(x - 2, 0, 4, H);
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [wrapW, buffer, duration, getReadPos, ledColor, isPlaying]);

  // interaction: pick handle if close, otherwise create a new loop by drag
  const posFromEvent = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return (x / rect.width) * duration;
  };

  const onPointerDown = (e) => {
    if (!buffer) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const t = posFromEvent(e);
    const px2sec = duration / wrapW;
    const grabPx = 8;
    const near = (a, b) => Math.abs(a - b) / px2sec < grabPx;
    let mode;
    if (near(t, loopStart)) mode = "start";
    else if (near(t, loopEnd)) mode = "end";
    else mode = "scrub";                // provisional — becomes "select" if user drags far enough
    dragRef.current = {
      mode, startX: t, startS: loopStart, startE: loopEnd,
      pointerStartX: e.clientX, dragged: false,
    };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.mode || !buffer) return;
    const t = posFromEvent(e);
    const px2sec = duration / wrapW;
    if (d.mode === "start") {
      onLoopChange?.(Math.min(t, loopEnd - 0.05), loopEnd);
    } else if (d.mode === "end") {
      onLoopChange?.(loopStart, Math.max(t, loopStart + 0.05));
    } else if (d.mode === "scrub" || d.mode === "select") {
      const movedPx = Math.abs(e.clientX - d.pointerStartX);
      // if user drags more than 4 px, upgrade to a loop-selection
      if (d.mode === "scrub" && movedPx > 4) {
        d.mode = "select";
      }
      if (d.mode === "select") {
        d.dragged = true;
        const s = Math.min(d.startX, t);
        const en = Math.max(d.startX, t);
        onLoopChange?.(s, Math.max(s + 0.05, en));
      }
    }
    void px2sec;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    // pure click inside waveform (no meaningful drag) => scrub playhead
    if (d.mode === "scrub" && !d.dragged) {
      onScrub?.(d.startX);
    }
    dragRef.current.mode = null;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="font-label text-[10px]" style={{ color: "var(--text-dim)" }}>WAVEFORM · CLICK TO SCRUB · DRAG TO LOOP</div>
        <div className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }} data-testid="loop-readout">
          {duration > 0
            ? `${loopStart.toFixed(2)}s → ${loopEnd.toFixed(2)}s  |  ${(loopEnd - loopStart).toFixed(2)}s`
            : "—"}
        </div>
      </div>
      <div
        ref={wrapRef}
        className="bezel-inset relative"
        style={{ height: 120, cursor: buffer ? "ew-resize" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="waveform-strip"
      >
        <canvas ref={bgCanvasRef} style={{ position: "absolute", inset: 0 }} />
        <canvas ref={cursorCanvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      </div>
    </div>
  );
}

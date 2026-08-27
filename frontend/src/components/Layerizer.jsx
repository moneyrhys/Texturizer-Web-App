import React, { useCallback, useEffect, useRef, useState } from "react";
import Knob from "./Knob";
import { GranularEngine } from "../audio/GranularEngine";

const ACCENT = "#f0863a";
const LED_GREEN = "#6ee7b7";

export default function Layerizer() {
  const engineRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragHot, setDragHot] = useState(false);
  const [level, setLevel] = useState(0);
  const [loadError, setLoadError] = useState("");

  const [params, setParams] = useState({
    pitch: 0,
    grainSize: 120,
    stretch: 0.3,
    storm: 0.0,
    mix: 0.65,
    octave: false,
    autopan: 0.0,
    reverb: 0.25,
    stereo: 1.0,
  });

  // create engine lazily on first user gesture
  const ensureEngine = useCallback(async () => {
    if (!engineRef.current) engineRef.current = new GranularEngine();
    await engineRef.current.init();
    return engineRef.current;
  }, []);

  const setParam = (name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
    engineRef.current?.setParam(name, value);
  };

  const handleFiles = async (fileList) => {
    setLoadError("");
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(file.name)) {
      setLoadError("Please upload an audio file (wav, mp3, ogg, flac, m4a, aac).");
      return;
    }
    try {
      const engine = await ensureEngine();
      // push current params into engine before load
      Object.entries(params).forEach(([k, v]) => engine.setParam(k, v));
      const buf = await engine.loadFile(file);
      setFileName(file.name);
      setDuration(buf.duration);
      setReady(true);
    } catch (e) {
      console.error(e);
      setLoadError("Could not decode this file. Try a different format.");
    }
  };

  const onPlayToggle = async () => {
    if (!ready) return;
    const engine = engineRef.current;
    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
    } else {
      await engine.play();
      setIsPlaying(true);
    }
  };

  // Level meter poll
  useEffect(() => {
    let raf;
    const loop = () => {
      const eng = engineRef.current;
      if (eng && isPlaying) setLevel(eng.getLevel());
      else setLevel((l) => l * 0.85);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // drag/drop handlers
  const onDrop = (e) => {
    e.preventDefault();
    setDragHot(false);
    handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e) => { e.preventDefault(); setDragHot(true); };
  const onDragLeave = () => setDragHot(false);

  // keyboard: space toggles play
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" && ready) {
        e.preventDefault();
        onPlayToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------ formatters
  const fmtSemi = (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " st";
  const fmtMs = (v) => v.toFixed(0) + " ms";
  const fmtPct = (v) => (v * 100).toFixed(0) + "%";
  const fmtWidth = (v) => v.toFixed(2) + "×";

  return (
    <div className="rack min-h-screen w-full p-6 md:p-10 flex flex-col items-center" data-testid="layerizer-root">
      {/* HEADER RACK */}
      <div className="w-full max-w-[1180px] panel grain p-5 md:p-6 mb-6 relative">
        <div className="absolute left-3 top-3 flex flex-col gap-2"><div className="screw" /><div className="screw" /></div>
        <div className="absolute right-3 top-3 flex flex-col gap-2"><div className="screw" /><div className="screw" /></div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 pl-6 pr-6">
          <div>
            <div className="font-display text-[11px] text-[color:var(--text-mute)] tracking-[0.3em]">GRANULAR TEXTURE UNIT · MK1</div>
            <div className="font-display text-3xl md:text-5xl mt-2" style={{ color: "var(--text)" }}>
              LAYER<span style={{ color: ACCENT }}>I</span>ZER
            </div>
          </div>

          {/* Transport + level */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1 min-w-[220px]">
              <div className="flex items-center justify-between">
                <span className="font-label text-[10px]" style={{ color: "var(--text-dim)" }}>OUTPUT</span>
                <span className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }}>
                  {isPlaying ? "LIVE" : "IDLE"}
                </span>
              </div>
              <div className="vu-track" data-testid="output-meter">
                <div className="vu-fill" style={{ width: `${Math.min(100, level * 240)}%` }} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className={`led ${isPlaying ? "on" : ""}`} />
                <span className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }}>
                  {ready ? `${duration.toFixed(2)}s loop` : "no source"}
                </span>
              </div>
            </div>

            <button
              className={`tactile-btn px-5 py-3 rounded-md font-label text-[13px] ${isPlaying ? "armed" : ""}`}
              onClick={onPlayToggle}
              disabled={!ready}
              data-testid="play-toggle-btn"
              style={{ opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}
              aria-pressed={isPlaying}
            >
              {isPlaying ? "◼ STOP" : "▶ PLAY"}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN RACK: dropzone + knob matrix */}
      <div className="w-full max-w-[1180px] flex flex-col lg:flex-row gap-6">
        {/* SOURCE panel */}
        <div className="panel grain p-5 lg:w-[320px] flex-shrink-0 flex flex-col">
          <SectionHeader title="SOURCE" tag="INPUT" />
          <label
            className={`dropzone flex-1 flex flex-col items-center justify-center p-6 mt-3 cursor-pointer ${dragHot ? "hot" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            data-testid="file-dropzone"
          >
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              data-testid="file-input"
            />
            <div className="text-center">
              <div className="font-display text-[11px]" style={{ color: "var(--text-mute)" }}>DROP AUDIO</div>
              <div className="font-mono text-[10px] mt-1" style={{ color: "var(--text-mute)" }}>
                wav · mp3 · ogg · flac · m4a
              </div>
              <div className="mt-6">
                <div className="tactile-btn inline-block px-4 py-2 rounded font-label text-[11px]">CHOOSE FILE</div>
              </div>
              {fileName && (
                <div className="mt-6 max-w-[240px] truncate font-mono text-[11px]" style={{ color: ACCENT }} data-testid="loaded-filename">
                  ● {fileName}
                </div>
              )}
              {loadError && (
                <div className="mt-3 font-mono text-[10px]" style={{ color: "var(--danger)" }}>
                  {loadError}
                </div>
              )}
            </div>
          </label>

          <div className="mt-4 flex items-center justify-between px-1">
            <span className="font-label text-[10px]" style={{ color: "var(--text-mute)" }}>DRAG · WHEEL · DBL-CLK RESET</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }}>SHIFT = FINE</span>
          </div>
        </div>

        {/* CONTROL MATRIX */}
        <div className="panel grain p-5 flex-1">
          <div className="flex items-center justify-between">
            <SectionHeader title="TEXTURE ENGINE" tag="9 MODULES" />
            <div className="flex items-center gap-3">
              <StatusChip label="ENGINE" active={ready} />
              <StatusChip label="LIVE" active={isPlaying} amber />
            </div>
          </div>

          {/* 3 × 3 grid */}
          <div className="grid grid-cols-3 gap-6 md:gap-8 mt-6 place-items-center">
            <Knob
              label="PITCH" testId="knob-pitch"
              value={params.pitch} min={-24} max={24} step={0.1} defaultValue={0}
              onChange={(v) => setParam("pitch", v)}
              format={fmtSemi} accent={ACCENT}
            />
            <Knob
              label="GRAIN SIZE" testId="knob-grain-size"
              value={params.grainSize} min={20} max={500} step={1} defaultValue={120}
              onChange={(v) => setParam("grainSize", v)}
              format={fmtMs} accent={ACCENT}
            />
            <Knob
              label="TIME STRETCH" testId="knob-stretch"
              value={params.stretch} min={0} max={1} step={0.01} defaultValue={0.3}
              onChange={(v) => setParam("stretch", v)}
              format={fmtPct} accent={ACCENT}
            />

            <Knob
              label="STORM" testId="knob-storm"
              value={params.storm} min={0} max={1} step={0.01} defaultValue={0}
              onChange={(v) => setParam("storm", v)}
              format={fmtPct} accent="#ff5b3d"
            />
            <Knob
              label="MIX" testId="knob-mix"
              value={params.mix} min={0} max={1} step={0.01} defaultValue={0.65}
              onChange={(v) => setParam("mix", v)}
              format={fmtPct} accent={ACCENT}
            />
            {/* OCTAVE toggle in the matrix, styled like a hardware switch */}
            <OctaveSwitch value={params.octave} onChange={(v) => setParam("octave", v)} />

            <Knob
              label="AUTOPAN" testId="knob-autopan"
              value={params.autopan} min={0} max={1} step={0.01} defaultValue={0}
              onChange={(v) => setParam("autopan", v)}
              format={fmtPct} accent={ACCENT}
            />
            <Knob
              label="REVERB" testId="knob-reverb"
              value={params.reverb} min={0} max={1} step={0.01} defaultValue={0.25}
              onChange={(v) => setParam("reverb", v)}
              format={fmtPct} accent={ACCENT}
            />
            <Knob
              label="STEREO WIDTH" testId="knob-stereo"
              value={params.stereo} min={0} max={2} step={0.01} defaultValue={1}
              onChange={(v) => setParam("stereo", v)}
              format={fmtWidth} accent={ACCENT}
            />
          </div>

          {/* Footer legend */}
          <div className="mt-8 pt-4 border-t border-[color:var(--bezel)] flex flex-wrap justify-between gap-3 items-center">
            <div className="flex items-center gap-4">
              <LegendDot color={LED_GREEN} label="DRY" />
              <LegendDot color={ACCENT} label="GRAIN LAYER" />
              <LegendDot color="#ff5b3d" label="STORM MOD" />
            </div>
            <div className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }}>
              SPACE = PLAY/STOP · SR {typeof window !== "undefined" && engineRef.current?.ctx ? engineRef.current.ctx.sampleRate + "Hz" : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 font-mono text-[10px] tracking-widest" style={{ color: "var(--text-mute)" }}>
        LAYERIZER · WEB AUDIO GRANULAR PROCESSOR · PERSONAL BUILD
      </div>
    </div>
  );
}

function SectionHeader({ title, tag }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="font-display text-[13px]" style={{ color: "var(--text)" }}>{title}</div>
      <div className="font-mono text-[10px]" style={{ color: "var(--text-mute)" }}>[ {tag} ]</div>
    </div>
  );
}

function StatusChip({ label, active, amber }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bezel-inset">
      <div className={`led ${active ? "on" : ""} ${amber ? "amber" : ""}`} />
      <div className="font-label text-[9px]" style={{ color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
      />
      <span className="font-label text-[10px]" style={{ color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

function OctaveSwitch({ value, onChange }) {
  return (
    <div className="flex flex-col items-center select-none" data-testid="toggle-octave-wrap">
      <div className="font-label text-[10px] mb-2" style={{ color: value ? ACCENT : "var(--text-dim)" }}>OCTAVE</div>
      <button
        onClick={() => onChange(!value)}
        className="knob-shell"
        style={{
          width: 92, height: 92, borderRadius: 999,
          background: "radial-gradient(circle at 50% 30%, #2a2a34 0%, #14141a 60%, #08080b 100%)",
          border: "1px solid #05050a",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          cursor: "pointer",
        }}
        data-testid="toggle-octave"
        aria-pressed={value}
      >
        <div
          style={{
            width: 40, height: 40, borderRadius: 999,
            background: value
              ? `radial-gradient(circle at 40% 40%, ${ACCENT} 0%, #a8531a 70%, #5a2a0a 100%)`
              : "radial-gradient(circle at 40% 40%, #3a3a44 0%, #1a1a20 60%, #05050a 100%)",
            boxShadow: value ? `0 0 22px ${ACCENT}88, inset 0 0 6px #2a1508` : "inset 0 2px 4px #000",
            transition: "all 180ms ease-out",
            border: "1px solid #05050a",
          }}
        />
        {/* label ring */}
        <div style={{ position: "absolute", bottom: 4, fontSize: 8, letterSpacing: "0.2em" }}
             className="font-label"
             data-testid="toggle-octave-state">
          <span style={{ color: !value ? ACCENT : "var(--text-mute)" }}>0</span>
          <span style={{ color: "var(--text-mute)", margin: "0 6px" }}>·</span>
          <span style={{ color: value ? ACCENT : "var(--text-mute)" }}>+12</span>
        </div>
      </button>
      <div className="readout font-mono text-[11px] px-2 py-1 rounded mt-2 min-w-[56px] text-center">
        {value ? "+12 st" : "OFF"}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { listPresets, deletePreset, renamePreset } from "../utils/presets";

/**
 * PresetBrowser — modal listing saved presets. Load / rename / delete.
 */
export default function PresetBrowser({ open, onClose, onLoad, currentParams }) {
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (open) setItems(listPresets());
  }, [open]);

  if (!open) return null;

  const refresh = () => setItems(listPresets());

  const summarize = (p) => {
    return [
      `pitch ${p.pitch?.toFixed?.(1) ?? 0}st`,
      `grain ${Math.round(p.grainSize ?? 0)}ms`,
      `mix ${Math.round((p.mix ?? 0) * 100)}%`,
      p.octave ? "+12" : null,
    ].filter(Boolean).join(" · ");
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(3,3,7,0.75)",
        backdropFilter: "blur(6px)", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={onClose}
      data-testid="preset-browser-backdrop"
    >
      <div
        className="panel grain"
        style={{ width: "min(720px, 100%)", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="preset-browser"
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--bezel)" }}>
          <div>
            <div className="font-display text-[13px]" style={{ color: "var(--text)" }}>PRESET BROWSER</div>
            <div className="font-mono text-[10px] mt-1" style={{ color: "var(--text-mute)" }}>
              {items.length} SAVED · STORED LOCALLY
            </div>
          </div>
          <button className="tactile-btn px-3 py-2 rounded font-label text-[11px]" onClick={onClose} data-testid="preset-close-btn">
            ✕ CLOSE
          </button>
        </div>

        <div className="p-3 overflow-auto" style={{ maxHeight: "60vh" }}>
          {items.length === 0 && (
            <div className="text-center py-14 font-mono text-[11px]" style={{ color: "var(--text-mute)" }}>
              NO PRESETS YET · HIT &quot;SAVE&quot; IN THE HEADER TO STORE THE CURRENT STATE
            </div>
          )}
          {items.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-3 p-3 mb-2 rounded"
              style={{ background: "var(--panel-2)", border: "1px solid var(--bezel)" }}
              data-testid="preset-row"
            >
              <div className="flex-1 min-w-0">
                {editingId === preset.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renamePreset(preset.id, editText || "Untitled");
                        setEditingId(null);
                        refresh();
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => {
                      renamePreset(preset.id, editText || "Untitled");
                      setEditingId(null);
                      refresh();
                    }}
                    className="font-label text-[13px] bg-transparent border-b outline-none w-full"
                    style={{ color: "var(--text)", borderColor: "var(--accent)" }}
                    data-testid="preset-rename-input"
                  />
                ) : (
                  <div
                    className="font-label text-[13px] cursor-text truncate"
                    style={{ color: "var(--text)" }}
                    onDoubleClick={() => { setEditingId(preset.id); setEditText(preset.name); }}
                    title="double-click to rename"
                  >
                    {preset.name}
                  </div>
                )}
                <div className="font-mono text-[10px] mt-1 truncate" style={{ color: "var(--text-mute)" }}>
                  {summarize(preset.params)}
                </div>
              </div>
              <button
                className="tactile-btn px-3 py-2 rounded font-label text-[10px]"
                onClick={() => { onLoad(preset); onClose(); }}
                data-testid="preset-load-btn"
              >
                ↺ LOAD
              </button>
              <button
                className="tactile-btn px-3 py-2 rounded font-label text-[10px]"
                onClick={() => { deletePreset(preset.id); refresh(); }}
                style={{ color: "var(--danger)" }}
                data-testid="preset-delete-btn"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t font-mono text-[10px] flex justify-between"
             style={{ borderColor: "var(--bezel)", color: "var(--text-mute)" }}>
          <span>DOUBLE-CLICK NAME TO RENAME</span>
          <span>CURRENT: pitch {currentParams?.pitch?.toFixed?.(1) ?? 0}st · mix {Math.round((currentParams?.mix ?? 0) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

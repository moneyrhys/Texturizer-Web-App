# Layerizer — Web-based Granular Audio Processor

## Original Problem Statement
Clone the concept of jaycactus.com/layerizer as a personal, web-based real-time
granular audio processor with Pitch, Grain Size, Time Stretch, Storm (one-knob
randomness macro), Mix, Octave, Autopan, Reverb, Stereo Width — hardware-unit UI,
dark, tactile, single screen, live in-browser playback.

## Architecture
- Frontend-only React app. All DSP through **Web Audio API**.
- Graph: `AudioBufferSource (dry loop) → dryGain → master`, plus grain scheduler
  → `stormFilter → stormAmp → autopan → widener → (reverbDry + reverb) → wetGain → master`.
- Loop region respected by both dry playback and grain scheduler.
- Presets serialised as JSON in `localStorage` (`layerizer.presets.v1`).

## Files
- `frontend/src/App.js` — mount
- `frontend/src/components/Layerizer.jsx` — main UI (header, waveform, source, matrix)
- `frontend/src/components/Knob.jsx` — SVG rotary knob (drag / wheel / dbl-click / Shift = fine)
- `frontend/src/components/WaveformDisplay.jsx` — canvas peaks + loop handles + live playhead
- `frontend/src/components/PresetBrowser.jsx` — modal list, load / rename / delete
- `frontend/src/audio/GranularEngine.js` — Web Audio granular engine, loop-aware
- `frontend/src/utils/presets.js` — localStorage CRUD
- `frontend/src/index.css` — theme (dark rack, amber accent, LEDs, bezels, grain)

## What's Been Implemented (2026-01)
- File drop / picker (wav/mp3/ogg/flac/m4a/aac)
- Play / Stop (Space bar shortcut)
- 9 real-time controls: Pitch, Grain Size, Time Stretch, Storm, Mix, Octave, Autopan, Reverb, Stereo Width
- Storm macro modulates filter cutoff/Q, tremolo, grain jitter, pitch jitter, reverb send
- LED transport, output VU meter, dark hardware rack look, custom fonts
- **Waveform strip** with canvas peaks, dim/bright out-of-loop / in-loop styling
- **Loop region** with two draggable handles; loop bounds honoured by grain scheduler AND the dry `AudioBufferSourceNode` (native `loopStart` / `loopEnd`)
- **Live green playhead** driven by `engine.getReadPos()` via RAF
- **SAVE** button snapshots current knob state to localStorage (auto-named by time)
- **PRESETS** modal: load / rename (dbl-click) / delete, with summary of each preset

## Personas
- Beatmakers / producers wanting textured background layers from any melody
- Sound designers experimenting with granular processing in the browser

## Next / Backlog (P1)
- Record processed audio to WAV (offline render)
- Freeze button (captures the current grain cloud)
- Real IR reverbs (halls, plates, springs) instead of generated burst
- MIDI learn for knob mapping
- BPM sync for autopan LFO / grain rate

## Backlog (P2)
- Sidechain input for storm modulation
- Multi-band grain filtering
- Loop region preview scrub (click waveform to jump readPos)

## Known Limits
- Pitch is grain-based (no formant preservation) — extreme shifts sound "chipmunky" (intentional)
- Reverb IR is a generated exponential burst — swap for real IRs later

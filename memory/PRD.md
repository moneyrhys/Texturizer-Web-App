# Layerizer — Web-based Granular Audio Processor

## Original Problem Statement
Clone the concept of jaycactus.com/layerizer as a personal, web-based real-time
granular audio processor. User uploads an audio file, app processes it in real time
through: Pitch, Grain Size, Time Stretch, Storm (one-knob randomness/movement macro
affecting amplitude + filtering + variation), Mix, Octave, Autopan, Reverb, Stereo Width.
Interface: hardware effects unit — dark, tactile, knob-based, all controls visible on
a single screen (no tabs / menus). Playback runs live in the browser.

## Architecture
- **Frontend-only** React app running in the browser.
- All DSP through the **Web Audio API** (no backend calls).
- Audio graph:
  - Dry path: `AudioBufferSourceNode (loop) → dryGain → master`
  - Wet path: `Grain scheduler → grainBus → stormFilter (biquad LP + Q modulated) → stormAmp (tremolo) → autopan (StereoPanner LFO) → widener (M/S via splitter+merger) → { reverbDry, reverbNode (Convolver, generated IR) → reverbWet } → wetGain → master`
  - `masterOut → Analyser → destination` for output metering.

## Files
- `frontend/src/App.js` — mount point
- `frontend/src/components/Layerizer.jsx` — main UI (source panel + 3×3 control matrix + transport)
- `frontend/src/components/Knob.jsx` — SVG rotary knob (drag / wheel / dbl-click reset, Shift = fine)
- `frontend/src/audio/GranularEngine.js` — Web Audio granular engine with storm modulator
- `frontend/src/index.css` — theme (dark hardware rack, amber accent, grain, LEDs, bezels)
- `frontend/public/index.html` — font imports (Michroma, Barlow Condensed, JetBrains Mono)

## What's Been Implemented (2026-01)
- File drop / file picker (wav/mp3/ogg/flac/m4a/aac)
- Play / Stop (Space bar shortcut)
- Real-time granular processing with 9 controls:
  Pitch (±24 st), Grain Size (20–500 ms), Time Stretch (0–100%), Storm (0–100%),
  Mix (0–100%), Octave (0 / +12 st), Autopan (0–100%), Reverb (0–100%), Stereo Width (0–2×)
- Storm modulator drives filter cutoff/Q, tremolo, grain jitter, pitch jitter, reverb send
- LED transport indicator + output VU meter
- Hardware-rack look with panels, screws, bezels, grain overlay, custom fonts

## Personas
- Beatmakers / producers wanting quick textured layers from a melody
- Sound designers experimenting with granular processing in the browser

## Next / Backlog (P1)
- Waveform preview + scrubbable playhead / loop points
- Preset save & load (localStorage + JSON export)
- MIDI learn for knob mapping
- Export processed audio to WAV (offline render)
- Convolver IR library (halls, plates, springs) instead of generated IR

## Backlog (P2)
- Freeze button (captures the current grain cloud)
- LFO tempo sync (BPM input)
- Sidechain input for storm modulation

## Known Limits
- Pitch is grain-based (not formant preserving) — extreme shifts sound "chipmunky" (intentional)
- Reverb IR is a generated exponential burst — swap for real IRs later
- No offline rendering yet — recording currently needs OS-level capture

/**
 * GranularEngine — real-time granular audio processor built on Web Audio API.
 *
 * Signal graph:
 *   [Grain scheduler] → grainBus → stormFilter → autopan → widener ┐
 *                                                                   ├→ dryMix ──┐
 *                                                                   └→ reverb ──┤
 *                                                                               ├→ masterOut → destination
 *                                                                        dryPlayback ──┘
 */
export class GranularEngine {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.isPlaying = false;
    this.startedAt = 0;
    this.readPos = 0;              // seconds into source buffer
    this.nextGrainAt = 0;          // audio ctx time
    this.schedulerId = null;

    // loop region (seconds). null = whole buffer
    this.loopStart = 0;
    this.loopEnd = null;

    // params (with sensible defaults)
    this.params = {
      pitch: 0,          // semitones -24..24
      grainSize: 120,    // ms 20..500
      stretch: 0,        // 0..1 (0 = normal, 1 = frozen)
      storm: 0,          // 0..1
      mix: 0.6,          // 0 = dry, 1 = wet
      octave: false,
      autopan: 0,        // 0..1
      reverb: 0.25,      // 0..1
      stereo: 1.0,       // 0..2
    };

    // internal LFO phases
    this._stormPhase = 0;
    this._stormTarget = 0;
    this._stormCurrent = 0;
    this._panPhase = 0;
    this._filterPhase = 0;

    // metering
    this.rms = 0;
    this._analyser = null;
    this._levelBuf = null;
  }

  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });

    // --- master chain
    this.masterOut = this.ctx.createGain();
    this.masterOut.gain.value = 0.9;

    this._analyser = this.ctx.createAnalyser();
    this._analyser.fftSize = 512;
    this._levelBuf = new Float32Array(this._analyser.fftSize);

    this.masterOut.connect(this._analyser);
    this._analyser.connect(this.ctx.destination);

    // --- wet chain
    this.grainBus = this.ctx.createGain();
    this.grainBus.gain.value = 1.0;

    // storm filter (band-emphasising lowpass with mod)
    this.stormFilter = this.ctx.createBiquadFilter();
    this.stormFilter.type = "lowpass";
    this.stormFilter.frequency.value = 18000;
    this.stormFilter.Q.value = 0.7;

    // storm amp (tremolo)
    this.stormAmp = this.ctx.createGain();
    this.stormAmp.gain.value = 1.0;

    // autopan
    this.autopanNode = this.ctx.createStereoPanner();

    // stereo widener (via mid/side approximation using channel splitter + merger)
    this._buildWidener();

    // reverb
    this.reverbNode = this.ctx.createConvolver();
    this.reverbType = "hall";
    this.reverbNode.buffer = this._makeIR("hall");
    this.userIRs = {}; // { id: { name, buffer } }
    this.reverbWet = this.ctx.createGain();
    this.reverbDry = this.ctx.createGain();
    this.reverbWet.gain.value = this.params.reverb;
    this.reverbDry.gain.value = 1 - this.params.reverb;

    // wet path (post FX) sum
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = Math.sin((this.params.mix * Math.PI) / 2) * 1.2;

    // dry path (raw buffer playback)
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = Math.cos((this.params.mix * Math.PI) / 2);

    // wire wet chain: grainBus → stormFilter → stormAmp → autopan → widenerIn
    this.grainBus.connect(this.stormFilter);
    this.stormFilter.connect(this.stormAmp);
    this.stormAmp.connect(this.autopanNode);
    this.autopanNode.connect(this.widenerIn);

    // widenerOut splits into dry + reverb branches
    this.widenerOut.connect(this.reverbDry);
    this.widenerOut.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);
    this.reverbDry.connect(this.wetGain);
    this.reverbWet.connect(this.wetGain);
    this.wetGain.connect(this.masterOut);

    // dry sits waiting for its buffer source when playback starts
    this.dryGain.connect(this.masterOut);
  }

  _buildWidener() {
    // Simple width control: sum L/R (mid) and diff (side) via a Merger network
    // For an efficient JS implementation we approximate with a StereoPanner + gain on the diff
    // Using a ChannelSplitter + Merger:
    this.widenerIn = this.ctx.createGain();

    const splitter = this.ctx.createChannelSplitter(2);
    const merger = this.ctx.createChannelMerger(2);

    // mid = (L+R)/2, side = (L-R)/2. Width scales the side. Then L=M+S*w, R=M-S*w
    const invR = this.ctx.createGain(); invR.gain.value = -1;
    const midL = this.ctx.createGain(); midL.gain.value = 0.5;
    const midR = this.ctx.createGain(); midR.gain.value = 0.5;
    const sideL = this.ctx.createGain(); sideL.gain.value = 0.5;
    const sideR = this.ctx.createGain(); sideR.gain.value = 0.5;

    this.widenerIn.connect(splitter);
    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    splitter.connect(sideL, 0);
    splitter.connect(invR, 1);
    invR.connect(sideR);

    // mid → both channels equally
    const mid = this.ctx.createGain();
    midL.connect(mid);
    midR.connect(mid);
    mid.connect(merger, 0, 0);
    mid.connect(merger, 0, 1);

    // side → +width to L, -width to R
    const side = this.ctx.createGain();
    sideL.connect(side);
    sideR.connect(side);

    this.widthPos = this.ctx.createGain(); this.widthPos.gain.value = this.params.stereo;
    this.widthNeg = this.ctx.createGain(); this.widthNeg.gain.value = -this.params.stereo;
    side.connect(this.widthPos);
    side.connect(this.widthNeg);
    this.widthPos.connect(merger, 0, 0);
    this.widthNeg.connect(merger, 0, 1);

    this.widenerOut = merger;
  }

  _makeImpulseResponse(duration = 2.6, decay = 2.0) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return ir;
  }

  // Distinct-sounding IRs synthesised at runtime — no external assets needed.
  _makeIR(kind) {
    const sr = this.ctx.sampleRate;
    if (kind === "hall") {
      // long, diffuse, gentle decay
      const dur = 3.2;
      const ir = this.ctx.createBuffer(2, Math.floor(sr * dur), sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const t = i / d.length;
          // build-up + long tail
          const env = Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / (sr * 0.03)));
          d[i] = (Math.random() * 2 - 1) * env;
        }
      }
      return ir;
    }
    if (kind === "plate") {
      // bright, dense, medium decay, metallic character via HF emphasis
      const dur = 1.9;
      const ir = this.ctx.createBuffer(2, Math.floor(sr * dur), sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let prev = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / d.length;
          const env = Math.pow(1 - t, 3.4);
          // HP-flavoured white noise (dense, brighter)
          const n = Math.random() * 2 - 1;
          const hp = n - prev * 0.6;
          prev = n;
          d[i] = hp * env;
        }
      }
      return ir;
    }
    if (kind === "spring") {
      // short, wobbly, ringy: sum of decaying sines at spring modes
      const dur = 1.4;
      const ir = this.ctx.createBuffer(2, Math.floor(sr * dur), sr);
      const modes = [ [180, 1.0], [340, 0.7], [640, 0.55], [1120, 0.4] ];
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        const detune = ch === 0 ? 1 : 1.008;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          const env = Math.pow(1 - i / d.length, 2.2);
          let s = 0;
          for (const [f, a] of modes) {
            // slight FM wobble for spring character
            const wob = Math.sin(2 * Math.PI * 4.5 * t) * 0.004;
            s += Math.sin(2 * Math.PI * f * detune * (t + wob)) * a;
          }
          // sprinkle of noise
          s += (Math.random() * 2 - 1) * 0.15;
          d[i] = s * env * 0.35;
        }
      }
      return ir;
    }
    if (kind === "room") {
      // tight, small early reflections
      const dur = 0.6;
      const ir = this.ctx.createBuffer(2, Math.floor(sr * dur), sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const t = i / d.length;
          const env = Math.pow(1 - t, 5.0);
          d[i] = (Math.random() * 2 - 1) * env;
        }
        // add a few discrete taps
        [0.011, 0.023, 0.041, 0.067].forEach((td, k) => {
          const idx = Math.floor(td * sr);
          if (idx < d.length) d[idx] += (k % 2 ? -1 : 1) * (0.6 - k * 0.1);
        });
      }
      return ir;
    }
    return this._makeImpulseResponse();
  }

  setReverbType(kind) {
    if (!this.ctx || !this.reverbNode) { this.reverbType = kind; return; }
    if (kind === this.reverbType) return;
    this.reverbType = kind;
    if (this.userIRs[kind]) {
      this.reverbNode.buffer = this.userIRs[kind].buffer;
    } else {
      this.reverbNode.buffer = this._makeIR(kind);
    }
  }

  async addUserIR(file) {
    await this.init();
    const arr = await file.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(arr);
    const id = "user_" + Date.now().toString(36);
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 14);
    this.userIRs[id] = { name, buffer: buf };
    return { id, name };
  }

  setReadPos(seconds) {
    if (!this.buffer) return;
    const dur = this.buffer.duration;
    this.readPos = Math.max(0, Math.min(dur, seconds));
    // if it's outside the loop, still clamp inside on the next grain via _scheduleAhead
  }

  async loadFile(file) {
    await this.init();
    const arr = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arr);
    this.readPos = 0;
    this.loopStart = 0;
    this.loopEnd = this.buffer.duration;
    return this.buffer;
  }

  setLoop(start, end) {
    if (!this.buffer) return;
    const dur = this.buffer.duration;
    let s = Math.max(0, Math.min(dur, start));
    let e = Math.max(0, Math.min(dur, end));
    if (e - s < 0.05) e = Math.min(dur, s + 0.05);
    this.loopStart = s;
    this.loopEnd = e;
    // Reflect loop in the dry source if it's playing
    if (this._dryNode) {
      try {
        this._dryNode.loopStart = s;
        this._dryNode.loopEnd = e;
      } catch (err) { /* noop */ }
    }
    // if readPos is outside new loop, jump it in
    if (this.readPos < s || this.readPos > e) this.readPos = s;
  }

  getReadPos() {
    return this.readPos;
  }

  setParam(name, value) {
    if (name === "_autopanRateHz") { this._autopanRateHz = value; return; }
    if (name === "_stormRateHz")   { this._stormRateHz   = value; return; }
    if (!(name in this.params)) return;
    this.params[name] = value;

    if (!this.ctx) return;
    const p = this.params;

    if (name === "mix") {
      this.dryGain.gain.setTargetAtTime(Math.cos((p.mix * Math.PI) / 2), this.ctx.currentTime, 0.02);
      this.wetGain.gain.setTargetAtTime(Math.sin((p.mix * Math.PI) / 2) * 1.2, this.ctx.currentTime, 0.02);
    } else if (name === "reverb") {
      this.reverbWet.gain.setTargetAtTime(p.reverb, this.ctx.currentTime, 0.02);
      this.reverbDry.gain.setTargetAtTime(1 - p.reverb, this.ctx.currentTime, 0.02);
    } else if (name === "stereo") {
      this.widthPos.gain.setTargetAtTime(p.stereo, this.ctx.currentTime, 0.02);
      this.widthNeg.gain.setTargetAtTime(-p.stereo, this.ctx.currentTime, 0.02);
    }
  }

  async play() {
    if (!this.buffer) return;
    await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.isPlaying = true;
    this.startedAt = this.ctx.currentTime;
    this.nextGrainAt = this.ctx.currentTime + 0.02;

    // start dry playback (looping)
    this._startDry();

    // schedule loop (look-ahead)
    const tick = () => {
      if (!this.isPlaying) return;
      this._scheduleAhead();
      this._advanceStorm();
      this.schedulerId = setTimeout(tick, 20);
    };
    tick();
  }

  stop() {
    this.isPlaying = false;
    if (this.schedulerId) { clearTimeout(this.schedulerId); this.schedulerId = null; }
    if (this._dryNode) {
      try { this._dryNode.stop(); } catch (e) { /* already stopped */ }
      this._dryNode.disconnect();
      this._dryNode = null;
    }
  }

  _startDry() {
    if (this._dryNode) { try { this._dryNode.stop(); } catch(e) { /* noop */ } this._dryNode.disconnect(); }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    if (this.loopEnd != null) {
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    src.connect(this.dryGain);
    src.start(0, this.loopStart);
    this._dryNode = src;
  }

  _advanceStorm() {
    // storm LFO – slow-ish random with smoothing
    const p = this.params;
    const a = p.storm;
    const dt = 0.02;
    const stormFreq = this._stormRateHz != null ? this._stormRateHz : (0.2 + a * 4.0);
    this._stormPhase += dt * stormFreq;
    while (this._stormPhase >= 1) {
      this._stormPhase -= 1;
      this._stormTarget = Math.random() * 2 - 1;
    }
    const smooth = 1 - Math.exp(-dt / 0.06);
    this._stormCurrent += (this._stormTarget - this._stormCurrent) * smooth;
    const mod = this._stormCurrent * a;

    // apply to filter
    const baseHz = 18000;
    const minHz = 800;
    // stronger storm → lower and more wobbly cutoff
    const cutoff = baseHz * Math.pow(2, -a * 3.5 + mod * 1.6);
    const clamped = Math.max(minHz, Math.min(20000, cutoff));
    this.stormFilter.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
    this.stormFilter.Q.setTargetAtTime(0.7 + a * 3.0, this.ctx.currentTime, 0.05);

    // amp tremolo (biased so it never fully kills signal)
    const amp = 1.0 - a * 0.5 + mod * 0.35 * a;
    this.stormAmp.gain.setTargetAtTime(Math.max(0.05, amp), this.ctx.currentTime, 0.02);
  }

  _scheduleAhead() {
    if (!this.buffer) return;
    const lookahead = 0.12; // seconds ahead of playback we want scheduled
    const now = this.ctx.currentTime;

    while (this.nextGrainAt < now + lookahead) {
      this._triggerGrain(this.nextGrainAt);

      // interval between grain onsets, storm adds jitter
      const p = this.params;
      const grainSec = p.grainSize / 1000;
      const overlap = 3.5;                  // higher = denser
      const density = 1 / (grainSec / overlap);
      let interval = 1 / density;
      // storm jitter (± 40% of interval at max)
      const j = (Math.random() * 2 - 1) * p.storm * 0.4 * interval;
      interval = Math.max(0.005, interval + j);
      this.nextGrainAt += interval;

      // advance read head based on stretch (0 = normal, 1 = frozen)
      const advance = interval * (1 - p.stretch);
      this.readPos += advance;
      const lStart = this.loopStart;
      const lEnd = this.loopEnd ?? this.buffer.duration;
      const lLen = Math.max(0.05, lEnd - lStart);
      if (this.readPos >= lEnd) this.readPos = lStart + ((this.readPos - lStart) % lLen);
      if (this.readPos < lStart) this.readPos = lStart;
    }
  }

  _triggerGrain(when) {
    const p = this.params;
    if (!this.buffer) return;

    // pitch (semi) + storm jitter
    const stormJitterSemis = (Math.random() * 2 - 1) * p.storm * 4;
    let semis = p.pitch + stormJitterSemis;
    if (p.octave) semis += 12;
    const rate = Math.pow(2, semis / 12);

    // grain length in seconds
    const grainSec = Math.max(0.02, p.grainSize / 1000);

    // random offset within a small window around readPos (spread scales with storm)
    const spreadWindow = 0.05 + p.storm * 0.35; // seconds
    const offset = (Math.random() - 0.5) * spreadWindow * 2;
    const lStart = this.loopStart;
    const lEnd = this.loopEnd ?? this.buffer.duration;
    const lLen = Math.max(0.05, lEnd - lStart);
    let start = this.readPos + offset;
    // wrap inside the loop region
    start = lStart + (((start - lStart) % lLen) + lLen) % lLen;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;

    // Hann-ish envelope via AudioParam automation
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    const attackT = grainSec * 0.45;
    const holdT   = grainSec * 0.1;
    const releaseT = grainSec * 0.45;
    const peak = 0.35; // per-grain gain (many overlap)
    env.gain.exponentialRampToValueAtTime(peak, when + attackT);
    env.gain.setValueAtTime(peak, when + attackT + holdT);
    env.gain.exponentialRampToValueAtTime(0.0001, when + attackT + holdT + releaseT);

    // autopan is applied at the bus level; per-grain we add a tiny stereo spread
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * (0.35 + p.storm * 0.5);

    src.connect(env);
    env.connect(pan);
    pan.connect(this.grainBus);

    // schedule autopan LFO
    if (p.autopan > 0) {
      const rateHz = this._autopanRateHz != null ? this._autopanRateHz : (0.25 + p.autopan * 3.0);
      const now = when;
      const depth = p.autopan;
      // sample a few points for smoothness
      for (let i = 0; i < 4; i++) {
        const t = now + i * (grainSec / 4);
        const val = Math.sin(2 * Math.PI * rateHz * t) * depth;
        this.autopanNode.pan.setValueAtTime(val, t);
      }
    } else {
      this.autopanNode.pan.setTargetAtTime(0, when, 0.05);
    }

    const startInBuffer = Math.min(start, Math.max(0, this.buffer.duration - grainSec * rate - 0.001));
    const dur = Math.min(grainSec / rate + 0.02, this.buffer.duration - startInBuffer);

    try {
      src.start(when, startInBuffer, dur);
      src.stop(when + attackT + holdT + releaseT + 0.02);
    } catch (e) { /* ignore late schedule */ }

    // cleanup
    src.onended = () => {
      try { src.disconnect(); env.disconnect(); pan.disconnect(); } catch(e) { /* already gone */ }
    };
  }

  getLevel() {
    if (!this._analyser) return 0;
    this._analyser.getFloatTimeDomainData(this._levelBuf);
    let sum = 0;
    for (let i = 0; i < this._levelBuf.length; i++) {
      sum += this._levelBuf[i] * this._levelBuf[i];
    }
    const rms = Math.sqrt(sum / this._levelBuf.length);
    this.rms = this.rms * 0.7 + rms * 0.3;
    return this.rms;
  }

  // ---------------- Recording (live capture → WAV) ----------------
  startRecording() {
    if (!this.ctx || this._recNode) return;
    const bufSize = 4096;
    const numCh = 2;
    // Use ScriptProcessorNode (widely supported, simple JS capture)
    this._recNode = this.ctx.createScriptProcessor(bufSize, numCh, numCh);
    this._recChunks = [[], []];
    this._recSampleRate = this.ctx.sampleRate;
    this._recPeak = 0;
    this._recNode.onaudioprocess = (e) => {
      let peak = 0;
      for (let ch = 0; ch < numCh; ch++) {
        const src = e.inputBuffer.getChannelData(ch);
        this._recChunks[ch].push(new Float32Array(src));
        for (let i = 0; i < src.length; i++) {
          const a = Math.abs(src[i]);
          if (a > peak) peak = a;
        }
      }
      this._recPeak = Math.max(this._recPeak * 0.85, peak);
    };
    // tap the master output pre-analyser
    this.masterOut.connect(this._recNode);
    // ScriptProcessor requires a destination connection to actually pull audio
    this._recNode.connect(this.ctx.destination);
    // Silence the pass-through (we only want the tap, not double audio)
    // Trick: run through a mute gain
    // (we can't cleanly gate the SP output; but its own output is the *input* buffer, not our audio.
    //  In practice its output is empty since we don't write to outputBuffer.)
  }

  stopRecording() {
    if (!this._recNode) return null;
    const chunks = this._recChunks;
    const sr = this._recSampleRate;
    this._recPeak = 0;
    try {
      this.masterOut.disconnect(this._recNode);
      this._recNode.disconnect();
      this._recNode.onaudioprocess = null;
    } catch (e) { /* noop */ }
    this._recNode = null;
    this._recChunks = null;

    // Flatten
    const flatten = (arr) => {
      let total = 0;
      for (const c of arr) total += c.length;
      const out = new Float32Array(total);
      let o = 0;
      for (const c of arr) { out.set(c, o); o += c.length; }
      return out;
    };
    const L = flatten(chunks[0]);
    const R = flatten(chunks[1]);
    return encodeWAV([L, R], sr);
  }
  getRecordPeak() {
    return this._recPeak || 0;
  }
  // ---------------- /Recording ----------------
}

// Interleaved 16-bit PCM WAV encoder.
function encodeWAV(channels, sampleRate) {
  const numCh = channels.length;
  const numSamples = channels[0].length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);             // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

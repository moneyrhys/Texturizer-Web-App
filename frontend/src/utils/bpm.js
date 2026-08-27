// Note-division helpers for BPM sync.
// Each entry: [label, cyclesPerBeat] where 1/4 note = 1.0
export const DIVISIONS = [
  ["1/1",  0.25],
  ["1/2",  0.5],
  ["1/2T", 0.75],
  ["1/4",  1.0],
  ["1/4T", 1.5],
  ["1/8",  2.0],
  ["1/8T", 3.0],
  ["1/16", 4.0],
  ["1/16T",6.0],
  ["1/32", 8.0],
];

// map normalised knob position (0..1) to division index
export function knobToDivision(v) {
  const i = Math.min(DIVISIONS.length - 1, Math.max(0, Math.round(v * (DIVISIONS.length - 1))));
  return { index: i, label: DIVISIONS[i][0], cpb: DIVISIONS[i][1] };
}

// grain size (ms) locked to BPM
export function grainSizeFromDivision(bpm, cpb) {
  const beatMs = 60000 / bpm;
  const ms = beatMs / cpb; // shorter division → shorter grain
  return Math.min(500, Math.max(20, ms));
}

// autopan / storm rate (Hz)
export function rateHzFromDivision(bpm, cpb) {
  return (bpm / 60) * cpb;
}

// time-stretch normalised (0..1) picked from division so we get "musical" stretch amounts
export function stretchFromDivision(cpb) {
  // deeper divisions = more stretch
  // map cpb range 0.25..8 onto 0..1 (log-ish)
  const t = Math.log2(cpb / 0.25) / Math.log2(8 / 0.25);
  return Math.min(1, Math.max(0, t));
}

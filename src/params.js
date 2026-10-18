// Every number the simulation uses, with where it came from.
// Tags: R = reported publicly (2017 reveal / 15 Oct 2026 reveal coverage)
//       E = engineering estimate (derived or typical hypercar value)
//       H = hypothetical (invented for this simulator so the system can work)
// Body frame: origin at centre of mass, +X right, +Y up, -Z forward. SI units.

export const SOURCES = {
  reveal2017: 'Tesla Roadster reveal, Nov 2017',
  reveal2026: 'Roadster reveal coverage, 15 Oct 2026 (TechCrunch, Teslarati, CBS)',
  est: 'Engineering estimate',
  hyp: 'Hypothetical simulator value',
};

export const P = {
  gravity:        { v: 9.81,  unit: 'm/s²', tag: 'R', src: 'Standard gravity', edit: [1, 25] },
  massDry:        { v: 2000,  unit: 'kg',   tag: 'E', src: 'est. from "4000+ lb" (MKBHD, 2026) and 200 kWh pack', edit: [1200, 3500] },
  wheelTorque:    { v: 10000, unit: 'N·m',  tag: 'R', src: 'reveal2017: 10,000 N·m at the wheels' },
  peakPower:      { v: 1040,  unit: 'kW',   tag: 'E', src: 'est. tri-motor peak' },
  wheelRadius:    { v: 0.35,  unit: 'm',    tag: 'E', src: 'est. 20–21 in wheels' },
  wheelbase:      { v: 2.65,  unit: 'm',    tag: 'E', src: 'est. from photos' },
  track:          { v: 1.68,  unit: 'm',    tag: 'E', src: 'est. from photos' },
  tyreMu:         { v: 1.2,   unit: '—',    tag: 'E', src: 'est. track-oriented road tyre', edit: [0.2, 2] },
  cd:             { v: 0.30,  unit: '—',    tag: 'E', src: 'est. supercar drag coefficient' },
  frontalArea:    { v: 2.0,   unit: 'm²',   tag: 'E', src: 'est. 2.0 m wide × 1.2 m tall' },
  springRate:     { v: 80000, unit: 'N/m',  tag: 'E', src: 'est. 2 Hz ride frequency' },
  damping:        { v: 5500,  unit: 'N·s/m',tag: 'E', src: 'est. ~0.4 damping ratio' },
  fanForce:       { v: 2.0,   unit: 'g',    tag: 'R', src: 'reveal2026: suction "up to two Gs"', edit: [0, 3] },
  fanPower:       { v: 60,    unit: 'kW',   tag: 'H', src: 'hyp. 4 ducted fans' },
  tankVolume:     { v: 600,   unit: 'L',    tag: 'R', src: 'reveal2026: 600 L compressed-air tank' },
  tankPressure:   { v: 690,   unit: 'bar',  tag: 'E', src: '2018 claim 10,000 psi; not confirmed in 2026' },
  gasMass:        { v: 300,   unit: 'kg',   tag: 'E', src: 'derived: 0.6 m³ × ~510 kg/m³ (air at 690 bar, real-gas Z≈1.6)' },
  exhaustVel:     { v: 700,   unit: 'm/s',  tag: 'E', src: 'typical cold-gas air nozzle (Isp ≈ 70 s)' },
  regPressure:    { v: 0.2,   unit: '× full', tag: 'H', src: 'hyp. regulator: full thrust until tank < 20 % pressure' },
  thrustScale:    { v: 1.0,   unit: '×',    tag: 'H', src: 'user scale on all thrusters', edit: [0, 2] },
};

// 10 thrusters: count reported (2026), layout and forces hypothetical.
// dir = direction of the FORCE on the car (exhaust points the other way).
export const THRUSTERS = [
  { id: 'T1',  name: 'Rear boost L',  pos: [-0.2, -0.19, 2.29],  dir: [0, 0, -1], max: 22000, key: '1' },
  { id: 'T2',  name: 'Rear boost R',  pos: [ 0.2, -0.19, 2.29],  dir: [0, 0, -1], max: 22000, key: '2' },
  { id: 'T3',  name: 'Lift front L',  pos: [-0.85, -0.3, -1.75], dir: [0, 1, 0], max: 15000, key: '3' },
  { id: 'T4',  name: 'Lift front R',  pos: [ 0.85, -0.3, -1.75], dir: [0, 1, 0], max: 15000, key: '4' },
  { id: 'T5',  name: 'Lift rear L',   pos: [-0.85, -0.3,  1.95], dir: [0, 1, 0], max: 15000, key: '5' },
  { id: 'T6',  name: 'Lift rear R',   pos: [ 0.85, -0.3,  1.95], dir: [0, 1, 0], max: 15000, key: '6' },
  { id: 'T7',  name: 'Nose push L',   pos: [ 0.0,  0.0, -2.0],  dir: [-1, 0, 0], max: 4000, key: '7' },
  { id: 'T8',  name: 'Nose push R',   pos: [ 0.0,  0.0, -2.0],  dir: [ 1, 0, 0], max: 4000, key: '8' },
  { id: 'T9',  name: 'Tail push L',   pos: [ 0.0,  0.0,  2.1],  dir: [-1, 0, 0], max: 4000, key: '9' },
  { id: 'T10', name: 'Tail push R',   pos: [ 0.0,  0.0,  2.1],  dir: [ 1, 0, 0], max: 4000, key: '0' },
];

// Wheels: hardpoint (top of suspension travel) in body frame.
const hw = 1.68 / 2;
export const WHEELS = [
  { id: 'FL', pos: [-hw, 0.1, -1.2], front: true },
  { id: 'FR', pos: [ hw, 0.1, -1.2], front: true },
  { id: 'RL', pos: [-hw, 0.1,  1.45], front: false },
  { id: 'RR', pos: [ hw, 0.1,  1.45], front: false },
];
export const SUSP_REST = 0.30;   // m, suspension length at zero load
export const FRONT_TORQUE_SHARE = 0.30; // front motor vs two rear motors (est.)

// Moments of inertia about CoM, body axes (pitch X, yaw Y, roll Z). Estimates.
export const INERTIA = { x: 2600, y: 2900, z: 650 };

export const val = (k) => P[k].v;

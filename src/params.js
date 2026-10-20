// Every number the simulation uses, with where it came from.
// Tags: R = reported publicly (2017 reveal / 15 Oct 2026 reveal coverage / Tesla patent filings)
//       E = engineering estimate (derived, measured reference data, or typical hypercar value)
//       H = hypothetical (invented for this simulator so the system can work)
// Body frame: origin at centre of mass, +X right, +Y up, -Z forward. SI units unless the unit says otherwise.

export const SOURCES = {
  reveal2017: 'Tesla Roadster reveal, Nov 2017',
  reveal2026: 'Roadster reveal coverage, 15 Oct 2026 (TechCrunch, autoevolution, Edmunds)',
  patent: 'Tesla patent US 2026/0285418 A1, active rear wing (Electrek, 25 Sep 2026)',
  nist: 'NIST Chemistry WebBook, nitrogen isotherm at 293.15 K',
  pacejka: 'H. B. Pacejka, Tyre and Vehicle Dynamics (typical dry road-tyre shape factors)',
  est: 'Engineering estimate',
  hyp: 'Hypothetical simulator value',
};

export const P = {
  // world + body
  gravity:      { v: 9.81,  unit: 'm/s²', tag: 'R', src: 'Standard gravity', edit: [1, 25] },
  massDry:      { v: 1850,  unit: 'kg',   tag: 'E', src: '"4000+ lb" (2026 reveal coverage) incl. driver; trims add hardware', edit: [1200, 3500] },
  // powertrain + battery
  wheelTorque:  { v: 10000, unit: 'N·m',  tag: 'R', src: 'reveal2017: 10,000 N·m at the wheels' },
  peakPower:    { v: 1040,  unit: 'kW',   tag: 'E', src: 'est. tri-motor peak at the wheels' },
  topSpeed:     { v: 402,   unit: 'km/h', tag: 'R', src: 'reveal2017: "over 250 mph" (2026: "over 230 mph"); electronic limiter' },
  packKWh:      { v: 200,   unit: 'kWh',  tag: 'R', src: 'reveal2017: 200 kWh battery' },
  packVolt:     { v: 800,   unit: 'V',    tag: 'E', src: 'est. 800 V class pack (open circuit, full)' },
  packRes:      { v: 0.045, unit: 'Ω',    tag: 'E', src: 'est. pack internal resistance (voltage sag under load)' },
  packPower:    { v: 1250,  unit: 'kW',   tag: 'E', src: 'est. pack discharge limit' },
  regenPower:   { v: 300,   unit: 'kW',   tag: 'E', src: 'est. regen limit' },
  regenG:       { v: 0.2,   unit: 'g',    tag: 'E', src: 'est. Tesla standard lift-off regen' },
  motorEff:     { v: 0.93,  unit: '×',    tag: 'E', src: 'est. motor + inverter efficiency' },
  // tyres + wheels
  wheelRadius:  { v: 0.335, unit: 'm',    tag: 'E', src: 'measured from reveal photos (20 in rim, 30-series tyre)' },
  wheelInertia: { v: 1.6,   unit: 'kg·m²',tag: 'E', src: 'est. wheel + tyre + disc + reflected motor rotor' },
  wheelbase:    { v: 2.93,  unit: 'm',    tag: 'E', src: 'measured from the side-profile reveal photo (scaled by tyre size)' },
  track:        { v: 1.68,  unit: 'm',    tag: 'E', src: 'measured from the rear reveal photo (scaled by the US plate)' },
  tyreMu:       { v: 1.2,   unit: '—',    tag: 'E', src: 'est. dry grip of a track-oriented road tyre at nominal load', edit: [0.2, 2] },
  tyreFz0:      { v: 4500,  unit: 'N',    tag: 'E', src: 'nominal tyre load for the grip figure' },
  tyreLoadSens: { v: 0.1,   unit: '—',    tag: 'E', src: 'pacejka: grip drops ~10 % per doubling of load' },
  relaxLong:    { v: 0.25,  unit: 'm',    tag: 'E', src: 'pacejka: longitudinal relaxation length' },
  relaxLat:     { v: 0.45,  unit: 'm',    tag: 'E', src: 'pacejka: lateral relaxation length ≈ 1.3 × wheel radius' },
  rollRes:      { v: 0.012, unit: '—',    tag: 'E', src: 'typical rolling-resistance coefficient' },
  brakeTorque:  { v: 4200,  unit: 'N·m',  tag: 'E', src: 'est. max brake torque per wheel (axle average)' },
  brakeBias:    { v: 0.62,  unit: 'front',tag: 'E', src: 'est. front brake share' },
  maxSteer:     { v: 34,    unit: '°',    tag: 'E', src: 'est. road-wheel lock (yoke, steer-by-wire)' },
  // chassis
  springRate:   { v: 80000, unit: 'N/m',  tag: 'E', src: 'est. 2 Hz ride frequency' },
  dampBump:     { v: 4200,  unit: 'N·s/m',tag: 'E', src: 'est. ~0.3 damping ratio in bump' },
  dampRebound:  { v: 7000,  unit: 'N·s/m',tag: 'E', src: 'est. ~0.5 damping ratio in rebound' },
  arbFront:     { v: 55000, unit: 'N/m',  tag: 'E', src: 'est. front anti-roll bar (front-biased roll stiffness → stable)' },
  arbRear:      { v: 25000, unit: 'N/m',  tag: 'E', src: 'est. rear anti-roll bar' },
  // aero
  cd:           { v: 0.28,  unit: '—',    tag: 'E', src: 'est. wedge hypercar, wing stowed' },
  frontalArea:  { v: 1.95,  unit: 'm²',   tag: 'E', src: 'est. 2.0 m wide × 1.19 m tall, measured from photos' },
  bodyClA:      { v: 0.25,  unit: 'm²',   tag: 'E', src: 'est. underbody downforce (diffuser)' },
  groundEffect: { v: 0.4,   unit: '×',    tag: 'E', src: 'est. extra underbody downforce near the road' },
  wingClA:      { v: 1.06,  unit: 'm²',   tag: 'R', src: 'patent: "up to 700 kg of downforce at top speed" → 6.87 kN at 103 m/s' },
  // suction fans
  fanForce:     { v: 2.0,   unit: 'g',    tag: 'R', src: 'reveal2026: suction "up to two Gs" (sets the fan pressure below)', edit: [0, 3] },
  fanDP:        { v: 12,    unit: 'kPa',  tag: 'E', src: 'derived: fan pressure that gives 2 g on the sealed skirt area' },
  fanQmax:      { v: 4.2,   unit: 'm³/s', tag: 'H', src: 'hyp. free-flow capacity of the fan set' },
  skirtArea:    { v: 4.0,   unit: 'm²',   tag: 'E', src: 'est. sealed underbody area' },
  skirtPerim:   { v: 9.4,   unit: 'm',    tag: 'E', src: 'est. skirt perimeter' },
  skirtReach:   { v: 0.28,  unit: 'm',    tag: 'H', src: 'hyp. sliding skirts with 12 cm travel below the floor (like the Chaparral 2J)' },
  skirtLeak:    { v: 0.003, unit: 'm',    tag: 'H', src: 'hyp. leak gap of a sealed skirt' },
  // cold gas (Rocket / Thrust trims)
  tankVolume:   { v: 600,   unit: 'L',    tag: 'R', src: 'reveal2026: 600 L of compressed air (COPV)' },
  tankPressure: { v: 690,   unit: 'bar',  tag: 'E', src: '2018 claim of 10,000 psi; not confirmed in 2026' },
  gasMass:      { v: 297,   unit: 'kg',   tag: 'E', src: 'nist: N₂ at 69 MPa, 293 K = 495 kg/m³ × 0.6 m³ (Z = 1.6)' },
  regPressure:  { v: 250,   unit: 'bar',  tag: 'H', src: 'hyp. regulator set pressure feeding the nozzles' },
  nozzleEps:    { v: 25,    unit: '×',    tag: 'H', src: 'hyp. nozzle expansion ratio (exit/throat area)' },
  tankHA:       { v: 120,   unit: 'W/K',  tag: 'E', src: 'est. tank-wall heat transfer (slow next to the blowdown)' },
  thrustScale:  { v: 1.0,   unit: '×',    tag: 'H', src: 'user scale on all thrusters', edit: [0, 2] },
  // controller gains (same maths as a drone)
  attKp:        { v: 10,    unit: '1/s²', tag: 'H', src: 'hyp. attitude stiffness (hover / auto-level)', edit: [2, 30] },
  attKd:        { v: 5.5,   unit: '1/s',  tag: 'H', src: 'hyp. attitude damping', edit: [1, 15] },
  altKp:        { v: 1.2,   unit: '1/s',  tag: 'H', src: 'hyp. height → climb-rate gain', edit: [0.2, 4] },
  vzKp:         { v: 4,     unit: '1/s',  tag: 'H', src: 'hyp. climb-rate → acceleration gain', edit: [0.5, 10] },
  // disturbance
  windSpeed:    { v: 0,     unit: 'm/s',  tag: 'H', src: 'user wind (from the side, +X)', edit: [0, 25] },
  windGust:     { v: 0,     unit: 'm/s',  tag: 'H', src: 'user gust strength (random, ~1 s gusts)', edit: [0, 15] },
};

// Configurations from the reveal: Performance (2 seats, fans), Thrust (rear cold-gas boost), Rocket (10 thrusters, 1 seat).
export const TRIMS = {
  performance: { name: 'Performance', seats: 2, extraMass: 0,   tank: 0,   nozzles: [] },
  thrust:      { name: 'Thrust',      seats: 2, extraMass: 70,  tank: 300, nozzles: [0, 1] },
  rocket:      { name: 'Rocket',      seats: 1, extraMass: 120, tank: 600, nozzles: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
};

// 10 thrusters: count reported (2026). Total design thrust 94 kN ("over 80 kN", reported).
// Positions follow the reveal photos: 4 boost nozzles in the rear diffuser (paired into T1/T2 here),
// lift jets firing down just inboard of each wheel, small side-push nozzles in the nose and tail. Forces hypothetical.
// Body frame: origin at the centre of mass (1.53 m behind the front axle, 0.46 m up). dir = FORCE on the car.
export const THRUSTERS = [
  { id: 'T1',  name: 'Rear boost L',  pos: [-0.24, 0.03, 2.12],  dir: [0, 0, -1], max: 20000, key: '1' },
  { id: 'T2',  name: 'Rear boost R',  pos: [ 0.24, 0.03, 2.12],  dir: [0, 0, -1], max: 20000, key: '2' },
  { id: 'T3',  name: 'Lift front L',  pos: [-0.6, -0.32, -2.15], dir: [0, 1, 0], max: 12000, key: '3' },
  { id: 'T4',  name: 'Lift front R',  pos: [ 0.6, -0.32, -2.15], dir: [0, 1, 0], max: 12000, key: '4' },
  { id: 'T5',  name: 'Lift rear L',   pos: [-0.6, -0.32,  1.88], dir: [0, 1, 0], max: 12000, key: '5' },
  { id: 'T6',  name: 'Lift rear R',   pos: [ 0.6, -0.32,  1.88], dir: [0, 1, 0], max: 12000, key: '6' },
  { id: 'T7',  name: 'Nose push L',   pos: [ 0.0,  0.0, -2.3],  dir: [-1, 0, 0], max: 1500, key: '7' },
  { id: 'T8',  name: 'Nose push R',   pos: [ 0.0,  0.0, -2.3],  dir: [ 1, 0, 0], max: 1500, key: '8' },
  { id: 'T9',  name: 'Tail push L',   pos: [ 0.0,  0.0,  2.05], dir: [-1, 0, 0], max: 1500, key: '9' },
  { id: 'T10', name: 'Tail push R',   pos: [ 0.0,  0.0,  2.05], dir: [ 1, 0, 0], max: 1500, key: '0' },
];

// Wheels: hardpoint (top of suspension travel) in body frame. 48/52 front/rear static weight.
export const CG = { fromFrontAxle: 1.53, height: 0.46 };
const hw = 1.68 / 2, fz = -CG.fromFrontAxle, rz = 2.93 - CG.fromFrontAxle;
export const WHEELS = [
  { id: 'FL', pos: [-hw, 0.12, fz], front: true },
  { id: 'FR', pos: [ hw, 0.12, fz], front: true },
  { id: 'RL', pos: [-hw, 0.12, rz], front: false },
  { id: 'RR', pos: [ hw, 0.12, rz], front: false },
];
export const SUSP_REST = 0.30;   // m, suspension length at zero load

// Moments of inertia about CoM, body axes (pitch X, yaw Y, roll Z) for a 2,300 kg reference; scaled by mass.
export const INERTIA = { x: 2900, y: 3200, z: 650 }; // longer wheelbase than v3: more pitch/yaw inertia

export const val = (k) => P[k].v;

# Roadster Lab: complete guide (v4)

Roadster Lab is a browser physics simulator of the 2026 Tesla Roadster, revealed on 15 October 2026. The car is rebuilt from the reveal photos. Its tyres, motors, battery, wing, suction fans and cold-gas thrusters are modelled closely enough to recreate the reveal stunts, and to test each claim from the reveal.

All results are simulated. Nothing here was measured on a real car.

---

## Contents

1. [Open it](#1-open-it)
2. [The landing page](#2-the-landing-page)
3. [The simulator screen](#3-the-simulator-screen)
4. [Every control](#4-every-control)
5. [Trims: Performance, Thrust, Rocket](#5-trims-performance-thrust-rocket)
6. [Stunts, drop tests, test park](#6-stunts-drop-tests-test-park)
7. [Challenges](#7-challenges)
8. [Systems view](#8-systems-view)
9. [Lab: recording, controller, explorer, wind, parameters](#9-lab)
10. [Replay, photo mode, presenter tour](#10-replay-photo-mode-presenter-tour)
11. [Settings: graphics, worlds, sound](#11-settings)
12. [The car model](#12-the-car-model)
13. [How the physics works](#13-how-the-physics-works)
14. [Claims, tested](#14-claims-tested)
15. [How it was tested](#15-how-it-was-tested)
16. [What the model cannot tell you](#16-what-the-model-cannot-tell-you)
17. [Troubleshooting](#17-troubleshooting)
18. [Project files and developer notes](#18-project-files-and-developer-notes)
19. [Sources and credits](#19-sources-and-credits)

---

## 1. Open it

1. Download the repository (Code → Download ZIP) and unzip it.
2. Double-click **`RoadsterLab.html`**. Chrome or Edge work best.

No install, no server and no internet are needed. Everything (code, physics engine, textures) is inside that one file.

## 2. The landing page

The page opens on a live 3D showroom: the car turns under a spotlight, the scissor doors open and the wing deploys. The strip along the bottom shows the car's live state: tank pressure, gas on board, thrust available, mass, wing and doors.

Scroll down for:

- **Claims, tested.** Each claim from the reveal, the model's number, a plain verdict and a **Run it** button that drops you into the simulator on that test.
- **What's real and what's ours.** The three tags every number carries (see §12).
- **What the club would build next.** Four robots that use the same physics at club scale.

**Enter the simulator** starts driving.

## 3. The simulator screen

| Area | What it shows |
|---|---|
| Top bar | Trim selector, world, graphics level, frame rate, Controls, Home |
| Left rail | Drive, Stunts, Challenges, Systems, Lab, Replay, Settings. Each opens a panel next to the rail. |
| Bottom centre (cluster) | Speed, mode, gas tank and battery bars, ten thruster bars (T1 to T10), and lights: TC, ABS, ESC (amber when acting, red when switched off), HOLD, FANS, WING, AIR |
| Right (Live panel, `Tab`) | Height, acceleration, thrust, suction, downforce, tank pressure and temperature, a graph, all readings, events |
| Bottom left | The keys that matter right now |

## 4. Every control

| Key | Action |
|---|---|
| `W` `S` | Accelerate. `S` brakes while rolling forward, then reverses |
| `A` `D` | Steer |
| `Space` | Brake hard |
| `Shift` | Rear boost thrusters (Thrust and Rocket trims) |
| `H` | Hover on/off (Rocket). In hover: `W` `S` tilt, `A` `D` turn, `E` `Q` height |
| `G` | Auto-level in the air |
| `F` | Suction fans |
| `O` | Scissor doors (only when stopped) |
| `C` | Camera: chase, cockpit, side, free, top |
| `V` | Instant replay |
| `K` | Photo mode |
| `T` | Presenter tour (any key stops it) |
| `M` | Mute |
| `R` | Reset the car, gas, battery and modes (restarts a running challenge) |
| `P` | Pause |
| `Tab` | Live panel |
| `1` … `0` | Fire one thruster while held |
| `Esc` | Close panels, quit a challenge |

**Gamepad:** left stick steers, right trigger accelerates, left trigger brakes, RB boost, A hover, B fans, Y camera.

## 5. Trims: Performance, Thrust, Rocket

The reveal announced three versions. Pick one in the top bar.

| Trim | Seats | Hardware in the model | Extra mass |
|---|---|---|---|
| Performance | 2 | Motors, fans, active wing | 0 |
| Thrust | 2 | + rear boost thrusters, 300 L tank | 70 kg |
| Rocket | 1 | + all ten thrusters, 600 L tank | 120 kg |

Hover, auto-level and auto-rescue need the lift jets, so they only work on Rocket.

## 6. Stunts, drop tests, test park

**Stunts** are autopilot replays of the reveal. The autopilot presses the same controls you would, on the same physics. Any drive key takes over.

- **Reveal ramp:** up an 11 m-radius curved wall with the fans on, three seconds upside down on suction, release, flip with the lift jets, land.
- **Kickflip:** a thrust-assisted jump over five parked Teslas with a full spin.
- **Hover:** holds 3 m, climbs, spins, lands before the gas runs low.
- **0–60 mph:** fans for grip plus the rear boost.

**Drop tests** drop the Rocket from 12 to 20 m at bad angles with nobody steering. Auto-rescue turns it upright with the lift jets and brakes the fall.

**Test park:** kickers at 10°, 20° and 30°, a table-top, a quarter pipe, a step-up with a drop-off, speed bumps, a rumble strip, a wave road and a slalom.

## 7. Challenges

| Challenge | Trim | Score | Gold / silver / bronze |
|---|---|---|---|
| Precision landing | Rocket | metres from the pad centre | 0.5 / 1.5 / 3 m |
| Hover gates | Rocket | seconds through five rings | 28 / 40 / 60 s |
| Ceiling hold | Rocket | seconds upside down | 12 / 6 / 3 s |
| 0–60 mph | Thrust | seconds | 0.9 / 1.3 / 2.2 s |
| Slalom | Performance | seconds, +2 s per cone hit | 10.5 / 13 / 17 s |
| Save it yourself | Rocket, auto-rescue off | touchdown speed | 1.5 / 2.5 / 4 m/s |

Best scores are saved in this browser only.

## 8. Systems view

The body turns see-through. Flows move only while their system works:

- **Power:** battery to the three motors.
- **Gas and thrusters:** COPV tanks to the ten nozzles.
- **Suction fans:** air pulled out from under the car.

Each view has a live caption with the real numbers. Overlays show force arrows (each force at its real point), the centre of mass, and tyre contact points coloured by grip use (green, amber, red past the peak).

## 9. Lab

- **Recording:** record a run, compare it on the Live graph (red line), export CSV or JSON. Every file starts with a "simulated data" note and lists every parameter with its tag and source.
- **Flight controller step test:** a height step (3 → 6 m) or a tilt step (0 → 20°), run on a separate headless copy of the physics. It plots the response and measures rise time (10–90 %), overshoot, settling time (5 % band) and steady error. The gain sliders (attitude kp/kd, height and climb-rate gains) change the controller live. Same maths as tuning a drone.
- **Design explorer:** pick a parameter (tank pressure, regulator pressure, thrust scale, mass, tyre grip, fan strength, power, torque, drag, wing) and a result (hover time, top speed, 0–60, braking distance, cornering grip). It runs seven simulations and plots the curve.
- **Wind:** steady crosswind and random gusts. **Gust test** hovers the car at 4 m in 12 m/s gusts.
- **Parameters:** every editable number, with its tag and source. **Restore all** puts them back.

## 10. Replay, photo mode, presenter tour

- **Replay (`V`):** the last 60 seconds are always recorded. Playback cuts between trackside, low chase, orbit, drone and wheel cameras, and slows to 0.35× while the car is airborne. Scrub, change speed, or switch slow motion off.
- **Photo mode (`K`):** freezes the car and frees the camera. Depth of field (Medium graphics and up), focus, exposure, and **Save PNG**.
- **Presenter tour (`T`):** about three minutes for judges: the car, the reveal ramp, the kickflip, the gas system, the 0–60 claim, the controller step test, and Mars.

## 11. Settings

**Graphics:**

| Level | Resolution | Shadows | Anti-aliasing | Bloom | Ambient occlusion | Floor reflections |
|---|---|---|---|---|---|---|
| Low | 0.6–0.85× | contact shadow only | none | – | – | – |
| Medium | 0.8–1× | 1024 px | FXAA | half-res | – | – |
| High | 0.9–1.25× | 2048 px | SMAA | yes | half-res | – |
| Ultra | 1–2× | 4096 px | SMAA | yes | full | planar mirror (showroom, night) |

**Auto** (default) guesses a level from the GPU name, then adjusts resolution inside that level's range to hold about 55 fps. On a 2016 laptop (Intel HD 520) it picks Low.

**Worlds:** salt flat (with time of day), launch site at night, showroom, Mars. Mars also sets gravity to 3.71 m/s².

**Car:** aero wheel covers. **Units:** km/h or mph. **Sound:** volume (`M` mutes).

Sound is synthesised, not recorded. Motor whine follows motor speed, its loudness follows load. Thruster hiss follows gas flow. Tyre squeal follows slip past the grip peak. Wind follows airspeed squared.

## 12. The car model

The body was measured from the official reveal photos: side profile, top view, rear and front. The tyre and the US licence plate set the scale.

| Measurement | Value |
|---|---|
| Length × width × height | 4.52 × 2.00 × 1.19 m |
| Wheelbase | 2.93 m |
| Track | 1.68 m |
| Tyre radius | 0.335 m |
| Ground clearance | about 9 cm |

The body is a loft of measured cross-sections with knife-edge creases and slightly crowned panels. It has:

- scissor doors with a hinge at the A-pillar;
- a bronze glass canopy;
- star wheels with five split blades;
- a 4-bar active wing on swan-neck struts;
- a full-width red light bar and the "RDSTR" plate;
- four chrome boost nozzles above a finned diffuser;
- an interior.

The physics uses the same dimensions.

**Tags:**

- **R, reported:** said publicly at the 2017 or 2026 reveal, or in Tesla's wing patent.
- **E, estimate:** measured from photos or derived from reference data.
- **H, hypothetical:** our design, so the systems can run at all.

## 13. How the physics works

Rapier (a rigid-body engine) integrates the car at 120 Hz. Every force below is computed in `src/vehicle.js` and `src/physics/`. Each one is applied at its real point, so torques come out of r × F.

- **Tyres:** Pacejka Magic Formula.
  - Peak grip at about 10 % slip ratio and 7° slip angle, with load sensitivity and combined slip (friction ellipse).
  - Relaxation states make a stopped tyre act like a stiff spring, so a parked car holds on a 25° slope instead of creeping.
  - Each wheel's spin is integrated 8 times per step (960 Hz), so wheelspin and lock-up happen for real.
- **Driver aids:**
  - **Traction control and ABS** work inside the wheel sub-step as slip limiters.
  - **Stability control** compares the yaw rate with a bicycle model and brakes one wheel to correct.
  - **Vehicle hold** keeps the car stopped.
  - Switch any aid off in Drive and the car will slide when pushed.
- **Steering and suspension:** Ackermann steering, anti-roll bars, separate bump and rebound damping.
- **Powertrain:**
  - Three motors (front axle, rear left, rear right), each torque-capped then power-capped.
  - 10,000 N·m total at the wheels, about 1,040 kW.
  - A battery with voltage sag under load, regen on lift-off, and a 402 km/h limiter.
- **Aero:**
  - Drag, underbody downforce with ground effect, and crosswind side force.
  - The active wing follows Tesla's patent: flush at low speed, flat (DRS) on straights, high downforce under braking, in corners, in the air or with the fans on. It deploys in 2.5 s and makes 700 kg of downforce at top speed.
- **Suction fans:** a fan curve balanced against air leaking under the skirts. Force = pressure drop × sealed area. Sealed, they give 2 g on the Performance car. Lift the floor about 10 cm and the seal breaks.
- **Cold gas:**
  - Nitrogen in COPV tanks, at 495 kg/m³ at 690 bar (NIST data, Z = 1.6), so 600 L holds 297 kg.
  - As gas leaves, the tank cools adiabatically and its pressure falls.
  - A regulator feeds choked nozzles: thrust = C<sub>f</sub> × chamber pressure × throat area, and mass flow = thrust ÷ (C<sub>f</sub> × c*).
  - Below the regulator pressure, the nozzles over-expand and lose thrust.
  - Solenoid valves open in about 20 ms.
  - Total design thrust is 94 kN ("over 80 kN" was reported).
- **Flight controller:**
  - A PD attitude loop and a thrust mixer over the four lift jets. Attitude has priority: when a nozzle saturates, total lift drops, never the turning moment.
  - Hover holds height. Auto-rescue flips the car upright, then follows a braking profile to a soft touchdown.
- **Forces, not impulses:** Rapier applies impulses one step late, which showed up as slow creep on slopes. Every force is now added inside the step.

## 14. Claims, tested

| Claim | Model result | Verdict |
|---|---|---|
| 0–60 mph in 0.81 s | 0.83 s (Thrust trim, fans + boost) | Needs 3.4 g average. Tyres alone give 1.2 g; fans add grip, but the 10,000 N·m cap holds wheels to about 1.6 g. Only the rear thrusters close the gap. Wheels alone: 2.37 s (1.85 s with fans). |
| Over 230 mph | 323 mph power-limited | Easy on power; limited by tyres and the electronic limiter. |
| 300 miles of range | 759 mi at a steady 65 mph from 200 kWh | Fits easily, which hints the 2026 pack is smaller than the 2017 car's 200 kWh. |
| Short flights on cold gas | 5.1 s of hover on a full tank | Only about 176 of 297 kg is usable. The tank cools to about 189 K and falls below the regulator pressure. |
| Hangs upside down | sealed suction 1.64 × the Rocket's weight | Works while the skirts seal; a gap of about 10 cm breaks it. |

## 15. How it was tested

| Command | What it checks |
|---|---|
| `node test/physics-check.mjs` | Realism benchmark against real-car numbers: tyre peaks, braking 100–0 km/h (32.6 m), skidpad (1.08 g), step steer, parking on 25° slopes, 0–60 wheels-only (2.37 s), coast-down, tank fill (NIST), wing downforce and modes. `-v` prints the claims report. |
| `node test/sim-check.mjs` | Free fall, settling, thruster torque, gas use against choked-nozzle theory, and all four stunts end to end |
| `node test/rescue-check.mjs` | Auto-rescue on 96 drops. A case only counts if it is physically possible, from the lift jets' real torque and the inertia. Result: 57/57 possible rescues. |
| `node test/features-check.mjs` | Replay buffer, challenge scoring, controller step response |
| `node test/zero60.mjs` | 0–60 for every trim, with and without fans |

## 16. What the model cannot tell you

- **The car:** the body is measured from photos, not CAD. Expect a few percent error in each dimension.
- **Hardware:** thruster layout and sizes, regulator, nozzles, skirts and the controller are our design (H).
- **Tyres:** a tyre is not a formula. Real grip changes with temperature, wear and surface.
- **Gas:** heat transfer in the tank is simplified.
- **Battery:** no thermal model.
- **Bodywork:** no collision damage.

## 17. Troubleshooting

- **Blank or black screen:** use Chrome or Edge, and make sure hardware acceleration is on.
- **Slow:** Settings → Graphics → Low. Auto lowers resolution by itself.
- **No sound:** click or press a key once (browsers block audio until then). `M` toggles mute.
- **The car slides:** check the cluster lights. A red TC, ABS or ESC means that aid is off.

## 18. Project files and developer notes

| Path | What it is |
|---|---|
| `RoadsterLab.html` | The whole app in one file (built) |
| `index.html`, `src/` | Source: `main.js` app shell, `vehicle.js` + `physics/` physics, `car.js` model, `render/` worlds, effects, post-processing, presets, `replay.js`, `challenges.js`, `lab.js`, `audio.js` |
| `test/` | The checks in §15 |
| `tools/vendor.mjs` | Copies the three.js addons that `src/` imports into `vendor/addons` |
| `tools/carlab.html` | Dev only: overlays the reveal photos on the model to check the replica (needs `refs/`, not shipped) |
| `tools/shot.mjs` | Dev only: headless screenshots |
| `build.mjs` | Builds `RoadsterLab.html` by crawling imports from `src/main.js` |
| `serve.mjs` | Dev server: `node serve.mjs`, then http://localhost:8080 |

## 19. Sources and credits

- **Reveal reporting (15 Oct 2026):** TechCrunch, autoevolution, Edmunds.
- **Active wing:** Tesla patent US 2026/0285418, as reported by Electrek.
- **Nitrogen properties:** NIST Chemistry WebBook.
- **Tyre model:** Pacejka, *Tyre and Vehicle Dynamics*.
- **Libraries:** three.js r186 and Rapier 0.21.

Designed and directed by Zarif (Robotics Club). Built with Claude (AI).

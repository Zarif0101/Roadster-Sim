# Roadster Lab: complete guide

Roadster Lab is a browser physics simulator of the 2026 Tesla Roadster, revealed on 15 October 2026. It models the car's ten cold-gas thrusters, its suction fans and its drivetrain closely enough to recreate the reveal stunts, test them, and see why they work.

This guide covers everything: how to open the app, every control, every screen, every number in the model, how the physics works, how it was tested, and what it cannot tell you.

---

## Contents

1. [Open it in 30 seconds](#1-open-it-in-30-seconds)
2. [The screen, piece by piece](#2-the-screen-piece-by-piece)
3. [Every control](#3-every-control)
4. [Configurations: Performance and Rocket](#4-configurations-performance-and-rocket)
5. [Flight modes: driving, hover, auto-level, auto-rescue, autopilot](#5-flight-modes)
6. [Stunts](#6-stunts)
7. [Auto-rescue drop tests](#7-auto-rescue-drop-tests)
8. [The test park](#8-the-test-park)
9. [How it works view](#9-how-it-works-view)
10. [The Live panel, reading by reading](#10-the-live-panel-reading-by-reading)
11. [Data: recording and export](#11-data-recording-and-export)
12. [Every parameter, with its source](#12-every-parameter-with-its-source)
13. [The ten thrusters](#13-the-ten-thrusters)
14. [How the physics works](#14-how-the-physics-works)
15. [How it was tested](#15-how-it-was-tested)
16. [What the model cannot tell you](#16-what-the-model-cannot-tell-you)
17. [Troubleshooting](#17-troubleshooting)
18. [The presentation and demo script](#18-the-presentation-and-demo-script)
19. [Project files](#19-project-files)
20. [Sources and credits](#20-sources-and-credits)

---

## 1. Open it in 30 seconds

1. Download the repository (GitHub, **Code → Download ZIP**) and unzip it anywhere.
2. Double-click **`RoadsterLab.html`**.
3. It opens in your default browser. Use **Chrome or Edge**. Firefox works too, but its frame rate is lower.
4. Click **Open the simulator**, read the controls card, and click **Start driving**.

`RoadsterLab.html` is one 9.7 MB file. It contains all the code, the 3D engine (three.js), the physics engine (Rapier) and the images. It needs no install, no server and no internet.

**First thing to try:** open the **Stunts** tab on the left and press **Play** next to *Reveal ramp*.

---

## 2. The screen, piece by piece

| Where | What it is | What you do with it |
|---|---|---|
| Top left | **Brand bar**: name, the "simulation, not real-world data" label, the **Performance / Rocket** switch, **Controls** and **Home** | Switch configuration, reopen the controls card, go back to the landing page |
| Left edge | **Rail**: Drive, Stunts, How it works, Data | Each button opens a drawer. Click the same button again to close it |
| Next to the rail | **Drawer**: the panel for the tab you picked | Settings, stunt buttons, system views, recording and parameters |
| Right edge | **Live panel**: status chips, alerts, readings, air tank, thruster map, graph, all readings, events | Watch what every system is doing. **Tab** hides it, and a small speed tab stays visible |
| Bottom centre | **Hint bar** | Shows only the keys that work right now. It changes when you hover, run a stunt, or switch config |
| Top centre | **Banner** | Says what the autopilot is doing, or that a stunt has finished |
| Below the banner | **Toast** | Short messages such as "Reset", "Shadows turned off" or "Thrusters only exist on Rocket" |

The world is a grey test site:
- **Blue ring:** the hover pad, where you start.
- **Reveal ramp:** a curved ramp that ends in a ceiling section, straight ahead.
- **Kickflip lane:** to the right, with five parked Teslas.
- **0–60 strip:** to the left.
- **Test park:** nine more lanes on the far right.

---

## 3. Every control

### Keyboard

| Key | While driving | While hovering |
|---|---|---|
| **W** / ↑ | Accelerate | Tilt forward (moves forward) |
| **S** / ↓ | Brake. Once stopped, reverse | Tilt back (moves back) |
| **A** / ← | Steer left | Turn left |
| **D** / → | Steer right | Turn right |
| **Space** | Handbrake | Wheel brake |
| **Shift** | Boost: fires both rear thrusters (T1 + T2) | Boost |
| **H** | Start hovering (holds 1 m above where you are, at least 2.5 m) | Stop hovering, back to driving |
| **E** / **Q** | Not used | Raise / lower the hover height (2 m per second) |
| **G** | Auto-level on/off (keeps the car flat in the air) | Not used |
| **F** | Suction fans on/off | Fans on/off |
| **1 … 9, 0** | Fire thruster T1 … T10 while held | Same |
| **R** | Reset the car **and every system**: thrusters, fans, modes and air tank | Same |
| **C** | Camera: Chase → Side → Free → Top | Same |
| **Tab** | Show or hide the Live panel | Same |
| **P** | Pause / resume | Same |
| **Esc** | Close the controls card | Same |

Any drive key (W A S D, arrows, Space, Shift, H, G, 1–0) **takes over from the autopilot** during a stunt.

### Mouse

- **Thruster map** (Live panel): click a nozzle to lock it on. Click again to release it. **R** also releases all of them.
- **Free camera** (Drive → Camera → Free, or press C until you reach it): drag to orbit, scroll to zoom, right-drag to pan.
- **Parameter sliders** (Data tab): drag to change the value live.

---

## 4. Configurations: Performance and Rocket

Use the switch in the brand bar.

| | Performance | Rocket |
|---|---|---|
| What it is | Only systems Tesla reported: tri-motor drive, 10,000 N·m, suction fans | Performance plus **our hypothetical thruster system** |
| Thrusters | None | 10 (layout and forces are our design) |
| Air tank | None | 600 L, about 300 kg of air |
| Hover, auto-level, auto-rescue | Not available (buttons are greyed out) | Available |
| Stunts | Switch to Rocket automatically | Native |

Switching configuration resets the car.

---

## 5. Flight modes

The current mode always shows in the Live panel chips.

| Mode | How to get it | What it does |
|---|---|---|
| **Driving** | Default | Wheels only. Thrusters fire only when you press them |
| **Hover** | **H**, or Drive → Hover | The 4 lift nozzles hold a set height above the surface below. W/S tilt the car so the lift pushes it forward or back. A/D turn it with the side nozzles. E/Q change the height |
| **Auto-level** | **G**, or Drive → Auto-level | In the air, it keeps the car flat and stops it spinning, using a light lift (25 % of the car's weight) |
| **Auto-rescue** | On by default. Drive → *Auto-rescue: catch every fall* | Kicks in by itself when the car is in the air and either falling faster than 4 m/s or tipped more than about 50°. It turns the car upright first, then falls only as fast as it can still stop, and touches down at under 1 m/s. The chip turns red and reads **AUTO-RESCUE** |
| **Autopilot** | Any stunt or drop test | A script presses the controls for you. Press any drive key to take over |

**Landing in hover:** press **Q** until the target is below zero. The controller then uses the same braking profile as auto-rescue.

**Air:** a hover burns about 32 kg of air per second, so a full tank lasts about 9 s. Below 20 % tank pressure the regulator can't hold full thrust and the nozzles weaken. The hover stunt lands itself at 30 % air. The Live panel shows "empty in X s" while thrusters fire, and "≈ X s of hover" while they don't.

---

## 6. Stunts

Open **Stunts** and press **Play**. Each one resets the car, runs the autopilot, records the run (see section 11), and hands control back when it finishes.

| Stunt | What happens | Key numbers (simulated) |
|---|---|---|
| **Reveal ramp** | Drives up a curved ramp onto a ceiling section with the fans on, stops upside down, hangs for 3 s, switches the fans off, drops, rolls upright with the lift nozzles, and lands | Ramp radius 6 m, ceiling 12 m up, holds on 1 g of net suction, lands upright |
| **Kickflip** | Accelerates to 68 km/h, jumps a 15° kicker, carries half its weight on the lift nozzles, spins a full turn with the side nozzles, and clears five parked vehicles | Clears the 3.8 m Semi, spins about 365°, auto-rescue softens the landing |
| **Hover** | Rises to 3 m, climbs to 5 m, turns on the spot, then lands | Lands by itself when the tank drops to 30 % |
| **0–60 mph** | Full throttle with the fans on and both boost nozzles until 60 mph | **0.85 s** (reveal claim: 0.81 s) |

The stunt cameras are fixed side views, so you can see the whole move. Press **C** for your own camera.

---

## 7. Auto-rescue drop tests

**Stunts → Auto-rescue drop tests.** These place the car in the air over the hover pad at a bad angle and let go. Nobody steers.

| Button | Start |
|---|---|
| Level, 12 m | Flat, from rest |
| Upside down, 14 m | Rolled 180° |
| Nose-down, 16 m | Pitched 90° nose down |
| Tumbling, 20 m | Twisted 135° and spinning on all three axes |

All four land upright in the browser and in the automated tests. Watch the thruster map: the lift nozzles fire unevenly to turn the car, then all four fire together to brake.

**Physical limit.** If the car is upside down **and** close to the ground **and** already falling fast, there isn't enough time to turn over and stop. One example: 8 m up, upside down, already falling at 10 m/s, it hits in about 0.6 s. The test suite counts these cases separately (section 15). Every case that physics allows is saved.

---

## 8. The test park

**Drive → Start position → Test park**, or **Stunts → Go to test park**. Nine lanes, all driven away from the camera (north). Start at the park sign and pick a lane.

| Lane | Feature | Tests |
|---|---|---|
| 1 | **Kicker 10°**, 8 m long | Small jumps, landing suspension |
| 2 | **Kicker 20°**, 7 m long | Medium jumps, auto-level in the air |
| 3 | **Kicker 30°**, 6 m long | Big, steep jumps, auto-rescue |
| 4 | **Table-top**: 15° up, 10 m flat at 2.1 m, 15° down | Jump the gap, or drive over it |
| 5 | **Quarter pipe**, 6 m radius, up to 80° | Ride up a near-vertical wall. Try it with the fans on |
| 6 | **Step-up + drop-off**: 12° ramp to a 3.1 m platform, then a sheer drop | Drop landings, auto-rescue |
| 7 | **Speed bumps** (8 bumps, 12 cm) then a **rumble strip** | Suspension, wheel loads (watch them in All readings) |
| 8 | **Wave road**: 4 rolling humps at 9° | Suspension at speed, airtime |
| 9 | **Slalom**: 8 cones, 9 m apart | Steering and tyre grip. Watch the contact dots turn amber or red when a tyre slides |

**Good experiments:**
- Hit the 30° kicker at 80 km/h with auto-rescue off, then again with it on.
- Ride the quarter pipe with fans off, then with fans on.
- Drop gravity to 3.7 m/s² (Mars) in Data → Parameters and jump the table-top.

---

## 9. How it works view

Open **How it works**. The body turns into a see-through outline, and the systems inside appear in their real positions.

| View | Shows | Moves when |
|---|---|---|
| **Power** | Battery (blue slab), front motor, two rear motors, yellow power cables | You press W (flow speed follows the throttle) |
| **Air & thrusters** | 600 L air tank, a blue pipe to each of the 10 nozzles | That nozzle fires. Each pipe animates on its own |
| **Suction fans** | 4 fans under the rear, teal airflow | Fans are on (F) |
| **Everything** | All of the above | Each system as above |

The caption under the buttons explains the selected system in plain words, with **live numbers**: power going to the road, air flow and thrust, suction in kN and in g, and seal percentage.

**Force arrows** (same tab) draw every force the physics applies, at the exact point it acts:

| Colour | Force |
|---|---|
| Black | Gravity (at the centre of mass) |
| Green | Suspension, at each tyre contact |
| Amber | Tyre grip (drive, brake, cornering) |
| Red | Thrust, at each nozzle |
| Teal | Fan suction |
| Grey | Air drag |

Arrow length: 1 m per 8 kN, capped at 4 m.
- **Centre of mass:** a blue dot.
- **Tyre contact:** a dot per wheel. Green means grip, amber means near the limit, red means sliding.

Exterior view returns the normal car.

---

## 10. The Live panel, reading by reading

| Item | Meaning | Unit |
|---|---|---|
| Chips | Config, mode, fans, AUTO-RESCUE, AIRBORNE, UNLIMITED AIR, PAUSED, frames per second | — |
| Red alert | Appears when the controller is at its thrust limit, air is low or empty, or the car is upside down without suction | — |
| Speed | Speed of the car's centre of mass | km/h |
| Height | Distance from the bottom of the car to the surface straight below | m |
| Thrust | Total force from all thrusters right now | kN |
| Suction | Fan force pulling the car onto the surface | kN |
| Air tank | % of air left. Then kg left, tank pressure, and time left | %, kg, bar, s |
| Thruster map | Top view, nose up. A nozzle turns red and glows in proportion to its force. A blue ring means you locked it on | — |
| Graph | Last 30 s of the variable you pick. Red line = your last recorded run, for comparison | as labelled |
| All readings | Click to open: speed, acceleration (g), height, pitch/roll, yaw rate, mass including air, air left, pressure, thrust, air flow, suction, underbody seal, the 4 wheel loads, 0–60 time, controller state | as labelled |
| Events | Take-off, touchdown, auto-rescue, 0–60 time, air empty, and so on, newest first | s since reset |

---

## 11. Data: recording and export

Open **Data**.

- **● Record** starts recording. **■ Stop** ends it. Every stunt and drop test records itself automatically.
- After stopping, that run appears as the **red line** on the Live panel graph, next to the live blue line. That's how you compare two runs.
- **Export CSV** downloads the last run as a spreadsheet file. **Export JSON** downloads the same run with all metadata.
- Samples are taken 20 times a second, up to 10 minutes per run.

**CSV header lines** (start with `#`):
- The run name, date, configuration and air mode.
- **Every parameter** with its value, unit, tag and source.
- The units of every column.
- A line stating that the data is simulated.

**CSV columns:**

| Column | Meaning | Unit |
|---|---|---|
| t | Time since reset | s |
| kmh | Speed | km/h |
| accel | Acceleration | g |
| height | Height above surface | m |
| x, y, z | Position | m |
| pitch, roll | Attitude | ° |
| yawRate | Spin rate | °/s |
| mass | Mass including air | kg |
| gasKg | Air left | kg |
| pressureBar | Tank pressure | bar |
| thrustkN | Total thrust | kN |
| massFlow | Air flow out of the nozzles | kg/s |
| fankN | Fan suction | kN |
| seal | Underbody seal, 0 to 1 | — |
| contacts | Wheels touching | 0–4 |
| mode | Control mode | — |

**Parameters:** the sliders change mass, gravity, tyre grip, fan force and a thrust scale live. Changed values turn amber and say *changed*. **Restore** resets them. The fixed values are listed underneath, with their tags.

---

## 12. Every parameter, with its source

Tags: **Reported** = said publicly at the 2017 or 2026 reveal. **Estimate** = worked out from those or from similar cars. **Hypothetical** = our design, so the system can run at all.

| Parameter | Value | Unit | Tag | Editable in app | Source |
|---|---|---|---|---|---|
| gravity | 9.81 | m/s² | Reported | yes, 1 to 25 | Standard gravity |
| massDry | 2000 | kg | Estimate | yes, 1200 to 3500 | From "4000+ lb" (MKBHD, 2026) and the 200 kWh pack |
| wheelTorque | 10000 | N·m | Reported | no | 2017 reveal: 10,000 N·m at the wheels |
| peakPower | 1040 | kW | Estimate | no | Tri-motor peak |
| wheelRadius | 0.35 | m | Estimate | no | 20–21 in wheels |
| wheelbase | 2.65 | m | Estimate | no | From photos |
| track | 1.68 | m | Estimate | no | From photos |
| tyreMu | 1.2 | — | Estimate | yes, 0.2 to 2 | Track-oriented road tyre |
| cd | 0.30 | — | Estimate | no | Supercar drag coefficient |
| frontalArea | 2.0 | m² | Estimate | no | 2.0 m wide × 1.2 m tall |
| springRate | 80000 | N/m | Estimate | no | 2 Hz ride frequency |
| damping | 5500 | N·s/m | Estimate | no | ~0.4 damping ratio |
| fanForce | 2 | g | Reported | yes, 0 to 3 | 2026 reveal: suction "up to two Gs" |
| fanPower | 60 | kW | Hypothetical | no | 4 ducted fans |
| tankVolume | 600 | L | Reported | no | 2026 reveal: 600 L compressed-air tank |
| tankPressure | 690 | bar | Estimate | no | 2018 claim of 10,000 psi, not confirmed in 2026 |
| gasMass | 300 | kg | Estimate | no | 0.6 m³ × ~510 kg/m³ (air at 690 bar, real-gas Z ≈ 1.6) |
| exhaustVel | 700 | m/s | Estimate | no | Typical cold-gas air nozzle (Isp ≈ 70 s) |
| regPressure | 0.2 | × full | Hypothetical | no | Regulator: full thrust until the tank falls below 20 % pressure |
| thrustScale | 1 | × | Hypothetical | yes, 0 to 2 | User scale on all thrusters |

Other fixed values (in `src/params.js`):
- Suspension rest length: 0.30 m.
- Torque split: 30 % front, 70 % rear.
- Moments of inertia at 2,300 kg: pitch 2,600, yaw 2,900, roll 650 kg·m². They scale with mass.

---

## 13. The ten thrusters

The thruster **count** (10) is reported. Their **positions and forces are our design**. Coordinates are in metres from the centre of mass: +x right, +y up, −z forward.

| ID | Key | Name | Position x, y, z (m) | Pushes the car | Max force |
|---|---|---|---|---|---|
| T1 | 1 | Rear boost L | -0.2, -0.19, 2.29 | forward | 22 kN |
| T2 | 2 | Rear boost R | 0.2, -0.19, 2.29 | forward | 22 kN |
| T3 | 3 | Lift front L | -0.85, -0.3, -1.75 | up | 15 kN |
| T4 | 4 | Lift front R | 0.85, -0.3, -1.75 | up | 15 kN |
| T5 | 5 | Lift rear L | -0.85, -0.3, 1.95 | up | 15 kN |
| T6 | 6 | Lift rear R | 0.85, -0.3, 1.95 | up | 15 kN |
| T7 | 7 | Nose push L | 0, 0, -2 | left | 4 kN |
| T8 | 8 | Nose push R | 0, 0, -2 | right | 4 kN |
| T9 | 9 | Tail push L | 0, 0, 2.1 | left | 4 kN |
| T10 | 0 | Tail push R | 0, 0, 2.1 | right | 4 kN |

**What the layout gives the car:**
- The 4 lift nozzles give 60 kN up against about 22.6 kN of weight: a thrust-to-weight ratio of 2.65.
- Firing the left or right pair harder rolls the car. Firing the front or rear pair harder pitches it.
- T7 + T10 spin the car left. T8 + T9 spin it right.
- The two inner rear outlets in the 3D model are T1 and T2. The two outer ones are fan exhausts.

---

## 14. How the physics works

**Engine.** Rapier (rigid-body physics) moves the car as one solid body with the mass and inertia above. It handles collisions with the world. **We compute every force on the car ourselves** and apply each one as an impulse at the exact point where it acts. Off-centre forces therefore also turn the car: torque = r × F, never faked.

**Time step.** Fixed at 1/120 s. The display can run at 30 or 144 fps and the physics gives the same result. If a frame is very slow, up to 12 physics steps run per frame, then the simulation drops time rather than spiralling.

**Per step, in order:**

1. **Steering.** Up to 0.55 rad, reduced with speed: 0.55 / (1 + speed/12). Rate-limited to 2.5 rad/s.
2. **Suspension (×4).** A ray from each wheel's mount point along the car's own "down" finds the surface: ground, ramp or ceiling.
   - Force = spring × compression + damper × compression speed, along the surface normal.
   - A bump stop adds 10× the spring rate past 85 % travel.
   - With the fans on, the springs stiffen 3×, so the car keeps its ride height under 3 g of load. This adaptive suspension is our assumption.
3. **Tyres (×4).**
   - *Drive force:* throttle × min(wheel torque / radius, power / speed), split 30 % front and 70 % rear. Reverse is capped at 30 %.
   - *Braking:* up to grip × load.
   - *Cornering:* a saturating slip-angle curve, μ × load × tanh(slip / 0.08). It is capped so it can't overshoot at low speed.
   - The combined force is clamped to the **friction circle**, √(Fx² + Fy²) ≤ μ × load.
4. **Drag.** ½ ρ Cd A v², opposite the velocity, ρ = 1.225 kg/m³.
5. **Fans.** Suction = fanForce × dry mass × g, pulling the car toward the surface below its floor.
   - It needs the underbody sealed: full force under a 0.3 m gap, fading to zero at 0.8 m.
   - The fans spool up and down over about 0.3 s.
6. **Auto-rescue check** (section 5), then the **flight controller**:
   - **Attitude:** a PD controller on the angle between the car's "up" and the target "up", plus damping on spin. It is converted into a pitch and roll moment.
   - **Height:**
     - In hover, a target climb rate proportional to the height error, at most ±3 m/s, and ±1.2 m/s below 2 m.
     - Landing and rescue use a braking profile: target sink rate = √(0.64 + 2 a h), with a = 38 % of the spare lift acceleration, plus that deceleration as a feed-forward term.
   - **Allocation:** the total lift and the two moments are split across the 4 lift nozzles. If a nozzle would exceed its maximum, total lift is reduced and the turning moment is kept. *Attitude has priority.* If one would go negative, total lift is raised. When the car is tipped past about 75°, lift is switched off and only the turning moment is used.
   - **Yaw:** the side nozzle pairs track a spin-rate target.
7. **Thrusters.** Each nozzle's force = command × max force × thrust scale × availability, applied at the nozzle along its direction.
   - Availability = 1 while tank pressure ≥ 20 % of full, then falls in proportion.
   - Air used = total thrust / exhaust speed, per second.
8. **Mass.** The air's mass leaves with it. Mass and inertia update as the tank empties.

**Pressure model.** Tank pressure is proportional to the air left: isothermal, a simplification.

---

## 15. How it was tested

Three automated test files run the real physics code without a browser.

```
node test/sim-check.mjs      # core physics + all 4 stunts
node test/rescue-check.mjs   # 96 auto-rescue drops
node test/zero60.mjs         # 0-60 with wheels only, and with fans
```

**Latest results (18 Oct 2026):**

| Check | Expected | Simulated | Result |
|---|---|---|---|
| Free fall for 1 s | 4.905 m | 4.914 m | PASS (0.2 % off, from air drag) |
| Settles on 4 wheels | at rest | 0.03 m/s, 4 contacts | PASS |
| Side nozzle T9 spin, torque = r × F | −0.0241 rad/s | −0.0241 rad/s | PASS, exact |
| Air used by 1 s of full boost | 62.86 kg | 62.86 kg | PASS, exact |
| Stunt: reveal ramp | lands upright | lands upright | PASS |
| Stunt: kickflip | lands upright | spins 365°, lands upright | PASS |
| Stunt: hover | lands before air runs out | auto-lands at 30 % | PASS |
| Stunt: 0–60 | about 0.81 s claimed | 0.85 s | PASS |
| Wheels only, fans off | — | 2.31 s | (tyre grip limit) |
| Wheels only, fans on | 1.9 s (2017 claim) | 1.88 s | matches |
| Auto-rescue drops | touchdown < 4 m/s, upright | 71 of 71 physically possible cases | PASS |

**About the rescue test.**
- It drops the car 96 times: 5 heights (5 to 35 m), 8 orientations (level, rolled 45/90/135/180°, nose-down, tail-down, diagonal), 2 start speeds, plus 16 random tumbles with spin and sideways speed.
- 25 cases are physically impossible. The test decides this with a stated bound: the time to turn upright, plus the stopping distance at 80 % of the best deceleration, must fit in the height.
- 14 of those impossible cases were saved anyway.

All 4 stunts and all 4 drop tests were also run in the browser, with the same results.

These are **consistency checks**: they prove the model obeys its own physics. They are not measurements of a real car.

---

## 16. What the model cannot tell you

- **Nothing was measured on a real Roadster.** Tesla's engineering data is not public. Most inputs are estimates (section 12).
- **The thruster layout and the controller are our design.** The real car may place, size and use its thrusters differently.
- **Tyres** use a simplified grip curve, not a full tyre model (no temperature, no load sensitivity).
- **Air flow** ignores the temperature drop as the tank empties, which would reduce real thrust further.
- **Fans** are a force model, not an airflow model. The 0.3 m seal limit is our assumption.
- **The car model** is hand-built from three photos. It looks like the car, but it isn't a scan.

---

## 17. Troubleshooting

| Problem | Fix |
|---|---|
| Blank page or "Loading physics engine…" forever | Use Chrome or Edge. Make sure the whole ZIP was unzipped. Don't open the file from inside the ZIP |
| Very low frame rate | The app turns real shadows off by itself after about 3 s below 35 fps. Close other tabs. Hide the Live panel with Tab |
| Keys do nothing | Click once on the 3D view so the page has focus. Close the controls card |
| Thrusters do nothing | Switch to **Rocket** (top left). Check the air tank. Press **R** to refill |
| Car stuck upside down | Press **R** |
| Download buttons do nothing | Record a run first, or play a stunt |
| Changes to the code don't show | You're editing `src/`. Run `node build.mjs` to rebuild `RoadsterLab.html`, or serve the folder with `node serve.mjs` and open `index.html`. Hard-refresh with Ctrl+Shift+R |

---

## 18. The presentation and demo script

`Roadster_Lab_Presentation.pptx` has 16 slides with speaker notes on every slide.

| # | Slide | Section |
|---|---|---|
| 1 | Cover | The reveal and the question |
| 2 | 15 October: a Roadster hung upside down | |
| 3 | The numbers were never published | |
| 4 | Roadster Lab at a glance | How the simulator works |
| 5 | Controls and features | |
| 6 | Built by hand from three photos | |
| 7 | 120 times a second, every force is computed | |
| 8 | Every number carries a tag | |
| 9 | Tested before trusted | |
| 10 | A thruster turns kilograms of air into push | The car's systems |
| 11 | The hover controller is drone maths | |
| 12 | Suction is what holds it upside down | |
| 13 | 0 to 60 mph chart | |
| 14 | The stunts, recreated | |
| 15 | What this model cannot tell us | |
| 16 | Let's drive it | Demo |

**Live demo, about 4 minutes:**
1. Open `RoadsterLab.html` → **Open the simulator** → **Start driving**.
2. **Stunts → Reveal ramp.** Point at the Live panel: suction during the hold, thrust during the flip.
3. **How it works → Air & thrusters.** Hold **Shift**: air flows from the tank to the two rear nozzles.
4. **Stunts → Upside down, 14 m.** Nobody steers. Watch the thruster map turn it, then brake it.
5. **Data → Export CSV.** Open the file: every parameter is listed with its source.
6. Take questions. **R** resets anything.

---

## 19. Project files

| File / folder | What it is |
|---|---|
| `RoadsterLab.html` | **The app.** One self-contained file, built from the sources below |
| `Roadster_Lab_Presentation.pptx` | The slide deck |
| `GUIDE.md` | This guide |
| `README.md` | Short overview |
| `index.html` | App page (multi-file version, used for development and GitHub Pages) |
| `src/params.js` | Every number, with its tag and source |
| `src/vehicle.js` | Forces, thrusters, fans, flight controller, auto-rescue |
| `src/world.js` | Test site: ramps, lanes, test park, parked cars |
| `src/scenes.js` | Stunt autopilots |
| `src/car.js` | 3D car model and the How it works systems |
| `src/main.js` | Rendering, input, cameras, UI, recording, export |
| `vendor/` | three.js 0.186, Rapier 0.21 (physics), with their add-ons |
| `assets/` | Reveal photo used on the landing page |
| `test/` | Automated physics, stunt and rescue tests |
| `build.mjs` | Builds `RoadsterLab.html` |
| `serve.mjs` | Tiny local web server for development: `node serve.mjs`, then open http://localhost:8080 |
| `package.json` | Marks the project as ES modules and pins library versions |

---

## 20. Sources and credits

- Reveal facts from coverage of the 15 October 2026 event: TechCrunch, Teslarati, CBS News, Fox Business, Electrek, Tech-Insider. The 2017 figures are from Tesla's original Roadster reveal.
- Libraries: [three.js](https://threejs.org) (MIT licence), [Rapier](https://rapier.rs) (Apache 2.0 licence).
- Designed and directed by **Zarif** (Robotics Club). Built with **Claude** (Anthropic's AI).

All results are simulated. Nothing here is real-world measurement or a claim about what Tesla's car can do.

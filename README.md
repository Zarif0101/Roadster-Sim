# Roadster Engineering Lab

Browser physics simulator of the 2026 Tesla Roadster's thrusters and suction fans. It runs offline.

## Run (any laptop)
Download this repo (Code → Download ZIP), unzip, and double-click **`RoadsterLab.html`**. It opens in Chrome or Edge.
That one file contains everything: code, the 3D and physics libraries, and the images. No install and no internet needed.

Developers: `node build.mjs` rebuilds `RoadsterLab.html` from `src/`. `start.bat` serves the multi-file version.

## Presentation
`Roadster_Lab_Presentation.pptx` is the slide deck for the meeting.

## Demo order (about 5 min)
1. Landing page: what it is, then **Reported / Estimate / Hypothetical**, then limitations.
2. **Launch simulator.** Drive with WASD.
3. **Stunts → Reveal ramp:** climb, upside-down hold on fan suction, drop, thruster flip, landing.
4. **Data:** telemetry, live graph. The purple line is the last recorded run.
5. **Kickflip:** jump over 5 parked Teslas with a 360° spin.
6. **Hover:** auto-lands on low gas. Point out that a full tank lasts about 9 s.
7. **How it works:** power, air and fan flows. Press Shift, H or F and watch them move.
8. **Export CSV:** simulated data with every parameter and its source.
9. Home, then **What we could build**: the robotics projects.

## Check the physics
`node test/sim-check.mjs` runs free fall, ride height, thruster torque (r × F), gas use, and all 4 scenes headless.

## Files
- `src/params.js`: every number, with its tag and source
- `src/vehicle.js`: forces and the flight controller
- `src/world.js`: ramp and lanes
- `src/scenes.js`: the autopilots
- `src/car.js`: the 3D model
- `src/main.js`: the app and UI

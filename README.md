# Roadster Lab

A browser physics simulator of the 2026 Tesla Roadster. The car is rebuilt from the 15 October 2026 reveal photos. Realistic tyres, motors, battery, active wing, suction fans and nitrogen cold-gas thrusters recreate the reveal stunts and test every claim. Everything runs offline from one file.

## Run it
1. **Code → Download ZIP**, then unzip.
2. Double-click **`RoadsterLab.html`** in Chrome or Edge.

No install, no server and no internet needed.

## What's inside
- **Live showroom landing page** with a "Claims, tested" section: each reveal claim, the model's number and a one-click test.
- **Three trims** (Performance, Thrust, Rocket) and **four worlds** (salt flat with time of day, night launch site, showroom, Mars).
- **Graphics presets:** Low, Medium, High, Ultra, plus Auto. Low runs smoothly on a 2016 laptop.
- **Stunts, drop tests and a test park.**
- **Six scored challenges.**
- **Systems view** with live flows.
- **Lab:** controller step tests, a design explorer and CSV/JSON export.
- **Instant replay** with cinematic cameras, **photo mode** and a **presenter tour** (`T`).
- **Synthesised sound** and **gamepad support.**

Full documentation: **[GUIDE.md](GUIDE.md)**.

## Quick controls
| Key | What it does |
|---|---|
| W A S D | Drive |
| Shift | Boost thrusters |
| H | Hover (Rocket) |
| F | Suction fans |
| V | Instant replay |
| T | Presenter tour |
| R | Reset |
| Tab | Live panel |

## For developers
| Command | What it does |
|---|---|
| `node build.mjs` | Builds `RoadsterLab.html` from `src/` |
| `node serve.mjs` | Serves the multi-file version at http://localhost:8080 |
| `node test/physics-check.mjs` | Realism benchmark against real-car numbers |
| `node test/sim-check.mjs` | Physics checks and stunt runs |
| `node test/rescue-check.mjs` | Auto-rescue drop tests |
| `node test/features-check.mjs` | Replay, challenges and the controller |

All results are simulated. Designed and directed by Zarif (Robotics Club). Built with Claude (AI).

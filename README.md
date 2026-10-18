# Roadster Lab

A browser physics simulator of the 2026 Tesla Roadster. It covers the cold-gas thrusters, the suction fans, the reveal stunts and auto-rescue. Everything runs offline from one file.

## Run it
1. **Code → Download ZIP**, then unzip.
2. Double-click **`RoadsterLab.html`** to open it in Chrome or Edge.

No install, no server and no internet needed.

## What's in the folder
- **`RoadsterLab.html`**: the app. One file holds everything.
- **`Roadster_Lab_Presentation.pptx`**: the 16-slide deck, with speaker notes.
- **`GUIDE.md`**: the full guide. It covers every control, screen, stunt, parameter and test, and how the physics works.

## Quick controls
| Key | What it does |
|---|---|
| W A S D | Drive |
| Shift | Boost |
| H | Hover |
| F | Suction fans |
| R | Reset everything |
| C | Camera |
| Tab | Live panel |

Start with **Stunts → Reveal ramp**.

## For developers
| Command | What it does |
|---|---|
| `node build.mjs` | Rebuilds `RoadsterLab.html` from `src/` |
| `node serve.mjs` | Serves the multi-file version at http://localhost:8080 |
| `node test/sim-check.mjs` | Physics and stunt tests |
| `node test/rescue-check.mjs` | Auto-rescue drop tests |

All results are simulated. Designed and directed by Zarif (Robotics Club). Built with Claude (AI).

# AimForge

A 3D aim trainer that runs entirely in the browser. Pick a scenario, match your in-game sensitivity, and train flicking, tracking, reflexes and precision. No install and no build step: it's plain HTML, CSS and JavaScript on top of [Three.js](https://threejs.org/).

**Play it:** https://aimforge-lyart.vercel.app

## Features

- **First-person 3D room** with pointer lock and raw (unaccelerated) mouse input where the browser supports it
- **Six scenarios** covering flicking, tracking, reflexes, precision and depth
- **Game-matched sensitivity**: enter your CS2 / CS:GO / Apex, Valorant or Overwatch 2 sensitivity and DPI. The settings show cm/360 and degrees per count
- **Adjustable horizontal FOV** (60–130°) and round length (30–120 s)
- **Custom crosshair**: color, length, thickness, gap, center dot and outline, with a live preview
- **Scoring and stats**: streak multiplier, accuracy, kills/sec, average time to kill, best streak
- **Personal bests and history**: your best score and last 30 runs per scenario are saved in the browser (localStorage), with a chart of recent runs
- Synthesised sound effects (no audio files) and hit particles

## Scenarios

| Scenario | Skill | Description |
|---|---|---|
| Grid Burst | Flicking | Three targets on a 5×5 grid; every kill spawns a new one |
| Micro Flick | Precision | One small target at a time, close to the center |
| Center Return | Flicking | Alternates between a center target and a wide flick |
| Strafe Track | Tracking | A strafing target that changes direction; keep your crosshair on it (no clicking) |
| Reflex Shrink | Reflex | Targets shrink away; hit them early for more points |
| Depth Swarm | Depth | Four targets around you at different distances |

## Controls

| Input | Action |
|---|---|
| Mouse | Aim |
| Left click | Shoot |
| `Esc` | Pause (releases the mouse) |
| `R` | Restart the current scenario |

For consistent results, turn off Windows **"Enhance pointer precision"** (mouse acceleration).

## Run locally

Open `index.html` in Chrome, Edge or Firefox. That's it. An internet connection is needed the first time, because Three.js loads from a CDN.

Or serve the folder with any static server. On Windows without Python or Node, use the included script:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 5173
```

Then open http://localhost:5173.

## Project structure

```
index.html   page layout: HUD, menu, settings, pause and results screens
style.css    styling
main.js      3D scene, scenarios, input, scoring, settings and saved stats
serve.ps1    optional local static server for Windows
```

## Deploying

It's a static site, so any static host works. On Vercel, import the repository with the framework preset set to **Other**, and no build command or output directory.

## Tech

- [Three.js r149](https://threejs.org/) (WebGL rendering, raycast hit detection)
- Pointer Lock API with `unadjustedMovement` for raw input
- Web Audio API for sound

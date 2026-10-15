# SpiderReminder

A Windows desktop reminder app where a 3D animated hero hanging upside down glides down from the top edge on a web thread to remind you to drink water.

---

## Milestone Progress

| Milestone | Status | Details |
|---|---|---|
| **R0: Diagnostics & Environment** | **DONE** | Validated normal window, transparent window, tray icon, and identified `Ctrl+Alt+R` collision; added `Ctrl+Alt+Shift+R` fallback. Tag: `r0-diagnostics`. |
| **R1: Overlay Window Foundation** | **DONE** | Transparent, frameless, always-on-top, click-through overlay covering the primary display. Window remains hidden when idle; shown via `showInactive()` so focus is never stolen. Tag: `r1-overlay-foundation`. |
| **R2: Animation with Placeholder** | **DONE** | Full physics animation loop: thread growth, 4s ease-out descent, scale (0.8 to 1.0) and soft depth shadow, damped pendulum sway $A e^{-kt} \cos(\omega t)$ starting at 10°, and 1.5s ease-in climb exit. Duplicate triggers while animating are ignored. Tag: `r2-animation`. |
| **R3: Note Card and Voice** | Up Next | Note card with "REMINDER" label, Done / Snooze buttons, and Windows text-to-speech. |
| **R4: Scheduler and Settings** | Planned | Interval / fixed-time scheduler surviving PC sleep/reboot with JSON persistence. |
| **R5: Tray & Settings Window** | Planned | Dedicated React settings window and auto-start on boot. |
| **R6: The Real 3D Character** | Planned | Transparent WebM video clip (`character.webm`) with PNG fallback. |
| **R7: Polish & Reliability** | Planned | Fullscreen app detection, multi-monitor support, and crash resilience. |
| **R8: Installer & Release** | Planned | `electron-builder` Windows installer packaging. |

---

## Motion Physics & Configuration (`src/overlay/config.ts`)

All motion constants and geometry are centralized in `src/overlay/config.ts`:
- **Descent**: Moves down from top edge to 35% screen height in 4.0 seconds using an ease-out cubic curve (fast at first, then gentle deceleration).
- **Depth Effect (Coming Toward You)**: Scale smoothly enlarges from 0.8 to 1.0 as the character drops; soft shadow intensity expands from 0 to 1.
- **Damped Sway**: Pendulum motion $\theta(t) = A \cdot e^{-kt} \cdot \cos(\omega t)$ starting at 10° with decay factor $k = 0.75$ and frequency $\omega = 3.5\text{ rad/s}$, settling over ~4 seconds.
- **Exit / Retract**: Triggered by user interaction (clicking the character or exit button) or after 15 seconds of inactivity. The character climbs back up with an ease-in curve in 1.5 seconds, and the overlay window returns to its hidden idle state.
- **Duplicate Trigger Protection**: If `Ctrl+Alt+Shift+R` or the tray menu is activated while an animation is already in progress, the second trigger is ignored.

---

## How to Run Milestone R2

### 1. Development Mode
```bash
npm run dev
```
- App runs in the tray.
- Press **`Ctrl+Alt+Shift+R`** or right-click the tray icon and select **"Test reminder"**.
- The character placeholder descends from the top right on a web thread, swings gently, and climbs back up when clicking the exit button or character (or after 15 seconds).

### 2. Automated Test Verification
```bash
npm run test:r2
```

---

## Verification Artifacts (`docs/`)

- [`docs/r2-descent.png`](docs/r2-descent.png) — Character descending on thread with depth scale & soft shadow.
- [`docs/r2-sway.png`](docs/r2-sway.png) — Damped pendulum sway at full scale (1.0) with status card.
- [`docs/r2-exit.png`](docs/r2-exit.png) — Retracting back up the thread with ease-in curve.
- [`docs/r1-overlay-foundation.png`](docs/r1-overlay-foundation.png) — Milestone R1 foundation screenshot.
- [`docs/r0-diagnostic-window.png`](docs/r0-diagnostic-window.png) — Milestone R0 diagnostic results.

# SpiderReminder

A Windows desktop reminder app where a character hanging upside down glides down from the top edge on a web thread to remind you to drink water.

---

## Milestone Progress

| Milestone | Status | Details |
|---|---|---|
| **R0: Diagnostics & Environment** | **DONE** | Validated normal window, transparent window, tray icon, and identified `Ctrl+Alt+R` collision; added `Ctrl+Alt+Shift+R` fallback. Tag: `r0-diagnostics`. |
| **R1: Overlay Window Foundation** | **DONE** | Transparent, frameless, always-on-top, click-through overlay covering the primary display. Window remains hidden when idle; shown via `showInactive()` so focus is never stolen from active apps. Tag: `r1-overlay-foundation`. |
| **R2: Animation with Placeholder** | Up Next | Thread, ease-out descent, scale & shadow, damped pendulum sway, and retract exit. |
| **R3: Note Card and Voice** | Planned | Note card with "REMINDER" label, Done / Snooze buttons, and Windows text-to-speech. |
| **R4: Scheduler and Settings** | Planned | Interval / fixed-time scheduler surviving PC sleep/reboot with JSON persistence. |
| **R5: Tray & Settings Window** | Planned | Dedicated React settings window and auto-start on boot. |
| **R6: The Real 3D Character** | Planned | Transparent WebM video clip (`character.webm`) with PNG fallback. |
| **R7: Polish & Reliability** | Planned | Fullscreen app detection, multi-monitor support, and crash resilience. |
| **R8: Installer & Release** | Planned | `electron-builder` installer packaging. |

---

## How to Run Milestone R1

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```
- App sits hidden in the system tray next to the Windows clock.
- Right-click the tray icon and select **"Show test overlay shape"** (or press **`Ctrl+Alt+Shift+R`**).
- A colored card will appear in the top-right area of your screen.
- You can still click, select text, and type in whatever application you are using in the background — mouse clicks pass straight through the transparent overlay.
- Hover your mouse over the card to interact with the **"Clicks"** counter or click **"Dismiss"** to hide the overlay.

### 3. Automated Test Verification
```bash
npm run test:r1
```

---

## Verification Artifacts (`docs/`)

- [`docs/r1-overlay-foundation.png`](docs/r1-overlay-foundation.png) — Transparent overlay across the primary display showing the test card and pass-through status.
- [`docs/r0-diagnostic-window.png`](docs/r0-diagnostic-window.png) — R0 diagnostic suite results.
- [`docs/r0-transparent-overlay.png`](docs/r0-transparent-overlay.png) — R0 initial transparent window verification.

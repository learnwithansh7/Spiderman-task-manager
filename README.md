# SpiderReminder

A Windows desktop reminder app where a 3D animated hero hanging upside down glides down from the top edge on a web thread to remind you to drink water.

---

## Milestone Progress

| Milestone | Status | Details |
|---|---|---|
| **R0: Diagnostics & Environment** | **DONE** | Validated normal window, transparent window, tray icon, and identified `Ctrl+Alt+R` collision; added `Ctrl+Alt+Shift+R` fallback. Tag: `r0-diagnostics`. |
| **R1: Overlay Window Foundation** | **DONE** | Transparent, frameless, always-on-top, click-through overlay covering the primary display. Window remains hidden when idle; shown via `showInactive()` so focus is never stolen. Tag: `r1-overlay-foundation`. |
| **R2: Animation with Placeholder** | **DONE** | Full physics animation loop: thread growth, 4s ease-out descent, scale (0.8 to 1.0) and soft depth shadow, damped pendulum sway $A e^{-kt} \cos(\omega t)$ starting at 10°, and 1.5s ease-in climb exit. Tag: `r2-animation`. |
| **R3: Note Card and Voice** | **DONE** | Spring-animated note card with **REMINDER** badge, customizable message (*"Time to drink water!"*), **Done** and **Snooze (5 min)** buttons, mute toggle, and spoken voice via Windows Speech Synthesis. Tag: `r3-note-and-voice`. |
| **R4: Scheduler and Settings** | **DONE** | Heartbeat scheduler engine, active hours gating (09:00–18:00), snooze handling, sleep/wake survival via `powerMonitor`, rotating reminder types (`water`, `stretch`, `eyes`), and JSON persistence in `settings.json`. Tag: `r4-scheduler`. |
| **R5: Tray & Settings Window** | Up Next | Dedicated React settings window and auto-start on boot. |
| **R6: The Real 3D Character** | Planned | Transparent WebM video clip (`character.webm`) with PNG fallback. |
| **R7: Polish & Reliability** | Planned | Fullscreen app detection, multi-monitor support, and crash resilience. |
| **R8: Installer & Release** | Planned | `electron-builder` Windows installer packaging. |

---

## Scheduler & Persistent Settings (Milestone R4)

- **Scheduler Engine (`electron/scheduler.ts`)**:
  - Heartbeat ticker checks every 3 seconds, evaluating the target timestamp against `Date.now()`.
  - Supports configurable interval (e.g., 45 minutes) and rotates across enabled reminder types (`water`, `stretch`, `eyes`).
  - **Active Hours Gating**: Only triggers reminders within defined hours (default: `09:00` to `18:00`). Postpones if outside work hours.
  - **Snooze Handling**: Clicking Snooze pushes `nextTriggerTimestamp` forward by the snooze duration (default: 5 minutes) and persists it immediately.
  - **Sleep / Wake Resilience**:
    - Listens to Electron's `powerMonitor` (`suspend` and `resume`).
    - On system sleep/hibernation, the schedule state is saved to disk.
    - On system resume/wake, overdue reminders trigger immediately without missing their window or drifting.
- **Persistent JSON Configuration (`settings.json`)**:
  - Stored in the project root: `D:\Projects\SpiderReminder\settings.json`.
  - Saves interval, active hours, snooze duration, voice mute preference, reminder types/messages, and timestamps.
  - Automatically created on first launch if missing.

---

## How to Run Milestone R4

### 1. Development Mode
```bash
npm run dev
```
- Runs in the system tray and schedules reminders automatically according to `settings.json`.
- Right-click the tray icon to trigger immediate test reminders (`Water`, `Stretch`, `Rest Eyes`) or set a 1-minute test interval.
- Press **`Ctrl+Alt+Shift+R`** to trigger an instant reminder test.

### 2. Automated Test Verification
```bash
npm run test:r4
```
Runs the automated test suite simulating:
1. 1-minute interval reminder firing on schedule with note card reveal and voice synthesis.
2. Capturing `docs/r4-scheduled-reminder.png`.
3. Snooze button handling and persistence in `settings.json`.
4. Simulating PC sleep & wake via `powerMonitor.emit('resume')`.

---

## Verification Artifacts (`docs/`)

- [`docs/r4-scheduled-reminder.png`](docs/r4-scheduled-reminder.png) — Scheduled reminder note card and character captured during automated suite execution.
- [`docs/r3-note-card.png`](docs/r3-note-card.png) — Note card with REMINDER badge, Done & Snooze buttons, mute toggle, and swaying character.

---

## Note Card & Spoken Voice Features (Milestone R3)

- **Spring Slide-In**: As the character completes the descent and begins swaying, the note card springs in beside him with physical spring stiffness ($k = 180$) and damping ($c = 15$).
- **Content**:
  - Top header with glowing accent dot and uppercase `"REMINDER"` label.
  - Spoken voice status toggle (`🔊 Voice` / `🔇 Muted`).
  - Reminder message text: `"Time to drink water!"`.
  - Action buttons:
    - **Done**: Green button; clicking confirms action, cancels speech, and initiates the climb back up.
    - **Snooze (5 min)**: Secondary button; initiates snooze action and climbs back up.
- **Windows Built-in Speech Synthesis**:
  - Speaks the reminder line once using the native Windows Speech API (`window.speechSynthesis`).
  - Requires no external cloud accounts or dependencies.
  - Can be muted via the card toggle or config.
  - Checks for optional audio file `assets/reminder.mp3` and plays it if present.
- **Selective Click-Through**:
  - The card enables mouse interaction on hover (`setIgnoreMouseEvents(false)`).
  - Outside the card, clicks pass through (`setIgnoreMouseEvents(true, { forward: true })`) so you can type and work underneath.

---

## How to Run Milestone R3

### 1. Development Mode
```bash
npm run dev
```
- The app runs in the system tray.
- Press **`Ctrl+Alt+Shift+R`** or right-click the tray icon and select **"Test reminder"**.
- The character descends, sways, presents the note card with buttons, and speaks the reminder out loud.
- Click **Done**, **Snooze (5 min)**, or wait 15 seconds to dismiss.

### 2. Automated Test Verification
```bash
npm run test:r3
```

---

## Verification Artifacts (`docs/`)

- [`docs/r3-note-card.png`](docs/r3-note-card.png) — Note card with REMINDER badge, Done & Snooze buttons, mute toggle, and swaying character.
- [`docs/r2-descent.png`](docs/r2-descent.png) — Character descending on thread with depth scale & soft shadow.
- [`docs/r2-sway.png`](docs/r2-sway.png) — Damped pendulum sway at full scale (1.0).
- [`docs/r2-exit.png`](docs/r2-exit.png) — Retracting back up the thread with ease-in curve.
- [`docs/r1-overlay-foundation.png`](docs/r1-overlay-foundation.png) — Milestone R1 foundation screenshot.
- [`docs/r0-diagnostic-window.png`](docs/r0-diagnostic-window.png) — Milestone R0 diagnostic results.

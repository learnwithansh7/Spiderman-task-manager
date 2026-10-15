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
| **R5: Tray & Settings Window** | **DONE** | Full tray context menu (status, multi-type preview, settings, login item checkbox, quit), dedicated React dark settings window, close-to-tray interception, and "Start with Windows" integration (`app.setLoginItemSettings`). Tag: `r5-tray-and-settings`. |
| **R6: The Real 3D Character** | **DONE** | Seamless fallback hierarchy (WebM with alpha -> PNG image -> neutral SVG placeholder), VP9 alpha video rendering with phase synchronization (play/pause), and asset generator script. Tag: `r6-character`. |
| **R7: Polish & Reliability** | Up Next | Fullscreen app detection, multi-monitor support, and crash resilience. |
| **R8: Installer & Release** | Planned | `electron-builder` Windows installer packaging. |

---

## The Real 3D Character (`character.webm` with alpha) (Milestone R6)

- **3-Tier Asset Fallback Hierarchy**:
  1. **`assets/character.webm`**: Full VP9 transparent video with alpha channel (`yuva420p`). Plays looped breathing, leg movement, and eye blinking while swinging on the web thread.
  2. **`assets/character.png`**: High-resolution transparent PNG image fallback if video is absent.
  3. **Procedural SVG**: Neutral upside-down spider character drawn dynamically if no external assets exist.
- **Phase-Synchronized Video Playback**:
  - Automatically begins playing when the character begins descending and swaying (`DESCENDING` / `SWAYING`).
  - Automatically pauses when the character climbs back up and enters `IDLE` state, conserving CPU and GPU resources.
- **Asset Generation Script (`scripts/generate-character-webm.js`)**:
  - Headless 60-frame procedural renderer that compiles an alpha-channel WebM video (`assets/character.webm`) and static image (`assets/character.png`) using `ffmpeg` (`-c:v libvpx-vp9 -pix_fmt yuva420p`).

---

## How to Run Milestone R6

### 1. Development Mode
```bash
npm run dev
```
- The character hangs upside down on the thread using the real transparent WebM video.
- Test with **`Ctrl+Alt+Shift+R`** or via the tray menu.

### 2. Automated Test Verification
```bash
npm run test:r6
```
Runs the automated verification suite:
1. Probes and verifies `assets/character.webm` loading with alpha channel.
2. Triggers the reminder animation and captures `docs/r6-character.png`.
3. Verifies phase-synchronized playback and clean exit.

---

## Tray, Settings Window & Windows Startup (Milestone R5)

- **Dedicated Settings Window (`src/settings/SettingsApp.tsx`)**:
  - Independent, framed dark-themed window (`#0b1120`) built with React and Vite.
  - **Quick Interval Presets**: Pill selector for `20m`, `30m`, `45m`, `60m`, plus custom numeric input.
  - **Active Work Hours**: Toggle and time inputs (`09:00` to `18:00`) restricting notifications to work times.
  - **Snooze & Voice**: Custom snooze duration (`3m`, `5m`, `10m`, `15m`), voice toggle, and interactive `🔊 Test Voice` button.
  - **Reminder Customization**: Enable/disable toggles, custom messages, and instant live preview triggers for Water, Stretch, and Rest Eyes.
  - **Start with Windows**: Toggle connected to native Windows login items via `app.setLoginItemSettings()`.
  - **Close Interception**: Clicking the window's close button hides the window (`event.preventDefault(); window.hide()`) instead of destroying it, allowing instant re-open while keeping the app running silently in the tray.
- **Enhanced Tray Context Menu**:
  - Real-time status display: `Next: [Time] ([TYPE])`.
  - Nested test reminder submenu (`💧 Water`, `🙆 Stretch`, `👀 Rest Eyes`).
  - `Settings...` launcher (focuses existing instance if open).
  - Quick toggle for `Start with Windows`.
  - Clean `Quit SpiderReminder` action.

---

## How to Run Milestone R5

### 1. Development Mode
```bash
npm run dev
```
- App launches in system tray.
- Click tray icon or select **"Settings..."** to open the Settings panel.
- Change reminder interval, configure active hours, or test speech voice.
- Press **`Ctrl+Alt+Shift+R`** anytime to trigger an instant reminder test.

### 2. Automated Test Verification
```bash
npm run test:r5
```
Runs the automated verification suite:
1. Opens and renders the React Settings window.
2. Captures screenshot: `docs/r5-settings-window.png`.
3. Tests settings modification, JSON persistence, and login item settings.
4. Verifies window close-to-hide interception without quitting.


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

- [`docs/r6-character.png`](docs/r6-character.png) — Real animated character hanging from web thread rendered via transparent WebM video (`character.webm` with alpha).
- [`docs/r5-settings-window.png`](docs/r5-settings-window.png) — Dedicated React Settings panel with dark theme, interval presets, active hours, snooze/voice controls, and startup toggle.
- [`docs/r4-scheduled-reminder.png`](docs/r4-scheduled-reminder.png) — Scheduled reminder note card and character captured during automated suite execution.
- [`docs/r3-note-card.png`](docs/r3-note-card.png) — Note card with REMINDER badge, Done & Snooze buttons, mute toggle, and swaying character.
- [`docs/r2-descent.png`](docs/r2-descent.png) — Character descending on thread with depth scale & soft shadow.
- [`docs/r2-sway.png`](docs/r2-sway.png) — Damped pendulum sway at full scale (1.0).
- [`docs/r2-exit.png`](docs/r2-exit.png) — Retracting back up the thread with ease-in curve.
- [`docs/r1-overlay-foundation.png`](docs/r1-overlay-foundation.png) — Milestone R1 foundation screenshot.
- [`docs/r0-diagnostic-window.png`](docs/r0-diagnostic-window.png) — Milestone R0 diagnostic results.

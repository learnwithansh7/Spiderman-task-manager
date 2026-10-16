# SpiderReminder

A Windows desktop reminder app where a 3D animated hero hanging upside down glides down from the top edge on a web thread to remind you to drink water.

---

## Milestone Progress

| Milestone | Status | Details |
|---|---|---|
| **V1: Voice Activation (Vosk)** | **DONE** | 100% offline, zero-cloud wake-word activation ("Hey Spider") via Vosk speech recognition and sounddevice. Isolated Python venv, generic `WakeWordEngine` interface, self-trigger prevention, cooldowns, tray controls, and multi-model support (`vosk-model-small-en-in-0.4` and `vosk-model-small-en-us-0.15`). |
| **R0: Diagnostics & Environment** | **DONE** | Validated normal window, transparent window, tray icon, and identified `Ctrl+Alt+R` collision; added `Ctrl+Alt+Shift+R` fallback. Tag: `r0-diagnostics`. |
| **R1: Overlay Window Foundation** | **DONE** | Transparent, frameless, always-on-top, click-through overlay covering the primary display. Window remains hidden when idle; shown via `showInactive()` so focus is never stolen. Tag: `r1-overlay-foundation`. |
| **R2: Animation with Placeholder** | **DONE** | Full physics animation loop: thread growth, 4s ease-out descent, scale (0.8 to 1.0) and soft depth shadow, damped pendulum sway $A e^{-kt} \cos(\omega t)$ starting at 10°, and 1.5s ease-in climb exit. Tag: `r2-animation`. |
| **R3: Note Card and Voice** | **DONE** | Spring-animated note card with **REMINDER** badge, customizable message (*"Time to drink water!"*), **Done** and **Snooze (5 min)** buttons, mute toggle, and spoken voice via Windows Speech Synthesis. Tag: `r3-note-and-voice`. |
| **R4: Scheduler and Settings** | **DONE** | Heartbeat scheduler engine, active hours gating (09:00–18:00), snooze handling, sleep/wake survival via `powerMonitor`, rotating reminder types (`water`, `stretch`, `eyes`), and JSON persistence in `settings.json`. Tag: `r4-scheduler`. |
| **R5: Tray & Settings Window** | **DONE** | Full tray context menu (status, multi-type preview, settings, login item checkbox, quit), dedicated React dark settings window, close-to-tray interception, and "Start with Windows" integration (`app.setLoginItemSettings`). Tag: `r5-tray-and-settings`. |
| **R6: The Real 3D Character** | **DONE** | Seamless fallback hierarchy (WebM with alpha -> PNG image -> neutral SVG placeholder), VP9 alpha video rendering with phase synchronization (play/pause), and asset generator script. Tag: `r6-character`. |
| **R7: Polish & Reliability** | **DONE** | Fullscreen game/presentation detection (`isForegroundAppFullscreen`), multi-monitor bounds tracking (`screen.on('display-metrics-changed')`), single-instance locking (`requestSingleInstanceLock`), and renderer crash recovery (`render-process-gone`). Tag: `r7-polish`. |
| **R8: Installer & Release** | **DONE** | `electron-builder` Windows packaging: NSIS standard installer, standalone portable executable, unpacked directory, custom 256x256 `.ico` icon, and verified SHA256 hashes. Tag: `r8-release`. |

---

## Milestone V1: Voice Activation (Vosk Setup Guide)

SpiderReminder features private, zero-cloud offline voice activation triggered by saying **"Hey Spider"**.

### Privacy & Architecture Guarantees
- **100% Offline**: Zero external network requests, zero cloud speech accounts, and zero AccessKeys.
- **Privacy First**: No raw audio is ever recorded, stored to disk, or transmitted off this PC.
- **Isolated Helper**: Runs in an isolated virtual environment at `tools/voice/.venv` using `vosk==0.3.45` and `sounddevice==0.5.1`.
- **Automatic Lifecycle Control**: The voice helper process exits cleanly when SpiderReminder shuts down, preventing background orphan processes.
- **Self-Trigger Prevention**: Voice listening automatically pauses while Spider-Man is speaking or playing audio, and enters a 3-second post-sequence cooldown before resuming.

### Setup Instructions

#### 1. Check Python Version
Ensure Python 3.9–3.12 is installed on Windows:
```bash
python --version
```

#### 2. Create Virtual Environment
```bash
python -m venv tools/voice/.venv
```

#### 3. Install Dependencies
```bash
.\tools\voice\.venv\Scripts\python.exe -m pip install --upgrade pip
.\tools\voice\.venv\Scripts\python.exe -m pip install vosk==0.3.45 sounddevice==0.5.1
```

#### 4. Download and Unpack Vosk Models into `models/vosk/`
SpiderReminder supports multiple models. Both models are distributed under the **Apache 2.0** license:

- **English (India) Model (Recommended)**:
  - Download URL: `https://alphacephei.com/kaldi/models/vosk-model-small-en-in-0.4.zip`
  - Unpack to: `models/vosk/vosk-model-small-en-in-0.4`
- **English (US) Model**:
  - Download URL: `https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip`
  - Unpack to: `models/vosk/vosk-model-small-en-us-0.15`

You can switch between installed models anytime inside the **Settings** window under **Voice Activation**.

---

## Installer & Release (Milestone R8)

SpiderReminder is fully packaged for production distribution on Windows 10/11 x64 using `electron-builder`.

### Release Outputs (`release/`)
| File | Type | Size | Description |
|---|---|---|---|
| **`SpiderReminder Setup 1.0.0.exe`** | NSIS Installer | **82.8 MB** | Full Windows setup wizard with Start Menu shortcuts, desktop shortcut option, and clean uninstaller. |
| **`SpiderReminder 1.0.0.exe`** | Portable Executable | **82.6 MB** | Zero-install standalone binary that runs immediately from any folder or USB drive. |
| **`release/win-unpacked/SpiderReminder.exe`** | Directory Build | **189 MB** | Pre-extracted binary directory for developer testing without re-packing. |

### Build Commands
```bash
# Build production NSIS installer and portable executable
npm run dist

# Build unpacked directory only (fast verification)
npm run dist:dir
```

---

## Polish & Reliability (Milestone R7)

- **Fullscreen Game & Presentation Detection (`electron/system.ts`)**:
  - Automatically queries the Windows foreground application dimensions before triggering a reminder.
  - If a user is immersed in a fullscreen video player, presentation, or game, the reminder automatically postpones by 3 minutes to avoid losing focus or disrupting gameplay.
- **Dynamic Multi-Monitor Support**:
  - Actively listens to `display-added`, `display-removed`, and `display-metrics-changed` events.
  - Dynamically recalculates work area boundaries and repositions the overlay to always fit the primary screen correctly across DPI/resolution changes.
- **Single Instance Enforcement**:
  - `app.requestSingleInstanceLock()` prevents accidental duplicate processes.
  - Secondary launches immediately focus the existing Settings window and terminate.
- **Process & Renderer Crash Recovery**:
  - Intercepts `render-process-gone` and automatically rebuilds the transparent overlay window if the renderer terminates.
  - Global `uncaughtException` and `unhandledRejection` guards prevent silent process termination.

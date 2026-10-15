# SpiderReminder - Milestone R0: Diagnostics & Environment

SpiderReminder is a Windows desktop reminder app.
This milestone (**R0**) isolates and diagnoses the four foundational components to verify why earlier prototypes failed.

---

## The Four Tests & Results on this PC

| Test | Component | Description | Result | Details |
|---|---|---|---|---|
| **Test 1** | **Normal Visible Window** | Standard Electron window with HTML/CSS rendering | **PASS** | Successfully opens and renders diagnostic status. |
| **Test 2** | **Transparent Overlay** | Frameless, transparent, always-on-top window with visible red box | **PASS** | Transparent background composites properly without black box artifacts. Works both with hardware acceleration and with `--disable-gpu`. |
| **Test 3** | **System Tray & Menu** | Tray icon next to clock with context menu | **PASS** | Tray icon created; context menu responds to click. |
| **Test 4** | **Global Shortcut** | Global keyboard hotkeys | **IDENTIFIED ROOT CAUSE** | `Ctrl+Alt+R` failed (`false`) due to an existing OS-level registration by Windows/GPU overlay software. Fallback `Ctrl+Alt+Shift+R` succeeded (`true`). |

---

## Why the Initial Try Did Nothing

1. When the user pressed `Ctrl+Alt+R`, Windows refused to deliver the hotkey to Electron because `Ctrl+Alt+R` was already captured by another background application (e.g. AMD/Intel/Nvidia screen capture or Windows hotkeys).
2. Because registration failed silently, pressing `Ctrl+Alt+R` never triggered the main process to show the window.
3. Adding the fallback shortcut **`Ctrl+Alt+Shift+R`** and verifying the tray menu **"R0: Test reminder"** confirms that the window and renderer were always functional.

---

## How to Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Diagnostic Test Suite
```bash
npm run test:r0
```
To test with software rendering (hardware acceleration disabled):
```bash
npx electron dist/electron/main.js --r0-test --disable-gpu
```

### 3. Run Manually
```bash
npm start
```
- A diagnostic window will appear displaying live test statuses.
- A transparent overlay window will appear with a red status box.
- The tray icon will appear next to the system clock.
- Press **`Ctrl+Alt+Shift+R`** to trigger the shortcut test.

---

## Visual Verification Artifacts (`docs/`)

- [`docs/r0-diagnostic-window.png`](docs/r0-diagnostic-window.png) - Normal visible window rendering all test checks.
- [`docs/r0-transparent-overlay.png`](docs/r0-transparent-overlay.png) - Transparent overlay window showing the visible red test box.

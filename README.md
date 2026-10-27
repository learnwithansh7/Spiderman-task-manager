# SpiderReminder 🕷️

**SpiderReminder** is an interactive, privacy-first Windows desktop task reminder and voice assistant. An animated character descends from the top of your screen on a web strand to display your active mission tasks, remind you to stay healthy, and respond to offline voice commands without any cloud or API dependencies.

---

## ✨ Features

- **🕸️ Fluid Desktop Overlay Animation**: Non-intrusive, click-through, frameless transparent overlay that smoothly lowers the character and task card from the top edge of your screen.
- **📋 SpiderTasks Manager**: Built-in desktop mission card to add, complete, and delete tasks directly with real-time progress indicators.
- **🎙️ 100% Offline Voice Activation**: Wake-word and dismissal detection powered by [Vosk](https://alphacephei.com/vosk/) and Python. All speech processing happens locally on your machine with zero cloud connectivity.
- **🔇 Privacy & Security First**: No audio is ever recorded, stored to disk, or sent over any network.
- **🚀 Windows Autostart**: Launches silently in the background on Windows boot (`--hidden`), listening for voice commands from the system tray.
- **🎮 Fullscreen Awareness**: Automatically detects when you are playing games or watching fullscreen videos and suppresses visual popups.
- **🎨 Custom Character Support**: Bring your own 2D sprite (`assets/character.png`) or 3D model (`assets/character.glb`), with automatic graceful fallbacks to the bundled original mascot.

---

## 🛠️ System Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Node.js**: v18.x or v20.x
- **Python**: Python 3.10, 3.11, or 3.12 (64-bit, added to system `PATH`)
- **Microphone**: Working audio input device

---

## 🚀 Quick Start Guide

### 1. Install Node Dependencies
```powershell
npm install
```

### 2. Set Up Python Voice Helper
The speech recognition engine runs in an isolated Python virtual environment:
```powershell
cd tools/voice
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ../..
```

### 3. Download Offline Speech Models
SpiderReminder requires an offline Vosk speech model placed in `models/vosk/`.

Run the interactive downloader (shows the official URL and asks for confirmation before downloading):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-models.ps1
```
*Manual Alternative*: Download `vosk-model-small-en-us-0.15.zip` from [Alpha Cephei](https://alphacephei.com/vosk/models) and extract it into `models/vosk/vosk-model-small-en-us-0.15`.

### 4. Run Development Build
```powershell
npm run dev
```

### 5. Package Windows Installer (.exe)
```powershell
npm run dist
```
Builds the standalone installer and portable `.exe` into the `release/` directory.

---

## 🗣️ Voice Commands

| Voice Trigger | Behavior |
| :--- | :--- |
| **"Hey Spider"** | Summons the character down to display your active task board. |
| **"Spider"** *(optional)* | Single-word wake-word (can be toggled in Settings). |
| **"ok spider"** / **"okay spider"** | Dismisses the character back up to the top of the screen. |

---

## 🔧 Troubleshooting

### 1. "Voice Activation" says Stopped or Test Mic is 0%
- **Windows Microphone Privacy**: Ensure microphone access is permitted under:
  `Windows Settings > Privacy & security > Microphone > Let desktop apps access your microphone -> ON`.
- **Selected Hardware**: In the Settings window under **Microphone & Voice**, ensure the correct hardware device is selected from the dropdown rather than an inactive virtual adapter.
- **Model Files Missing**: Verify that the speech model exists at `models/vosk/vosk-model-small-en-us-0.15/`.

### 2. Stale Helper Processes
- If another Python process previously locked the microphone device, close SpiderReminder and terminate any hanging helpers:
  ```powershell
  Stop-Process -Name "python" -Force -ErrorAction SilentlyContinue
  ```
  SpiderReminder automatically cleans up child helper processes on exit.

---

## 🔒 Safety, Privacy & Design Limits

- **No Remote Calls**: The core application makes zero telemetry or external API calls during operation.
- **Graceful Asset Fallback**: If custom character graphics or 3D models are missing, SpiderReminder displays the bundled original placeholder mascot.
- **Resource Gating**: Speech recognition automatically pauses while reminders speak to avoid feedback loops, with a built-in cooldown.

---

## 🎨 Bringing Your Own Character Artwork

To replace the default mascot with your own custom character:
1. Place your transparent PNG at `assets/character.png` (512×512 px recommended).
2. See [`assets/README.md`](docs/../assets/README.md) for full formatting details.

---

## 📄 License

License: to be decided

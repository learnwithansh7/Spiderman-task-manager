# 🕷️ Spider-Man Task Manager

<p align="center">
  <strong>An interactive, privacy-first Windows desktop task manager and offline voice companion.</strong><br>
  An animated Spider-Man character smoothly descends from the top of your screen on a silk web strand to display your active mission tasks, track daily milestones, and respond to offline voice commands — with zero cloud or API dependencies!
</p>

---

## ✨ Features

- 🕸️ **Fluid Desktop Web-Drop Animation:**
  - Non-intrusive, click-through, frameless transparent overlay that smoothly lowers Spider-Man and your mission task card from the top edge of your monitor.
  - Fluid drop, pendulum web swing, and climb-up animations.
- 📋 **Interactive Task Manager (SpiderTasks):**
  - Built-in mission card to add, inspect, check off, and delete tasks directly with real-time completion indicators.
  - Organize daily coding objectives, sprint goals, and personal to-dos.
- 🎙️ **100% Offline Voice Activation:**
  - Wake-word detection and hands-free control powered by local speech models ([Vosk](https://alphacephei.com/vosk/) and Python).
  - All speech processing executes strictly on your local machine — zero cloud connectivity, zero external APIs.
- 🔒 **Privacy & Security First:**
  - Complete offline privacy: audio is processed directly in memory. No audio is ever recorded to disk or transmitted over the internet.
- 🚀 **Windows Autostart:**
  - Starts silently in the background on Windows boot (`--hidden`), resting quietly in your system tray ready to respond to voice commands or hotkeys.
- 🎮 **Fullscreen & Gaming Awareness:**
  - Automatically suppresses visual popups whenever you are gaming or watching fullscreen videos to avoid interruptions.
- 🎨 **Custom Character & Mascot Support:**
  - Bring your own 2D sprite (`assets/character.png`) or 3D model (`assets/character.glb`) with automatic graceful fallback to the bundled mascot.
- ⚙️ **Modern Dark-Mode Dashboard:**
  - Full settings UI allowing instant hotkey customization, theme adjustments, timer configurations, and autostart toggles.

---

## 🛠️ System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Node.js:** v18.x or v20.x
- **Python:** Python 3.10, 3.11, or 3.12 (64-bit, added to system `PATH`)
- **Microphone:** Any standard working audio input device (for offline voice control)

---

## 🚀 Quick Start Guide

### 1. Install Node Dependencies

```powershell
npm install
```

### 2. Set Up Python Offline Voice Environment

The voice assistant requires Python with Vosk for 100% offline speech recognition:

```powershell
# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r scripts/requirements.txt
```

### 3. Run in Development Mode

```powershell
npm run dev
```

### 4. Build for Production

```powershell
# Compile TypeScript and Vite assets
npm run build

# Package standalone Windows executable
npm run dist:dir
```

---

## 🎙️ Offline Voice Commands

| Voice Command | Action |
|---|---|
| *"Hey Spider"* / *"Spider"* | Wake up Spider-Man and drop down the mission task card |
| *"Show tasks"* / *"Open tasks"* | Display current active task list |
| *"Dismiss"* / *"Go away"* / *"Goodbye"* | Spider-Man climbs back up the web thread |
| *"Complete task"* | Check off the highlighted task |

---

## 📂 Project Architecture

```
spiderman-task-manager/
├── electron/                  # Electron main process & IPC handlers
│   ├── main.ts                # Application lifecycle, tray, and window creation
│   ├── overlay.ts             # Frameless transparent overlay coordinator
│   └── autostart.ts           # Windows registry autostart manager
├── src/                       # Frontend application (TypeScript + Vite)
│   ├── components/            # Task card, settings modal, and character view
│   └── styles/                # Spider-Man theme styling & animations
├── agent/                     # Offline Python Vosk voice processing agent
├── models/                    # Offline speech recognition models
├── assets/                    # Character sprites, 3D models, icons, and audio
├── scripts/                   # Development, build, and test verification scripts
├── package.json               # Project manifest and build scripts
└── README.md                  # Project documentation
```

---

## ⌨️ Global Hotkeys & Tray Control

- **Open Task Manager / Summon:** Press `Ctrl + Shift + S` (or your configured hotkey).
- **System Tray:** Right-click the spider icon in your Windows notification area to:
  - Open Task Manager
  - Trigger spider drop
  - Toggle Offline Voice Listening
  - Access Settings
  - Quit

---

## 📄 License

MIT License. Free to use, customize, and share!

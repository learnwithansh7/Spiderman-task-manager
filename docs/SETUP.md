# SpiderReminder Setup Guide

This guide walks you through setting up, configuring, and building SpiderReminder from source on Windows.

---

## 1. Prerequisites

- **Operating System**: Windows 10 or Windows 11 (64-bit)
- **Node.js**: v18.x or v20.x (with npm)
- **Python**: 3.10, 3.11, or 3.12 (64-bit) installed and added to `PATH`
- **Microphone**: Any functioning audio input device (system default or USB)

---

## 2. Installation Steps

### Step 1: Install Node Dependencies
Open a PowerShell terminal in the repository root and run:
```powershell
npm install
```

### Step 2: Set Up Python Voice Environment
The voice recognition engine runs as an offline Python sidecar (`tools/voice/voice_helper.py`).

Create a dedicated virtual environment inside `tools/voice/.venv`:
```powershell
# Navigate to tools/voice
cd tools/voice

# Create virtual environment
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Install voice dependencies
pip install -r requirements.txt

# Return to repository root
cd ../..
```

### Step 3: (Optional) Set Up Window Control Helper
For window management and app listing features (`tools/winctl/winctl.py`):
```powershell
cd tools/winctl
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ../..
```

### Step 4: Download Offline Speech Models
SpiderReminder uses offline Vosk models for wake-word and command recognition with no cloud dependencies.

Run the interactive download script (displays the official URL and asks for approval before downloading):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/download-models.ps1
```
Or manually download `vosk-model-small-en-us-0.15.zip` from [Alpha Cephei](https://alphacephei.com/vosk/models) and extract it so that the path `models/vosk/vosk-model-small-en-us-0.15/` contains `am/`, `conf/`, and `graph/`.

---

## 3. Running the App in Development

Compile TypeScript and start the Electron application:
```powershell
npm run dev
```

Alternatively, to build and run manually:
```powershell
npm run build
npm start
```

---

## 4. Building the Production Installer

To produce an NSIS installer and standalone portable executable in `release/`:
```powershell
npm run dist
```
This generates:
- `release/SpiderReminder Setup 2.0.0.exe` (NSIS Installer)
- `release/SpiderReminder 2.0.0.exe` (Portable Executable)

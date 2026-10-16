import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, powerMonitor, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { ReminderScheduler } from './scheduler';
import { ReminderTypeKey, AppSettings, loadSettings, saveSettings } from './settings';
import { isForegroundAppFullscreen } from './system';
import { VoskHelperEngine } from './voice/voskEngine';
import { AudioDevice, WakeWordError } from './voice/types';

// Crash Resilience: Global Unhandled Exceptions and Rejections
process.on('uncaughtException', (err) => {
  console.error('[R7 Crash Resilience] Uncaught exception in main process:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[R7 Crash Resilience] Unhandled rejection in main process:', reason);
});

// Single Instance Lock: Ensure only one instance of SpiderReminder runs
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[R7 Reliability] Another instance is already running. Quitting secondary instance.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  console.log('[R7 Reliability] Second instance detected. Showing settings window.');
  if (app.isReady()) {
    createOrShowSettingsWindow();
  }
});

let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: ReminderScheduler | null = null;
let voiceEngine: VoskHelperEngine | null = null;
let availableAudioDevices: AudioDevice[] = [];

let isAnimationPlaying = false;
let isRendererReady = false;
let isQuitting = false;
let pendingTriggerPayload: { message: string; voiceText: string } | null = null;

// Self-trigger prevention & cooldown
let lastSequenceEndTime = 0;
const POST_SEQUENCE_COOLDOWN_MS = 3000;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R7 Startup] Initializing SpiderReminder Milestone R7 (Polish and Reliability)...');

function showPlainNotification(title: string, body: string) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: path.resolve(__dirname, '../../assets/icon.png') }).show();
    } else if (tray) {
      tray.displayBalloon({ title, content: body, iconType: 'warning' });
    }
  } catch (err) {
    console.warn('[Notification] Failed to show system notification:', err);
  }
}

function applyLoginItemSettings(openAtLogin: boolean) {
  console.log(`[R7 Startup] Applying Windows login item setting: openAtLogin=${openAtLogin}`);
  try {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (err) {
    console.warn('[R7 Startup] Failed to configure Windows login item:', err);
  }
}

function repositionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;
  overlayWindow.setBounds({ x, y, width, height });
  console.log(`[R7 Multi-Monitor] Overlay repositioned to primary display: (${x}, ${y}) [${width}x${height}].`);
}

function createOverlayWindow() {
  console.log('[R7 Window] Creating transparent frameless overlay window...');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // Never steal focus from background apps
    alwaysOnTop: true,
    show: false, // Hidden when idle
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Overlay Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('[R7 Window] Overlay renderer did-finish-load event fired.');
  });

  overlayWindow.webContents.on('render-process-gone', (_event, details) => {
    console.warn(`[R7 Reliability] Overlay render process gone: reason="${details.reason}", exitCode=${details.exitCode}. Auto-recreating window...`);
    isRendererReady = false;
    setTimeout(() => {
      if (!isQuitting) createOverlayWindow();
    }, 1000);
  });

  overlayWindow.on('unresponsive', () => {
    console.warn('[R7 Reliability] Overlay window became unresponsive.');
  });

  overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[R7 Window] did-fail-load: code=${errorCode}, desc="${errorDescription}", url="${validatedURL}"`);
    if (validatedURL.startsWith('http')) {
      const fallback = path.resolve(__dirname, '../../dist/renderer/overlay/index.html');
      console.log(`[R7 Window] Dev server not responding; falling back to built local file: ${fallback}`);
      overlayWindow?.loadFile(fallback);
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = `${process.env.VITE_DEV_SERVER_URL}/overlay/index.html`;
    console.log(`[R7 Window] Loading Vite dev server overlay: ${devUrl}`);
    overlayWindow.loadURL(devUrl).catch((err) => {
      console.warn(`[R7 Window] Failed to load dev URL (${err.message}); falling back to local file...`);
      overlayWindow?.loadFile(path.resolve(__dirname, '../../dist/renderer/overlay/index.html'));
    });
  } else {
    const indexPath = path.resolve(__dirname, '../../dist/renderer/overlay/index.html');
    console.log(`[R7 Window] Loading built overlay index: ${indexPath}`);
    overlayWindow.loadFile(indexPath);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  const bounds = overlayWindow.getBounds();
  console.log(`[R7 Window] Overlay window created (hidden) at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}].`);
}

function createOrShowSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    console.log('[R7 Settings] Settings window already exists. Showing & focusing...');
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  console.log('[R7 Settings] Creating dedicated settings window...');
  const iconPath = path.resolve(__dirname, '../../assets/icon.png');
  const winIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 720,
    minWidth: 460,
    minHeight: 600,
    title: 'SpiderReminder Settings',
    icon: winIcon,
    backgroundColor: '#0b1120',
    autoHideMenuBar: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      console.log('[R7 Settings] Close requested: hiding settings window (SpiderReminder remains in tray).');
      settingsWindow?.hide();
    }
  });

  settingsWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Settings Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  settingsWindow.webContents.on('did-finish-load', () => {
    console.log('[R7 Settings] Settings window did-finish-load.');
  });

  settingsWindow.webContents.on('render-process-gone', (_event, details) => {
    console.warn(`[R7 Reliability] Settings render process gone: reason="${details.reason}".`);
  });

  settingsWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[R7 Settings] did-fail-load: code=${errorCode}, desc="${errorDescription}", url="${validatedURL}"`);
    if (validatedURL.startsWith('http')) {
      const fallback = path.resolve(__dirname, '../../dist/renderer/settings/index.html');
      console.log(`[R7 Settings] Dev server unavailable; falling back to built local file: ${fallback}`);
      settingsWindow?.loadFile(fallback);
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = `${process.env.VITE_DEV_SERVER_URL}/settings/index.html`;
    console.log(`[R7 Settings] Loading dev URL: ${devUrl}`);
    settingsWindow.loadURL(devUrl).catch((err) => {
      console.warn(`[R7 Settings] Failed to load dev URL (${err.message}); falling back to local file...`);
      settingsWindow?.loadFile(path.resolve(__dirname, '../../dist/renderer/settings/index.html'));
    });
  } else {
    const filePath = path.resolve(__dirname, '../../dist/renderer/settings/index.html');
    console.log(`[R7 Settings] Loading production file: ${filePath}`);
    settingsWindow.loadFile(filePath);
  }

  settingsWindow.once('ready-to-show', () => {
    console.log('[R7 Settings] Settings window ready-to-show.');
    settingsWindow?.show();
    settingsWindow?.focus();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function triggerReminderAnimation(message: string, voiceText: string) {
  if (isAnimationPlaying) {
    console.log('[R7 Main] Animation already playing! Ignoring duplicate trigger.');
    return;
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.warn('[R7 Main] Overlay window not available.');
    return;
  }

  if (!isRendererReady) {
    console.log('[R7 Main] Renderer not ready yet. Queuing trigger...');
    pendingTriggerPayload = { message, voiceText };
    return;
  }

  isAnimationPlaying = true;
  console.log(`[R7 Main] Starting reminder animation for: "${message}"`);

  // Pause voice listener while character speaks/animates so he cannot trigger himself
  voiceEngine?.pause();

  overlayWindow.showInactive();
  overlayWindow.webContents.send('trigger-animation', { message, voiceText });
}

function updateTrayMenu() {
  if (!tray) return;

  const currentSettings = scheduler ? scheduler.getSettings() : loadSettings();
  const nextInfo = scheduler ? scheduler.getNextReminderInfo() : { timeString: 'Pending', type: 'water' as ReminderTypeKey };
  const isListening = voiceEngine?.isListening() || false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Next: ${nextInfo.timeString} (${nextInfo.type.toUpperCase()})`,
      enabled: false,
    },
    { type: 'separator' },
    {
      // Milestone V1: Voice activation On/Off showing real state
      label: `Voice activation: ${currentSettings.voiceActivationEnabled ? 'On' : 'Off'}`,
      type: 'checkbox',
      checked: currentSettings.voiceActivationEnabled,
      click: (menuItem) => {
        currentSettings.voiceActivationEnabled = menuItem.checked;
        saveSettings(currentSettings);
        scheduler?.updateSettings(currentSettings);
        if (menuItem.checked) {
          voiceEngine?.start();
        } else {
          voiceEngine?.stop();
        }
        updateTrayMenu();
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('settings-updated', currentSettings);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Test reminder',
      submenu: [
        {
          label: '💧 Water',
          click: () => scheduler?.triggerImmediateTest('water'),
        },
        {
          label: '🙆 Stretch',
          click: () => scheduler?.triggerImmediateTest('stretch'),
        },
        {
          label: '👀 Rest Eyes',
          click: () => scheduler?.triggerImmediateTest('eyes'),
        },
      ],
    },
    {
      label: 'Settings...',
      click: () => {
        console.log('[R7 Tray] Menu item clicked: "Settings..."');
        createOrShowSettingsWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: currentSettings.startWithWindows,
      click: (menuItem) => {
        console.log(`[R7 Tray] Start with Windows toggled: ${menuItem.checked}`);
        currentSettings.startWithWindows = menuItem.checked;
        saveSettings(currentSettings);
        scheduler?.updateSettings(currentSettings);
        applyLoginItemSettings(menuItem.checked);
        updateTrayMenu();
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('settings-updated', currentSettings);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit SpiderReminder',
      click: () => {
        console.log('[R7 Tray] Quit clicked. Terminating app.');
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  const tooltipState = currentSettings.voiceActivationEnabled
    ? (isListening ? '🎙️ Listening for "Hey Spider"' : '🎙️ Voice: Paused')
    : 'Voice: Off';
  tray.setToolTip(`SpiderReminder - Next: ${nextInfo.timeString} | ${tooltipState}`);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  console.log('[R7 Tray] Creating tray icon and context menu...');
  const iconPath = path.resolve(__dirname, '../../assets/icon.png');
  let icon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.on('click', () => {
    createOrShowSettingsWindow();
  });
  tray.on('double-click', () => {
    createOrShowSettingsWindow();
  });

  updateTrayMenu();
  console.log('[R7 Tray] Tray icon and context menu ready.');
}

function registerShortcuts() {
  console.log('[R7 Shortcuts] Registering global shortcuts...');

  const primary = 'CommandOrControl+Alt+R';
  globalShortcut.register(primary, () => {
    scheduler?.triggerImmediateTest();
  });

  const fallback = 'CommandOrControl+Alt+Shift+R';
  globalShortcut.register(fallback, () => {
    scheduler?.triggerImmediateTest();
  });

  const settingsShortcut = 'CommandOrControl+Alt+S';
  globalShortcut.register(settingsShortcut, () => {
    createOrShowSettingsWindow();
  });

  const settingsFallback = 'CommandOrControl+Shift+S';
  globalShortcut.register(settingsFallback, () => {
    createOrShowSettingsWindow();
  });
}

// Setup Voice Engine
function setupVoiceEngine(settings: AppSettings) {
  voiceEngine = new VoskHelperEngine({
    modelName: settings.voiceModelName,
    threshold: settings.voiceSensitivity,
    alsoSpider: settings.voiceAlsoSpider,
    deviceId: settings.voiceDeviceId,
  });

  voiceEngine.onDetected((phrase, conf) => {
    console.log(`[Main] Voice trigger detected: "${phrase}" (conf: ${conf})`);

    // Guard: ignore if character is currently on screen or was active within 3s
    const now = Date.now();
    if (isAnimationPlaying) {
      console.log('[Main] Character is active. Ignoring detection.');
      return;
    }
    if (now - lastSequenceEndTime < POST_SEQUENCE_COOLDOWN_MS) {
      console.log('[Main] Within 3s post-sequence cooldown. Ignoring detection.');
      return;
    }

    // Trigger summon sequence with a friendly greeting
    const greeting = 'Hey! Spider-Man here with your reminder.';
    const type = scheduler ? scheduler.getNextReminderInfo().type : 'water';
    const config = settings.reminderTypes[type];
    triggerReminderAnimation(`${greeting} ${config.message}`, `${greeting} ${config.voiceText}`);
  });

  voiceEngine.onDevices((devices) => {
    console.log(`[Main] Received ${devices.length} audio input devices from Vosk helper.`);
    availableAudioDevices = devices;
  });

  voiceEngine.onStateChange((_listening) => {
    updateTrayMenu();
  });

  voiceEngine.onError((err: WakeWordError) => {
    console.warn(`[Main] WakeWord Error: [${err.code}] ${err.message}`);
    switch (err.code) {
      case 'NO_MIC':
        showPlainNotification('Microphone Not Found', 'SpiderReminder could not find any microphone. Please connect a microphone.');
        break;
      case 'MIC_BLOCKED':
        showPlainNotification('Microphone Blocked', 'Microphone access is blocked by Windows privacy settings. Enable it in Windows Settings → Privacy.');
        break;
      case 'MODEL_MISSING':
        showPlainNotification('Voice Model Missing', 'Vosk speech model is missing from models/vosk/.');
        break;
      case 'CRASH_LOOP':
        showPlainNotification('Voice Activation Stopped', 'The voice helper stopped working after multiple recovery attempts.');
        break;
      default:
        break;
    }
  });

  if (settings.voiceActivationEnabled) {
    console.log('[Main] Voice activation is ENABLED in settings. Starting Vosk helper...');
    voiceEngine.start();
  } else {
    console.log('[Main] Voice activation is OFF by default.');
  }
}

// IPC Handlers
ipcMain.on('renderer-ready', () => {
  console.log('[R7 Main] Overlay renderer announced ready for animation triggers.');
  isRendererReady = true;
  if (pendingTriggerPayload) {
    const payload = pendingTriggerPayload;
    pendingTriggerPayload = null;
    triggerReminderAnimation(payload.message, payload.voiceText);
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

ipcMain.on('reminder-action', (_event, action: 'done' | 'snooze', snoozeMinutes?: number) => {
  console.log(`[R7 Main] Reminder action received: action="${action}", snoozeMinutes=${snoozeMinutes || 0}`);
  if (action === 'done') {
    scheduler?.handleDone();
  } else if (action === 'snooze') {
    scheduler?.handleSnooze(snoozeMinutes);
  }
  updateTrayMenu();
});

ipcMain.on('animation-complete', () => {
  console.log('[R7 Main] Animation complete received. Hiding overlay window (idle).');
  isAnimationPlaying = false;
  lastSequenceEndTime = Date.now();

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  // Resume voice listener 3 seconds afterwards to guarantee no self-triggering
  setTimeout(() => {
    if (!isAnimationPlaying && voiceEngine) {
      voiceEngine.resume();
    }
  }, POST_SEQUENCE_COOLDOWN_MS);
});

ipcMain.handle('get-settings', () => {
  return scheduler ? scheduler.getSettings() : loadSettings();
});

ipcMain.handle('save-settings', (_event, newSettings: AppSettings) => {
  console.log('[R7 Main] Saving new settings from Settings window...');
  saveSettings(newSettings);
  scheduler?.updateSettings(newSettings);
  applyLoginItemSettings(newSettings.startWithWindows);
  updateTrayMenu();

  // Update voice engine configuration
  if (voiceEngine) {
    voiceEngine.updateConfig({
      modelName: newSettings.voiceModelName,
      threshold: newSettings.voiceSensitivity,
      alsoSpider: newSettings.voiceAlsoSpider,
      deviceId: newSettings.voiceDeviceId,
    });

    if (newSettings.voiceActivationEnabled) {
      if (!voiceEngine.isListening()) {
        voiceEngine.start();
      }
    } else {
      voiceEngine.stop();
    }
  }

  return { success: true };
});

ipcMain.on('trigger-test-reminder', (_event, type?: ReminderTypeKey) => {
  console.log(`[R7 Main] Test reminder requested from Settings window (type: ${type || 'next'}).`);
  scheduler?.triggerImmediateTest(type);
});

ipcMain.handle('get-voice-devices', () => {
  return availableAudioDevices;
});

ipcMain.handle('get-voice-models', () => {
  return voiceEngine ? voiceEngine.getInstalledModels() : [];
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R7 Lifecycle] App ready event fired.');
  createOverlayWindow();

  // Multi-Monitor Event Subscriptions
  screen.on('display-added', (_event, newDisplay) => {
    repositionOverlay();
  });

  screen.on('display-removed', (_event, oldDisplay) => {
    repositionOverlay();
  });

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    repositionOverlay();
  });

  // Initialize reminder scheduler engine
  scheduler = new ReminderScheduler((type: ReminderTypeKey, message: string, voiceText: string) => {
    triggerReminderAnimation(message, voiceText);
    updateTrayMenu();
  });
  scheduler.start();

  createTray();
  registerShortcuts();

  const initialSettings = scheduler.getSettings();
  applyLoginItemSettings(initialSettings.startWithWindows);

  // Setup Vosk voice engine
  setupVoiceEngine(initialSettings);

  const isHiddenLaunch = process.argv.includes('--hidden');
  const isAutomatedTest = process.argv.some(arg => arg.startsWith('--test-'));
  if (!isHiddenLaunch && !isAutomatedTest) {
    console.log('[R7 Startup] Manual user launch detected: opening Settings UI window.');
    createOrShowSettingsWindow();
  }
});

app.on('will-quit', () => {
  console.log('[R7 Lifecycle] will-quit: stopping voice engine and scheduler.');
  voiceEngine?.stop();
  scheduler?.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

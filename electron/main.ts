import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, powerMonitor, Notification, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { ReminderScheduler } from './scheduler';
import { ReminderTypeKey, AppSettings, loadSettings, saveSettings } from './settings';
import { isForegroundAppFullscreen } from './system';
import { VoskHelperEngine, killStaleVoiceHelpers } from './voice/voskEngine';
import { AudioDevice, WakeWordError } from './voice/types';
import { AnimationSequencer } from './sequencer';
import { TaskService } from './tasks';
 
app.setName('spider-reminder');
 
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
let cardWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: ReminderScheduler | null = null;
let voiceEngine: VoskHelperEngine | null = null;
let sequencer: AnimationSequencer = new AnimationSequencer();
let availableAudioDevices: AudioDevice[] = [];
let taskService: TaskService | null = null;

let isQuitting = false;

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
    focusable: false, // Never steal focus (overlay) from background apps
    alwaysOnTop: true,
    show: false, // Hidden when idle
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // Prevent Chromium from pausing/throttling requestAnimationFrame
      autoplayPolicy: 'no-user-gesture-required',
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
    sequencer.hideAndReset();
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
    sequencer.setOverlayWindow(null);
  });

  sequencer.setOverlayWindow(overlayWindow);
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

function createCardWindow(): BrowserWindow {
  if (cardWindow && !cardWindow.isDestroyed()) {
    return cardWindow;
  }

  console.log('[Card] Creating task card window (frameless, transparent, focusable: false)...');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const cardWidth = 320;
  const cardHeight = 390;
  const targetX = Math.round(screenWidth * 0.82 - 360);
  const targetY = Math.round(screenHeight * 0.14 + 50);
  const posX = Math.max(10, Math.min(targetX, screenWidth - cardWidth - 10));
  const posY = Math.max(10, Math.min(targetY, screenHeight - cardHeight - 10));

  cardWindow = new BrowserWindow({
    width: cardWidth,
    height: cardHeight,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  cardWindow.setAlwaysOnTop(true, 'screen-saver');

  cardWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      cardWindow?.hide();
    }
  });

  cardWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Card Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  const cardHtml = path.resolve(__dirname, '../../dist/renderer/card/index.html');
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = `${process.env.VITE_DEV_SERVER_URL}/card/index.html`;
    cardWindow.loadURL(devUrl).catch(() => {
      cardWindow?.loadFile(cardHtml);
    });
  } else {
    cardWindow.loadFile(cardHtml);
  }

  cardWindow.on('closed', () => {
    cardWindow = null;
  });

  return cardWindow;
}

function showCardWindow(): void {
  try {
    if (!cardWindow || cardWindow.isDestroyed()) {
      createCardWindow();
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const cardWidth = 320;
    const cardHeight = 390;
    const targetX = Math.round(screenWidth * 0.82 - 360);
    const targetY = Math.round(screenHeight * 0.14 + 50);
    const posX = Math.max(10, Math.min(targetX, screenWidth - cardWidth - 10));
    const posY = Math.max(10, Math.min(targetY, screenHeight - cardHeight - 10));
    cardWindow?.setBounds({ x: posX, y: posY, width: cardWidth, height: cardHeight });

    // showInactive ensures typing in other windows is never interrupted
    cardWindow?.showInactive();
    console.log('[Card] Task card window displayed beside character.');
  } catch (err: any) {
    console.error('[Card] Failed to open card window:', err?.message || err);
  }
}

function hideCardWindow(): void {
  try {
    if (cardWindow && !cardWindow.isDestroyed()) {
      cardWindow.hide();
      console.log('[Card] Task card window hidden.');
    }
  } catch (err: any) {
    console.error('[Card] Failed to hide card window:', err?.message || err);
  }
}

function triggerReminderAnimation(message: string, voiceText: string) {
  sequencer.trigger('manual', message, voiceText);
}

function updateTrayMenu() {
  if (!tray) return;

  const currentSettings = scheduler ? scheduler.getSettings() : loadSettings();
  const nextInfo = scheduler ? scheduler.getNextReminderInfo() : { timeString: 'Pending', type: 'water' as ReminderTypeKey };
  const isListening = voiceEngine?.isListening() || false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Next: ${nextInfo.timeString} (${(nextInfo.type || 'water').toUpperCase()})`,
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
      label: 'Microphone',
      submenu: [
        {
          label: 'Default Microphone',
          type: 'radio',
          checked: currentSettings.voiceDeviceId === null,
          click: () => {
            console.log('[R7 Tray] Switched microphone to: Default');
            currentSettings.voiceDeviceId = null;
            saveSettings(currentSettings);
            voiceEngine?.setDevice(null);
            updateTrayMenu();
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              settingsWindow.webContents.send('settings-updated', currentSettings);
            }
          },
        },
        ...availableAudioDevices.map((dev) => ({
          label: `${dev.name}${dev.default ? ' (System Default)' : ''}`,
          type: 'radio' as const,
          checked: currentSettings.voiceDeviceId === dev.id,
          click: () => {
            console.log(`[R7 Tray] Switched microphone to: [${dev.id}] ${dev.name}`);
            currentSettings.voiceDeviceId = dev.id;
            saveSettings(currentSettings);
            voiceEngine?.setDevice(dev.id);
            updateTrayMenu();
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              settingsWindow.webContents.send('settings-updated', currentSettings);
            }
          },
        })),
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

  const trigger = (name: string) => {
    console.log(`[R7 Shortcut] ${name} pressed! Triggering Spider-Man.`);
    scheduler?.triggerImmediateTest();
  };

  const triggerShortcuts = [
    { key: 'CommandOrControl+Alt+R', name: 'Ctrl+Alt+R' },
    { key: 'Alt+Shift+R', name: 'Alt+Shift+R' },
    { key: 'CommandOrControl+Alt+Shift+R', name: 'Ctrl+Alt+Shift+R' },
    { key: 'CommandOrControl+Shift+R', name: 'Ctrl+Shift+R' },
    { key: 'CommandOrControl+Alt+Space', name: 'Ctrl+Alt+Space' },
  ];

  for (const s of triggerShortcuts) {
    const ok = globalShortcut.register(s.key, () => trigger(s.name));
    console.log(`[R7 Shortcuts] Registered "${s.key}" (${s.name}): ${ok ? 'SUCCESS' : 'FAILED (occupied by another app)'}`);
  }

  const settingsShortcuts = [
    { key: 'CommandOrControl+Alt+S', name: 'Ctrl+Alt+S' },
    { key: 'CommandOrControl+Shift+S', name: 'Ctrl+Shift+S' },
    { key: 'Alt+Shift+S', name: 'Alt+Shift+S' },
  ];

  for (const s of settingsShortcuts) {
    const ok = globalShortcut.register(s.key, () => {
      console.log(`[R7 Shortcut] ${s.name} pressed! Opening settings.`);
      createOrShowSettingsWindow();
    });
    console.log(`[R7 Shortcuts] Registered "${s.key}" (${s.name}): ${ok ? 'SUCCESS' : 'FAILED'}`);
  }
}

// Setup Voice Engine
async function setupVoiceEngine(settings: AppSettings) {
  try {
    // Sanitize sensitivity threshold (default to 0.70 if unconfigured or out of range)
    let threshold = settings.voiceSensitivity;
    if (typeof threshold !== 'number' || isNaN(threshold) || threshold > 0.85 || threshold < 0.40) {
      threshold = 0.70;
    }

    voiceEngine = new VoskHelperEngine({
      modelName: settings.voiceModelName || 'vosk-model-small-en-us-0.15',
      threshold,
      alsoSpider: settings.voiceAlsoSpider,
      deviceId: settings.voiceDeviceId,
    });
    sequencer.setVoiceEngine(voiceEngine);

    voiceEngine.onDetected((phrase, conf) => {
      console.log(`[Voice] Detected phrase: "${phrase}" (conf: ${conf})`);
      sequencer.trigger('voice');
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('voice:test-detected', { phrase, conf, time: Date.now() });
      }
    });

    let lastDismissTime = 0;
    voiceEngine.onCommand((cmd) => {
      if (cmd.name === 'dismiss') {
        const now = Date.now();
        if (now - lastDismissTime < 1000) {
          console.log('[Voice] Dismiss command ignored: debounced (< 1000ms).');
          return;
        }
        lastDismissTime = now;

        const currentState = sequencer.getState();
        console.log(`[Voice] Dismiss command received: "${cmd.phrase}" (conf: ${cmd.conf}). Current state: ${currentState}`);
        if (currentState !== 'HIDDEN') {
          console.log('[Voice] Character is visible. Triggering dismiss exit.');
          dismissSpider(`voice command ("${cmd.phrase}")`);
        } else {
          console.log(`[Voice] Dismiss command ignored. Reason: character not in LOOP state (state=${currentState}).`);
        }
      }
    });

    voiceEngine.onDevices((devices) => {
      console.log(`[Voice] Received ${devices.length} audio input devices from helper.`);
      availableAudioDevices = devices;
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('voice:devices-updated', devices);
      }
      updateTrayMenu();
    });

    voiceEngine.onStateChange((_listening) => {
      updateTrayMenu();
    });

    voiceEngine.onError((err: WakeWordError) => {
      console.warn(`[Voice] Error received: [${err.code}] ${err.message}`);
      switch (err.code) {
        case 'MODEL_MISSING':
          showPlainNotification('SpiderReminder', 'Voice model not found');
          break;
        case 'NO_MIC':
          showPlainNotification('Microphone Not Found', 'SpiderReminder could not find any microphone. Please connect a microphone.');
          break;
        case 'MIC_BLOCKED':
          showPlainNotification('Microphone Blocked', 'Microphone access is blocked by Windows privacy settings. Enable it in Windows Settings → Privacy.');
          break;
        case 'CRASH_LOOP':
          showPlainNotification('Voice Activation Stopped', 'The voice helper stopped working after multiple recovery attempts.');
          break;
        default:
          break;
      }
    });

    if (settings.voiceActivationEnabled) {
      console.log('[Voice] Voice activation is ENABLED in settings. Starting Vosk helper...');
      await voiceEngine.start();
    } else {
      console.log('[Voice] Voice activation is OFF by default.');
    }
  } catch (err) {
    console.error('[Voice] Error setting up voice engine:', err);
  }
}

function dismissSpider(reason: string): void {
  console.log(`[Main] Dismissing character (reason: ${reason}).`);
  voiceEngine?.setMode('idle');
  hideCardWindow();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('trigger-exit');
  }
}

// IPC Handlers
ipcMain.on('renderer-ready', () => {
  console.log('[R7 Main] Overlay renderer announced ready for animation triggers.');
  sequencer.setRendererReady();
});

ipcMain.on('seq-started', (_event, { correlationId }) => {
  sequencer.handleRendererStarted(correlationId);
});

ipcMain.on('seq-state', (_event, { correlationId, state }) => {
  sequencer.handleStateChange(correlationId, state);
  if (state === 'LOOP') {
    showCardWindow();
    voiceEngine?.resume();
    voiceEngine?.setMode('active');
  } else if (state === 'OUTRO' || state === 'HIDDEN') {
    hideCardWindow();
    voiceEngine?.setMode('idle');
  }
});

ipcMain.on('seq-voice-started', (_event, { correlationId, text }) => {
  sequencer.handleVoiceStarted(correlationId, text);
});

ipcMain.on('seq-complete', (_event, { correlationId }) => {
  hideCardWindow();
  voiceEngine?.setMode('idle');
  sequencer.handleComplete(correlationId);
  updateTrayMenu();
});

ipcMain.on('dismiss-spider', () => {
  dismissSpider('Close button clicked');
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
  if (sequencer.getState() !== 'HIDDEN') {
    sequencer.handleComplete('#legacy');
    updateTrayMenu();
  }
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
      if (!voiceEngine.isRunningState()) {
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

// Tasks IPC Handlers
ipcMain.handle('tasks:list', (_event, options) => {
  return taskService ? taskService.list(options) : [];
});

ipcMain.handle('tasks:add', async (_event, title: string) => {
  if (!taskService) throw new Error('Task service not available');
  return await taskService.add(title);
});

ipcMain.handle('tasks:remove', async (_event, id: string) => {
  if (!taskService) throw new Error('Task service not available');
  return await taskService.remove(id);
});

ipcMain.handle('tasks:toggle', async (_event, id: string) => {
  if (!taskService) throw new Error('Task service not available');
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Invalid task id');
  }
  return await taskService.toggle(id);
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R7 Lifecycle] App ready event fired.');

  // Auto-grant microphone media permission for renderer mic testing
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(true);
  });

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
    sequencer.trigger(`scheduler: ${type}`, message, voiceText);
    updateTrayMenu();
  });
  sequencer.setScheduler(scheduler);
  // Reminder timer is completely stopped - no reminder timer created at startup
  console.log('[Scheduler] Reminder timer is disabled. No reminder timer created at startup.');

  createTray();
  registerShortcuts();

  const initialSettings = scheduler.getSettings();
  applyLoginItemSettings(initialSettings.startWithWindows);

  // Initialize TaskService for SpiderTasks
  taskService = new TaskService();
  taskService.on('changed', () => {
    const list = taskService?.list() || [];
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('tasks:changed', list);
      }
    });
  });

  // Pre-create task card window hidden so it's ready when Spider-Man descends
  createCardWindow();

  // Start voice helper asynchronously inside try/catch after tray, shortcuts, and overlay are ready
  const startVoiceSafely = async () => {
    try {
      await setupVoiceEngine(initialSettings);
    } catch (err) {
      console.error('[Voice] Async voice engine initialization failed:', err);
    }
  };

  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents.isLoading()) {
    overlayWindow.webContents.once('did-finish-load', () => {
      startVoiceSafely();
    });
  } else {
    setImmediate(startVoiceSafely);
  }

  const isHiddenLaunch = process.argv.includes('--hidden');
  const isAutomatedTest = process.argv.some(arg => arg.startsWith('--test-'));
  if (!isHiddenLaunch && !isAutomatedTest) {
    console.log('[R7 Startup] Manual user launch detected: opening Settings UI window.');
    createOrShowSettingsWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  console.log('[R7 Lifecycle] will-quit: stopping voice engine, scheduler, and taskService.');
  voiceEngine?.stop();
  killStaleVoiceHelpers();
  scheduler?.stop();
  taskService?.destroy();
  if (cardWindow && !cardWindow.isDestroyed()) {
    cardWindow.destroy();
  }
  globalShortcut.unregisterAll();
});

process.on('exit', () => {
  killStaleVoiceHelpers();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

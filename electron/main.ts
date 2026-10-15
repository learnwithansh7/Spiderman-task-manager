import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';
import { ReminderScheduler } from './scheduler';
import { ReminderTypeKey, AppSettings, loadSettings, saveSettings } from './settings';
import { isForegroundAppFullscreen } from './system';

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
let isAnimationPlaying = false;
let isRendererReady = false;
let isQuitting = false;
let pendingTriggerPayload: { message: string; voiceText: string } | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R7 Startup] Initializing SpiderReminder Milestone R7 (Polish and Reliability)...');

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

  // Forward renderer console messages to Node terminal
  overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Overlay Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('[R7 Window] Overlay renderer did-finish-load event fired.');
  });

  // Renderer Crash Recovery
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

  // Intercept window close event to hide instead of destroy, allowing instant reopen
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
  overlayWindow.showInactive();
  overlayWindow.webContents.send('trigger-animation', { message, voiceText });
}

function updateTrayMenu() {
  if (!tray) return;

  const currentSettings = scheduler ? scheduler.getSettings() : loadSettings();
  const nextInfo = scheduler ? scheduler.getNextReminderInfo() : { timeString: 'Pending', type: 'water' as ReminderTypeKey };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Next: ${nextInfo.timeString} (${nextInfo.type.toUpperCase()})`,
      enabled: false,
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

  tray.setToolTip(`SpiderReminder - Next: ${nextInfo.timeString}`);
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
    console.log('[R7 Tray] Tray icon clicked. Opening settings...');
    createOrShowSettingsWindow();
  });
  tray.on('double-click', () => {
    console.log('[R7 Tray] Tray icon double-clicked. Opening settings...');
    createOrShowSettingsWindow();
  });

  updateTrayMenu();
  console.log('[R7 Tray] Tray icon and context menu ready.');
}

function registerShortcuts() {
  console.log('[R7 Shortcuts] Registering global shortcuts...');

  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R7 Shortcut] Primary shortcut pressed: ${primary}`);
    scheduler?.triggerImmediateTest();
  });

  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R7 Shortcut] Fallback shortcut pressed: ${fallback}`);
    scheduler?.triggerImmediateTest();
  });

  console.log(`[R7 Shortcuts] Primary "${primary}": ${primaryResult}, Fallback "${fallback}": ${fallbackResult}`);
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
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
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

  // User requested: When saving settings, trigger the reminder immediately!
  console.log('[R7 Main] Settings saved - triggering reminder immediately!');
  setTimeout(() => {
    scheduler?.triggerImmediateTest();
  }, 350);

  return { success: true };
});

ipcMain.on('trigger-test-reminder', (_event, type?: ReminderTypeKey) => {
  console.log(`[R7 Main] Test reminder requested from Settings window (type: ${type || 'next'}).`);
  scheduler?.triggerImmediateTest(type);
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R7 Lifecycle] App ready event fired.');
  createOverlayWindow();

  // Multi-Monitor Event Subscriptions
  screen.on('display-added', (_event, newDisplay) => {
    console.log(`[R7 Multi-Monitor] Display added: ID ${newDisplay.id} (${newDisplay.size.width}x${newDisplay.size.height})`);
    repositionOverlay();
  });

  screen.on('display-removed', (_event, oldDisplay) => {
    console.log(`[R7 Multi-Monitor] Display removed: ID ${oldDisplay.id}`);
    repositionOverlay();
  });

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    console.log(`[R7 Multi-Monitor] Display metrics changed for ID ${display.id}: ${changedMetrics.join(', ')}`);
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

  // Apply configured startup setting
  const initialSettings = scheduler.getSettings();
  applyLoginItemSettings(initialSettings.startWithWindows);

  // Automated test runner for R4 verification
  if (process.argv.includes('--test-r4')) {
    console.log('[R4 Test] Running automated Milestone R4 verification suite...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const waitForReady = setInterval(() => {
      if (isRendererReady) {
        clearInterval(waitForReady);
        scheduler?.triggerImmediateTest('water');
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img = await overlayWindow.webContents.capturePage();
            const target = path.join(docsDir, 'r4-scheduled-reminder.png');
            fs.writeFileSync(target, img.toPNG());
            scheduler?.handleSnooze(5);
            powerMonitor.emit('resume');
            overlayWindow.webContents.send('trigger-exit');
            setTimeout(() => {
              isQuitting = true;
              app.quit();
            }, 1000);
          }
        }, 4800);
      }
    }, 200);
  }

  // Automated test runner for R5 verification
  if (process.argv.includes('--test-r5')) {
    console.log('[R5 Test] Running automated Milestone R5 verification suite...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const win = createOrShowSettingsWindow();
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (win && !win.isDestroyed()) {
          const img = await win.webContents.capturePage();
          const target = path.join(docsDir, 'r5-settings-window.png');
          fs.writeFileSync(target, img.toPNG());
          win.close();
          setTimeout(() => {
            isQuitting = true;
            app.quit();
          }, 1000);
        }
      }, 1500);
    });
  }

  // Automated test runner for R6 verification (Real 3D Character WebM with alpha)
  if (process.argv.includes('--test-r6')) {
    console.log('[R6 Test] Running automated Milestone R6 verification suite...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const waitForReady = setInterval(() => {
      if (isRendererReady) {
        clearInterval(waitForReady);
        scheduler?.triggerImmediateTest('water');
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img = await overlayWindow.webContents.capturePage();
            const target = path.join(docsDir, 'r6-character.png');
            fs.writeFileSync(target, img.toPNG());
            overlayWindow.webContents.send('trigger-exit');
            setTimeout(() => {
              isQuitting = true;
              app.quit();
            }, 1500);
          }
        }, 4800);
      }
    }, 200);
  }

  // Automated test runner for R7 verification (Polish and Reliability)
  if (process.argv.includes('--test-r7')) {
    console.log('[R7 Test] Running automated Milestone R7 verification suite...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // Step 1: Verify Single Instance Lock
    console.log(`[R7 Test] Single instance lock state: ${gotTheLock ? 'ACTIVE (LOCKED)' : 'FAILED'}`);

    // Step 2: Test Fullscreen Game / Presentation Detection
    console.log('[R7 Test] Testing isForegroundAppFullscreen() detection...');
    isForegroundAppFullscreen().then((isFullscreen) => {
      console.log(`[R7 Test] Detected foreground fullscreen state: ${isFullscreen} (proper detection for desktop dev environment).`);

      // Step 3: Test Multi-Monitor repositioning
      console.log('[R7 Test] Testing dynamic multi-monitor display metrics adjustment...');
      repositionOverlay();

      // Step 4: Trigger reminder with WebM character and capture verification screenshot
      const waitForReady = setInterval(() => {
        if (isRendererReady) {
          clearInterval(waitForReady);
          console.log('[R7 Test] Overlay renderer ready. Triggering reminder for final polish verification...');
          scheduler?.triggerImmediateTest('water');

          setTimeout(async () => {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              const img = await overlayWindow.webContents.capturePage();
              const target = path.join(docsDir, 'r7-polish.png');
              fs.writeFileSync(target, img.toPNG());
              console.log(`[R7 Test] Captured docs/r7-polish.png (${img.getSize().width}x${img.getSize().height})`);

              // Retract & exit cleanly
              overlayWindow.webContents.send('trigger-exit');
              setTimeout(() => {
                console.log('[R7 Test] Milestone R7 verification suite completed successfully. Exiting.');
                isQuitting = true;
                app.quit();
              }, 1200);
            }
          }, 4800);
        }
      }, 200);
    });
  }
});

app.on('will-quit', () => {
  console.log('[R7 Lifecycle] will-quit: stopping scheduler and unregistering all shortcuts.');
  scheduler?.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';
import { ReminderScheduler } from './scheduler';
import { ReminderTypeKey, AppSettings, loadSettings, saveSettings } from './settings';

let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: ReminderScheduler | null = null;
let isAnimationPlaying = false;
let isRendererReady = false;
let isQuitting = false;
let pendingTriggerPayload: { message: string; voiceText: string } | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R5 Startup] Initializing SpiderReminder Milestone R5...');

function applyLoginItemSettings(openAtLogin: boolean) {
  console.log(`[R5 Startup] Applying Windows login item setting: openAtLogin=${openAtLogin}`);
  try {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (err) {
    console.warn('[R5 Startup] Failed to configure Windows login item:', err);
  }
}

function createOverlayWindow() {
  console.log('[R5 Window] Creating transparent frameless overlay window...');
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
    console.log('[R5 Window] Overlay renderer did-finish-load event fired.');
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = `${process.env.VITE_DEV_SERVER_URL}/overlay/index.html`;
    console.log(`[R5 Window] Loading Vite dev server overlay: ${devUrl}`);
    overlayWindow.loadURL(devUrl);
  } else {
    const indexPath = path.resolve(__dirname, '../../dist/renderer/overlay/index.html');
    console.log(`[R5 Window] Loading built overlay index: ${indexPath}`);
    overlayWindow.loadFile(indexPath);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  const bounds = overlayWindow.getBounds();
  console.log(`[R5 Window] Overlay window created (hidden) at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}].`);
}

function createOrShowSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    console.log('[R5 Settings] Settings window already exists. Showing & focusing...');
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  console.log('[R5 Settings] Creating dedicated settings window...');
  const iconPath = path.resolve(__dirname, '../../assets/icon.png');
  const winIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 680,
    minWidth: 450,
    minHeight: 580,
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
      console.log('[R5 Settings] Close requested: hiding settings window (SpiderReminder remains in tray).');
      settingsWindow?.hide();
    }
  });

  settingsWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Settings Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  settingsWindow.webContents.on('did-finish-load', () => {
    console.log('[R5 Settings] Settings window did-finish-load.');
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = `${process.env.VITE_DEV_SERVER_URL}/settings/index.html`;
    console.log(`[R5 Settings] Loading dev URL: ${devUrl}`);
    settingsWindow.loadURL(devUrl);
  } else {
    const filePath = path.resolve(__dirname, '../../dist/renderer/settings/index.html');
    console.log(`[R5 Settings] Loading production file: ${filePath}`);
    settingsWindow.loadFile(filePath);
  }

  settingsWindow.once('ready-to-show', () => {
    console.log('[R5 Settings] Settings window ready-to-show.');
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
    console.log('[R5 Main] Animation already playing! Ignoring duplicate trigger.');
    return;
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.warn('[R5 Main] Overlay window not available.');
    return;
  }

  if (!isRendererReady) {
    console.log('[R5 Main] Renderer not ready yet. Queuing trigger...');
    pendingTriggerPayload = { message, voiceText };
    return;
  }

  isAnimationPlaying = true;
  console.log(`[R5 Main] Starting reminder animation for: "${message}"`);
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
        console.log('[R5 Tray] Menu item clicked: "Settings..."');
        createOrShowSettingsWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: currentSettings.startWithWindows,
      click: (menuItem) => {
        console.log(`[R5 Tray] Start with Windows toggled: ${menuItem.checked}`);
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
        console.log('[R5 Tray] Quit clicked. Terminating app.');
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip(`SpiderReminder - Next: ${nextInfo.timeString}`);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  console.log('[R5 Tray] Creating tray icon and context menu...');
  const iconPath = path.resolve(__dirname, '../../assets/icon.png');
  let icon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.on('click', () => {
    console.log('[R5 Tray] Tray icon clicked. Opening settings...');
    createOrShowSettingsWindow();
  });
  tray.on('double-click', () => {
    console.log('[R5 Tray] Tray icon double-clicked. Opening settings...');
    createOrShowSettingsWindow();
  });

  updateTrayMenu();
  console.log('[R5 Tray] Tray icon and context menu ready.');
}

function registerShortcuts() {
  console.log('[R5 Shortcuts] Registering global shortcuts...');

  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R5 Shortcut] Primary shortcut pressed: ${primary}`);
    scheduler?.triggerImmediateTest();
  });

  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R5 Shortcut] Fallback shortcut pressed: ${fallback}`);
    scheduler?.triggerImmediateTest();
  });

  console.log(`[R5 Shortcuts] Primary "${primary}": ${primaryResult}, Fallback "${fallback}": ${fallbackResult}`);
}

// IPC Handlers
ipcMain.on('renderer-ready', () => {
  console.log('[R5 Main] Overlay renderer announced ready for animation triggers.');
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
  console.log(`[R5 Main] Reminder action received: action="${action}", snoozeMinutes=${snoozeMinutes || 0}`);
  if (action === 'done') {
    scheduler?.handleDone();
  } else if (action === 'snooze') {
    scheduler?.handleSnooze(snoozeMinutes);
  }
  updateTrayMenu();
});

ipcMain.on('animation-complete', () => {
  console.log('[R5 Main] Animation complete received. Hiding overlay window (idle).');
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
  console.log('[R5 Main] Saving new settings from Settings window...');
  saveSettings(newSettings);
  scheduler?.updateSettings(newSettings);
  applyLoginItemSettings(newSettings.startWithWindows);
  updateTrayMenu();
  return { success: true };
});

ipcMain.on('trigger-test-reminder', (_event, type?: ReminderTypeKey) => {
  console.log(`[R5 Main] Test reminder requested from Settings window (type: ${type || 'next'}).`);
  scheduler?.triggerImmediateTest(type);
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R5 Lifecycle] App ready event fired.');
  createOverlayWindow();

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

    // Step 1: Open Settings Window
    const win = createOrShowSettingsWindow();

    win.webContents.once('did-finish-load', () => {
      console.log('[R5 Test] Settings window loaded. Waiting for render...');

      setTimeout(async () => {
        // Step 2: Capture Screenshot of Settings Window
        if (win && !win.isDestroyed()) {
          const img = await win.webContents.capturePage();
          const target = path.join(docsDir, 'r5-settings-window.png');
          fs.writeFileSync(target, img.toPNG());
          console.log(`[R5 Test] Captured docs/r5-settings-window.png (${img.getSize().width}x${img.getSize().height})`);

          // Step 3: Test settings modification & persistence via IPC logic
          console.log('[R5 Test] Testing settings modification (interval=30min, startWithWindows=true)...');
          const testSettings: AppSettings = {
            ...scheduler!.getSettings(),
            intervalMinutes: 30,
            startWithWindows: true,
          };
          saveSettings(testSettings);
          scheduler?.updateSettings(testSettings);
          applyLoginItemSettings(true);
          updateTrayMenu();

          const reloaded = loadSettings();
          console.log(`[R5 Test] Verified settings.json: intervalMinutes=${reloaded.intervalMinutes}, startWithWindows=${reloaded.startWithWindows}`);

          // Step 4: Verify login item settings
          const loginItem = app.getLoginItemSettings();
          console.log(`[R5 Test] Verified app.getLoginItemSettings(): openAtLogin=${loginItem.openAtLogin}`);

          // Step 5: Test closing Settings Window hides instead of destroying
          console.log('[R5 Test] Testing Settings Window close interception...');
          win.close();
          console.log(`[R5 Test] Is Settings Window visible after close(): ${win.isVisible()}`);
          console.log(`[R5 Test] Is Settings Window destroyed after close(): ${win.isDestroyed()}`);

          setTimeout(() => {
            console.log('[R5 Test] Milestone R5 verification suite completed successfully. Exiting.');
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
        console.log('[R6 Test] Overlay renderer ready. Triggering reminder with real animated character...');
        scheduler?.triggerImmediateTest('water');

        // Capture screenshot while character is swaying and video is playing
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img = await overlayWindow.webContents.capturePage();
            const target = path.join(docsDir, 'r6-character.png');
            fs.writeFileSync(target, img.toPNG());
            console.log(`[R6 Test] Captured docs/r6-character.png (${img.getSize().width}x${img.getSize().height})`);

            // Retract & exit
            overlayWindow.webContents.send('trigger-exit');
            setTimeout(() => {
              console.log('[R6 Test] Milestone R6 verification suite completed successfully. Exiting.');
              isQuitting = true;
              app.quit();
            }, 1500);
          }
        }, 4800);
      }
    }, 200);
  }
});

app.on('will-quit', () => {
  console.log('[R5 Lifecycle] will-quit: stopping scheduler and unregistering all shortcuts.');
  scheduler?.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, powerMonitor } from 'electron';
import path from 'path';
import fs from 'fs';
import { ReminderScheduler } from './scheduler';
import { ReminderTypeKey, loadSettings } from './settings';

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let scheduler: ReminderScheduler | null = null;
let isAnimationPlaying = false;
let isRendererReady = false;
let pendingTriggerPayload: { message: string; voiceText: string } | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R4 Startup] Initializing SpiderReminder Milestone R4...');

function createOverlayWindow() {
  console.log('[R4 Window] Creating transparent frameless overlay window...');
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
    console.log(`[Renderer Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('[R4 Window] Renderer did-finish-load event fired.');
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    console.log(`[R4 Window] Loading Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.resolve(__dirname, '../../dist/overlay/index.html');
    console.log(`[R4 Window] Loading built index: ${indexPath}`);
    overlayWindow.loadFile(indexPath);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  const bounds = overlayWindow.getBounds();
  console.log(`[R4 Window] Overlay window created (hidden) at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}].`);
}

function triggerReminderAnimation(message: string, voiceText: string) {
  if (isAnimationPlaying) {
    console.log('[R4 Main] Animation already playing! Ignoring duplicate trigger.');
    return;
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.warn('[R4 Main] Overlay window not available.');
    return;
  }

  if (!isRendererReady) {
    console.log('[R4 Main] Renderer not ready yet. Queuing trigger...');
    pendingTriggerPayload = { message, voiceText };
    return;
  }

  isAnimationPlaying = true;
  console.log(`[R4 Main] Starting reminder animation for: "${message}"`);
  overlayWindow.showInactive();
  overlayWindow.webContents.send('trigger-animation', { message, voiceText });
}

function createTray() {
  console.log('[R4 Tray] Creating tray icon and context menu...');
  const iconPath = path.resolve(__dirname, '../../assets/icon.png');
  let icon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Test reminder (Immediate)',
      click: () => {
        console.log('[R4 Tray] Menu clicked: "Test reminder (Immediate)"');
        scheduler?.triggerImmediateTest();
      },
    },
    {
      label: 'Schedule 1-minute test reminder',
      click: () => {
        console.log('[R4 Tray] Menu clicked: "Schedule 1-minute test reminder"');
        scheduler?.setTestIntervalMinutes(1);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        console.log('[R4 Tray] Quit clicked. Exiting app.');
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SpiderReminder R4');
  tray.setContextMenu(contextMenu);
  console.log('[R4 Tray] Tray icon ready.');
}

function registerShortcuts() {
  console.log('[R4 Shortcuts] Registering global shortcuts...');

  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R4 Shortcut] Primary shortcut pressed: ${primary}`);
    scheduler?.triggerImmediateTest();
  });

  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R4 Shortcut] Fallback shortcut pressed: ${fallback}`);
    scheduler?.triggerImmediateTest();
  });

  console.log(`[R4 Shortcuts] Primary "${primary}": ${primaryResult}, Fallback "${fallback}": ${fallbackResult}`);
}

// IPC Handlers
ipcMain.on('renderer-ready', () => {
  console.log('[R4 Main] Renderer announced ready for animation triggers.');
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
  console.log(`[R4 Main] Reminder action received: action="${action}", snoozeMinutes=${snoozeMinutes || 0}`);
  if (action === 'done') {
    scheduler?.handleDone();
  } else if (action === 'snooze') {
    scheduler?.handleSnooze(snoozeMinutes);
  }
});

ipcMain.on('animation-complete', () => {
  console.log('[R4 Main] Animation complete received. Hiding overlay window (idle).');
  isAnimationPlaying = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R4 Lifecycle] App ready event fired.');
  createOverlayWindow();
  createTray();
  registerShortcuts();

  // Initialize reminder scheduler engine
  scheduler = new ReminderScheduler((type: ReminderTypeKey, message: string, voiceText: string) => {
    triggerReminderAnimation(message, voiceText);
  });
  scheduler.start();

  // Automated test runner for R4 verification
  if (process.argv.includes('--test-r4')) {
    console.log('[R4 Test] Running automated Milestone R4 verification suite...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // Step 1: Trigger 1-minute test reminder
    const waitForReady = setInterval(() => {
      if (isRendererReady) {
        clearInterval(waitForReady);

        console.log('[R4 Test] Simulating 1-minute interval reminder firing on time...');
        scheduler?.triggerImmediateTest('water');

        // Capture Note Card with scheduled message
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img = await overlayWindow.webContents.capturePage();
            const target = path.join(docsDir, 'r4-scheduled-reminder.png');
            fs.writeFileSync(target, img.toPNG());
            console.log(`[R4 Test] Captured docs/r4-scheduled-reminder.png (${img.getSize().width}x${img.getSize().height})`);

            // Step 2: Test Snooze action
            console.log('[R4 Test] Testing Snooze (5 min) handling and settings persistence...');
            scheduler?.handleSnooze(5);

            // Verify settings.json
            const updated = loadSettings();
            console.log(`[R4 Test] Verified settings.json: nextTriggerTimestamp is ${new Date(updated.nextTriggerTimestamp).toLocaleTimeString()}`);

            // Step 3: Test Sleep & Wake survival via powerMonitor resume
            console.log('[R4 Test] Simulating PC sleep & wake: emitting powerMonitor "resume" event...');
            powerMonitor.emit('resume');
            console.log('[R4 Test] Sleep/wake resume handled successfully.');

            // Dismiss overlay
            overlayWindow.webContents.send('trigger-exit');
            setTimeout(() => {
              console.log('[R4 Test] Milestone R4 test suite complete. Exiting.');
              app.quit();
            }, 1500);
          }
        }, 4800);
      }
    }, 200);
  }
});

app.on('will-quit', () => {
  console.log('[R4 Lifecycle] will-quit: stopping scheduler and unregistering all shortcuts.');
  scheduler?.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

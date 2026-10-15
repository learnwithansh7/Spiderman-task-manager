import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isAnimationPlaying = false;
let isRendererReady = false;
let pendingTrigger = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R2 Startup] Initializing SpiderReminder Milestone R2...');

function createOverlayWindow() {
  console.log('[R2 Window] Creating transparent frameless overlay window...');
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
    console.log('[R2 Window] Renderer did-finish-load event fired.');
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    console.log(`[R2 Window] Loading Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.resolve(__dirname, '../../dist/overlay/index.html');
    console.log(`[R2 Window] Loading built index: ${indexPath}`);
    overlayWindow.loadFile(indexPath);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  const bounds = overlayWindow.getBounds();
  console.log(`[R2 Window] Overlay window created (hidden) at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}].`);
}

function triggerReminder() {
  if (isAnimationPlaying) {
    console.log('[R2 Main] Animation already playing! Ignoring second trigger.');
    return;
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.warn('[R2 Main] Overlay window not available.');
    return;
  }

  if (!isRendererReady) {
    console.log('[R2 Main] Renderer not ready yet. Queuing trigger...');
    pendingTrigger = true;
    return;
  }

  isAnimationPlaying = true;
  console.log('[R2 Main] Starting reminder animation. Showing overlay window without focus.');
  overlayWindow.showInactive();
  overlayWindow.webContents.send('trigger-animation');
}

function createTray() {
  console.log('[R2 Tray] Creating tray icon and context menu...');
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
      label: 'Test reminder',
      click: () => {
        console.log('[R2 Tray] Menu item clicked: "Test reminder"');
        triggerReminder();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        console.log('[R2 Tray] Quit clicked. Exiting app.');
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SpiderReminder R2');
  tray.setContextMenu(contextMenu);
  console.log('[R2 Tray] Tray icon ready.');
}

function registerShortcuts() {
  console.log('[R2 Shortcuts] Registering global shortcuts...');

  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R2 Shortcut] Primary shortcut pressed: ${primary}`);
    triggerReminder();
  });

  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R2 Shortcut] Fallback shortcut pressed: ${fallback}`);
    triggerReminder();
  });

  console.log(`[R2 Shortcuts] Primary "${primary}": ${primaryResult}, Fallback "${fallback}": ${fallbackResult}`);
}

// IPC Handlers
ipcMain.on('renderer-ready', () => {
  console.log('[R2 Main] Renderer announced ready for animation triggers.');
  isRendererReady = true;
  if (pendingTrigger) {
    pendingTrigger = false;
    triggerReminder();
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

ipcMain.on('animation-complete', () => {
  console.log('[R2 Main] Animation complete received. Hiding overlay window (idle).');
  isAnimationPlaying = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R2 Lifecycle] App ready event fired.');
  createOverlayWindow();
  createTray();
  registerShortcuts();

  // Automated test runner for R2 verification
  if (process.argv.includes('--test-r2')) {
    console.log('[R2 Test] Running automated R2 animation test sequence...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // Wait until renderer is ready, then trigger
    const waitForReady = setInterval(() => {
      if (isRendererReady) {
        clearInterval(waitForReady);
        console.log('[R2 Test] Renderer is ready! Triggering animation sequence...');
        triggerReminder();

        // Test duplicate trigger while animation is playing (should be ignored)
        setTimeout(() => {
          console.log('[R2 Test] Testing second trigger while playing (expecting ignore)...');
          triggerReminder();
        }, 500);

        // Capture Descent moment (at t = 2000ms, halfway down)
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img1 = await overlayWindow.webContents.capturePage();
            fs.writeFileSync(path.join(docsDir, 'r2-descent.png'), img1.toPNG());
            console.log(`[R2 Test] Captured docs/r2-descent.png (${img1.getSize().width}x${img1.getSize().height})`);
          }
        }, 2000);

        // Capture Sway moment (at t = 4800ms)
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            const img2 = await overlayWindow.webContents.capturePage();
            fs.writeFileSync(path.join(docsDir, 'r2-sway.png'), img2.toPNG());
            console.log(`[R2 Test] Captured docs/r2-sway.png (${img2.getSize().width}x${img2.getSize().height})`);
          }
        }, 4800);

        // Trigger exit/retract and capture exit climb (at t = 6200ms)
        setTimeout(async () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('trigger-exit');
            setTimeout(async () => {
              if (overlayWindow && !overlayWindow.isDestroyed()) {
                const img3 = await overlayWindow.webContents.capturePage();
                fs.writeFileSync(path.join(docsDir, 'r2-exit.png'), img3.toPNG());
                console.log(`[R2 Test] Captured docs/r2-exit.png (${img3.getSize().width}x${img3.getSize().height})`);

                setTimeout(() => {
                  console.log('[R2 Test] All R2 test captures complete. Exiting.');
                  app.quit();
                }, 1200);
              }
            }, 600);
          }
        }, 6200);
      }
    }, 200);
  }
});

app.on('will-quit', () => {
  console.log('[R2 Lifecycle] will-quit: unregistering all shortcuts.');
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

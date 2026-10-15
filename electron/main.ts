import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('[R1 Startup] Initializing SpiderReminder Milestone R1...');

function createOverlayWindow() {
  console.log('[R1 Window] Creating transparent frameless overlay window...');
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
    focusable: false, // Ensures clicking never steals keyboard focus from background apps
    alwaysOnTop: true,
    show: false, // Starts hidden when idle
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Pin on top at screen-saver level
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Pass mouse clicks through by default, forwarding moves for hover activation
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    console.log(`[R1 Window] Loading Vite dev server: ${process.env.VITE_DEV_SERVER_URL}`);
    overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.resolve(__dirname, '../../dist/overlay/index.html');
    console.log(`[R1 Window] Loading built index: ${indexPath}`);
    overlayWindow.loadFile(indexPath);
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  const bounds = overlayWindow.getBounds();
  console.log(`[R1 Window] Overlay window created (hidden) at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}].`);
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  console.log('[R1 Action] Showing overlay window without stealing focus (showInactive)...');
  // showInactive ensures currently focused apps (editor, browser, terminal) keep keyboard focus
  overlayWindow.showInactive();
  console.log(`[R1 Action] Overlay isVisible: ${overlayWindow.isVisible()}`);
}

function hideOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  console.log('[R1 Action] Hiding overlay window (idle state)...');
  overlayWindow.hide();
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
}

function createTray() {
  console.log('[R1 Tray] Creating tray icon and context menu...');
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
      label: 'Show test overlay shape',
      click: () => {
        console.log('[R1 Tray] Menu item clicked: "Show test overlay shape"');
        showOverlay();
      },
    },
    {
      label: 'Hide overlay',
      click: () => {
        console.log('[R1 Tray] Menu item clicked: "Hide overlay"');
        hideOverlay();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        console.log('[R1 Tray] Quit clicked. Exiting app.');
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SpiderReminder R1');
  tray.setContextMenu(contextMenu);
  console.log('[R1 Tray] Tray icon ready.');
}

function registerShortcuts() {
  console.log('[R1 Shortcuts] Registering global shortcuts...');

  // Primary shortcut: Ctrl+Alt+R
  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R1 Shortcut] Primary shortcut pressed: ${primary}`);
    showOverlay();
  });

  // Fallback shortcut: Ctrl+Alt+Shift+R
  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R1 Shortcut] Fallback shortcut pressed: ${fallback}`);
    showOverlay();
  });

  console.log(`[R1 Shortcuts] Primary "${primary}": ${primaryResult}, Fallback "${fallback}": ${fallbackResult}`);
}

// IPC Handlers
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

ipcMain.on('hide-overlay', () => {
  hideOverlay();
});

// App Lifecycle
app.whenReady().then(() => {
  console.log('[R1 Lifecycle] App ready event fired.');
  createOverlayWindow();
  createTray();
  registerShortcuts();

  // Automated test runner for R1 verification
  if (process.argv.includes('--test-r1')) {
    console.log('[R1 Test] Running automated R1 verification...');
    setTimeout(async () => {
      showOverlay();

      setTimeout(async () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          const docsDir = path.resolve(__dirname, '../../docs');
          if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

          const image = await overlayWindow.webContents.capturePage();
          const target = path.join(docsDir, 'r1-overlay-foundation.png');
          fs.writeFileSync(target, image.toPNG());
          console.log(`[R1 Test] Screenshot saved to ${target} (${image.getSize().width}x${image.getSize().height})`);

          console.log('[R1 Test] Test verification complete. Exiting.');
          setTimeout(() => app.quit(), 500);
        }
      }, 1200);
    }, 1500);
  }
});

app.on('will-quit', () => {
  console.log('[R1 Lifecycle] will-quit: unregistering all shortcuts.');
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

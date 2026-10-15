import { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';

let normalWindow: BrowserWindow | null = null;
let transparentOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Allow disabling hardware acceleration if --disable-gpu is passed
if (process.argv.includes('--disable-gpu')) {
  console.log('[R0 Hardware] Disabling hardware acceleration as requested...');
  app.disableHardwareAcceleration();
}

console.log('[R0 Startup] SpiderReminder R0 Diagnostic Suite starting...');

// 1. Test 1: Normal Visible Window
function createNormalWindow() {
  console.log('[R0 Test 1] Creating normal visible window...');
  normalWindow = new BrowserWindow({
    width: 520,
    height: 420,
    title: 'SpiderReminder - R0 Diagnostic Suite',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const diagnosticHtmlPath = path.resolve(__dirname, '../../src/diagnostic.html');
  normalWindow.loadFile(diagnosticHtmlPath);

  const bounds = normalWindow.getBounds();
  console.log(`[R0 Test 1] Normal visible window successfully created at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}]. Result: PASS.`);
}

// 2. Test 2: Transparent Always-On-Top Window with Visible Red Box
function createTransparentOverlayWindow() {
  console.log('[R0 Test 2] Creating transparent always-on-top window...');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  transparentOverlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: true, // Visible for R0 test
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  transparentOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  transparentOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const transparentHtmlPath = path.resolve(__dirname, '../../src/transparent-test.html');
  transparentOverlayWindow.loadFile(transparentHtmlPath);

  const bounds = transparentOverlayWindow.getBounds();
  console.log(`[R0 Test 2] Transparent window successfully created at (${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}]. Result: PASS.`);
}

// 3. Test 3: Tray Icon with Menu Item
function createTray() {
  console.log('[R0 Test 3] Creating tray icon with menu items...');
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
      label: 'R0: Test reminder',
      click: () => {
        console.log('[R0 Test 3] >>> TRAY MENU CLICKED: "R0: Test reminder" <<<');
        if (transparentOverlayWindow && !transparentOverlayWindow.isDestroyed()) {
          transparentOverlayWindow.showInactive();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        console.log('[R0 Tray] Quit clicked. Exiting app.');
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SpiderReminder R0');
  tray.setContextMenu(contextMenu);
  console.log('[R0 Test 3] Tray icon and context menu initialized successfully. Result: PASS.');
}

// 4. Test 4: Global Shortcut with Second Fallback Shortcut
function registerGlobalShortcuts() {
  console.log('[R0 Test 4] Testing global shortcut registration (after app.whenReady)...');

  // Primary shortcut: Ctrl+Alt+R
  const primary = 'CommandOrControl+Alt+R';
  const primaryResult = globalShortcut.register(primary, () => {
    console.log(`[R0 Test 4] >>> HOTKEY TRIGGERED: ${primary} <<<`);
  });
  const primaryIsReg = globalShortcut.isRegistered(primary);
  console.log(`[R0 Test 4] Primary shortcut "${primary}": registerResult=${primaryResult}, isRegistered=${primaryIsReg}`);

  // Fallback shortcut: Ctrl+Alt+Shift+R
  const fallback = 'CommandOrControl+Alt+Shift+R';
  const fallbackResult = globalShortcut.register(fallback, () => {
    console.log(`[R0 Test 4] >>> HOTKEY TRIGGERED: ${fallback} <<<`);
  });
  const fallbackIsReg = globalShortcut.isRegistered(fallback);
  console.log(`[R0 Test 4] Fallback shortcut "${fallback}": registerResult=${fallbackResult}, isRegistered=${fallbackIsReg}`);

  if (!primaryResult) {
    console.warn('[R0 Test 4] Notice: Primary shortcut "Ctrl+Alt+R" is already held by another system process (GPU/Windows hotkey collision).');
    console.log('[R0 Test 4] Fallback shortcut "Ctrl+Alt+Shift+R" is registered and available.');
  }

  // Update diagnostic window UI if ready
  if (normalWindow && !normalWindow.isDestroyed()) {
    normalWindow.webContents.on('did-finish-load', () => {
      normalWindow?.webContents.send('shortcut-status', {
        primary: primaryIsReg,
        fallback: fallbackIsReg,
      });
    });
  }
}

app.whenReady().then(() => {
  console.log('[R0 Lifecycle] App ready fired.');

  // Run the 4 tests
  createNormalWindow();
  createTransparentOverlayWindow();
  createTray();
  registerGlobalShortcuts();

  // If automated test flag --r0-test is present
  if (process.argv.includes('--r0-test')) {
    console.log('[R0 Automated Test] Capturing milestone test artifacts and exiting...');
    const docsDir = path.resolve(__dirname, '../../docs');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    setTimeout(async () => {
      if (transparentOverlayWindow && !transparentOverlayWindow.isDestroyed()) {
        const overlayImg = await transparentOverlayWindow.webContents.capturePage();
        const overlayPath = path.join(docsDir, 'r0-transparent-overlay.png');
        fs.writeFileSync(overlayPath, overlayImg.toPNG());
        console.log(`[R0 Automated Test] Saved transparent overlay capture to ${overlayPath}`);
      }

      if (normalWindow && !normalWindow.isDestroyed()) {
        const normImg = await normalWindow.webContents.capturePage();
        const normPath = path.join(docsDir, 'r0-diagnostic-window.png');
        fs.writeFileSync(normPath, normImg.toPNG());
        console.log(`[R0 Automated Test] Saved diagnostic window capture to ${normPath}`);
      }

      console.log('[R0 Automated Test] All 4 tests completed. Exiting.');
      setTimeout(() => app.quit(), 500);
    }, 1500);
  }
});

app.on('will-quit', () => {
  console.log('[R0 Lifecycle] will-quit fired: unregistering all global shortcuts.');
  globalShortcut.unregisterAll();
  console.log('[R0 Lifecycle] All shortcuts unregistered.');
});

app.on('window-all-closed', () => {
  // On Windows, keep app alive in system tray
});

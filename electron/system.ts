import { exec } from 'child_process';
import path from 'path';
import { screen } from 'electron';

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/check-fullscreen.ps1');

/**
 * Checks if the currently focused / foreground application is running in fullscreen mode
 * (such as a fullscreen game, video player, or presentation).
 */
export function isForegroundAppFullscreen(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" -width ${width} -height ${height}`;

      exec(cmd, { timeout: 2000 }, (err, stdout) => {
        if (err) {
          // If the check fails or times out, fail-safe to false so reminders aren't permanently blocked
          return resolve(false);
        }
        const isFullscreen = stdout.trim().toLowerCase() === 'true';
        resolve(isFullscreen);
      });
    } catch {
      resolve(false);
    }
  });
}

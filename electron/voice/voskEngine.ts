import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import {
  WakeWordEngine,
  WakeWordDetectedCallback,
  WakeWordErrorCallback,
  WakeWordDevicesCallback,
  WakeWordStateCallback,
  WakeWordError,
  AudioDevice,
} from './types';

export interface VoskEngineOptions {
  modelName?: string;
  threshold?: number;
  alsoSpider?: boolean;
  deviceId?: number | null;
}

/**
 * Resolves the absolute project root directory by traversing upwards until package.json is found.
 */
export function getProjectRoot(): string {
  let dir = __dirname;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Force kills any stale python.exe processes running voice_helper.py to ensure single helper instance.
 */
export function killStaleVoiceHelpers(): void {
  try {
    if (process.platform === 'win32') {
      execSync(
        'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'python.exe\'\\" | Where-Object { $_.CommandLine -like \'*voice_helper.py*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore', timeout: 5000 }
      );
    }
  } catch {
    // Ignore if no process was found or command fails
  }
}

export class VoskHelperEngine implements WakeWordEngine {
  private process: ChildProcess | null = null;
  private detectedCallbacks: WakeWordDetectedCallback[] = [];
  private errorCallbacks: WakeWordErrorCallback[] = [];
  private devicesCallbacks: WakeWordDevicesCallback[] = [];
  private stateCallbacks: WakeWordStateCallback[] = [];

  private isRunning = false;
  private isPaused = false;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private retryTimeout: NodeJS.Timeout | null = null;
  private pauseWatchdog: NodeJS.Timeout | null = null;

  private modelName: string;
  private threshold: number;
  private alsoSpider: boolean;
  private deviceId: number | null;

  constructor(options: VoskEngineOptions = {}) {
    this.modelName = options.modelName || 'vosk-model-small-en-us-0.15';
    this.threshold = options.threshold !== undefined ? options.threshold : 0.70;
    this.alsoSpider = !!options.alsoSpider;
    this.deviceId = options.deviceId !== undefined ? options.deviceId : null;
  }

  public getInstalledModels(): string[] {
    const projectRoot = getProjectRoot();
    const modelsDir = path.join(projectRoot, 'models', 'vosk');
    if (!fs.existsSync(modelsDir)) return [];
    try {
      return fs.readdirSync(modelsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  public onDetected(callback: WakeWordDetectedCallback): void {
    this.detectedCallbacks.push(callback);
  }

  public onError(callback: WakeWordErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  public onDevices(callback: WakeWordDevicesCallback): void {
    this.devicesCallbacks.push(callback);
  }

  public onStateChange(callback: WakeWordStateCallback): void {
    this.stateCallbacks.push(callback);
  }

  public isListening(): boolean {
    return this.isRunning && !this.isPaused;
  }

  public isPausedState(): boolean {
    return this.isPaused;
  }

  public isRunningState(): boolean {
    return this.isRunning;
  }

  private notifyState(listening: boolean): void {
    for (const cb of this.stateCallbacks) {
      try {
        cb(listening);
      } catch (err) {
        console.error('[Voice] Error in state callback:', err);
      }
    }
  }

  private notifyError(code: WakeWordError['code'], message: string): void {
    for (const cb of this.errorCallbacks) {
      try {
        cb({ code, message });
      } catch (err) {
        console.error('[Voice] Error in error callback:', err);
      }
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.retryCount = 0;
    await this.spawnHelper();
  }

  private async spawnHelper(): Promise<void> {
    if (this.process) return;

    // Ensure only ONE helper process runs
    killStaleVoiceHelpers();

    const projectRoot = getProjectRoot();
    const venvPython = path.join(projectRoot, 'tools', 'voice', '.venv', 'Scripts', 'python.exe');
    const helperScript = path.join(projectRoot, 'tools', 'voice', 'voice_helper.py');
    const modelsDir = path.join(projectRoot, 'models', 'vosk');
    const absoluteModelPath = path.join(modelsDir, this.modelName);

    if (!fs.existsSync(venvPython)) {
      console.warn(`[Voice] Python venv not found at: ${venvPython}`);
      this.notifyError('OTHER', `Python virtual environment not found at ${venvPython}`);
      this.isRunning = false;
      return;
    }

    if (!fs.existsSync(helperScript)) {
      console.warn(`[Voice] Helper script not found at: ${helperScript}`);
      this.notifyError('OTHER', `Helper script not found at ${helperScript}`);
      this.isRunning = false;
      return;
    }

    if (!fs.existsSync(absoluteModelPath)) {
      console.warn(`[Voice] Model folder does not exist: ${absoluteModelPath}`);
      this.notifyError('MODEL_MISSING', 'Voice model not found');
      this.isRunning = false;
      return;
    }

    const args: string[] = [
      '-u',
      helperScript,
      '--model',
      absoluteModelPath,
    ];

    if (this.threshold !== undefined && this.threshold !== null) {
      args.push('--threshold', this.threshold.toString());
    }

    if (this.alsoSpider) {
      args.push('--also-spider');
    }

    if (this.deviceId !== null && this.deviceId !== undefined && String(this.deviceId).trim() !== '' && this.deviceId !== -1) {
      args.push('--device', this.deviceId.toString());
    }

    const fullCmd = `"${venvPython}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
    console.log(`[Voice] Starting helper with command: ${fullCmd}`);

    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    };

    try {
      this.process = spawn(venvPython, args, {
        cwd: projectRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdoutBuffer = '';

      this.process.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf-8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this.handleHelperOutput(trimmed);
        }
      });

      this.process.stdout!.on('end', () => {
        if (stdoutBuffer.trim()) {
          this.handleHelperOutput(stdoutBuffer.trim());
          stdoutBuffer = '';
        }
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8').trim();
        if (text) {
          console.warn(`[Voice] stderr: ${text}`);
        }
      });

      this.process.on('close', (code) => {
        console.log(`[Voice] Helper process exited with code ${code}`);
        this.process = null;
        this.notifyState(false);

        // Auto-restart with backoff if unexpected exit
        if (this.isRunning) {
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const backoffMs = this.retryCount * 1500;
            console.log(`[Voice] Helper crashed/exited. Retry ${this.retryCount}/${this.maxRetries} in ${backoffMs}ms...`);
            this.retryTimeout = setTimeout(() => {
              if (this.isRunning) {
                this.spawnHelper();
              }
            }, backoffMs);
          } else {
            console.error('[Voice] Helper crashed repeatedly. Giving up.');
            this.notifyError('CRASH_LOOP', 'Voice activation helper stopped working after multiple attempts.');
          }
        }
      });

      this.process.on('error', (err) => {
        console.error('[Voice] Failed to spawn helper process:', err);
        this.notifyError('OTHER', `Failed to launch voice process: ${err.message}`);
        this.process = null;
      });
    } catch (err: any) {
      console.error('[Voice] Exception launching helper:', err);
      this.notifyError('OTHER', err?.message || 'Unknown spawn error');
    }
  }

  private handleHelperOutput(line: string): void {
    try {
      const msg = JSON.parse(line);
      console.log(`[Voice] Received message: ${JSON.stringify(msg)}`);

      switch (msg.type) {
        case 'devices':
          console.log(`[Voice] Microphone list received: ${msg.list?.length || 0} devices.`);
          for (const cb of this.devicesCallbacks) {
            try {
              cb(msg.list as AudioDevice[]);
            } catch (err) {
              console.error('[Voice] Error in devices callback:', err);
            }
          }
          break;

        case 'ready':
          console.log('[Voice] Helper is READY and listening.');
          this.retryCount = 0;
          this.notifyState(true);
          break;

        case 'detected':
          for (const cb of this.detectedCallbacks) {
            try {
              cb(msg.phrase, msg.conf);
            } catch (err) {
              console.error('[Voice] Error in detected callback:', err);
            }
          }
          break;

        case 'error':
          console.warn(`[Voice] Helper error reported: [${msg.code}] ${msg.message}`);
          this.notifyError(msg.code, msg.message);
          break;

        default:
          console.log(`[Voice] Other message from helper: ${line}`);
          break;
      }
    } catch {
      console.warn(`[Voice] Non-JSON stdout from helper: ${line}`);
    }
  }

  public pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.notifyState(false);
    this.sendCommand('pause');
    console.log('[Voice] Sent "pause" to helper.');

    // 30-second watchdog to auto-resume if resume is not called
    if (this.pauseWatchdog) {
      clearTimeout(this.pauseWatchdog);
    }
    this.pauseWatchdog = setTimeout(() => {
      if (this.isPaused) {
        console.warn('[Voice] Watchdog timeout (30s) reached while paused. Automatically resuming helper.');
        this.resume();
      }
    }, 30000);
  }

  public resume(): void {
    if (this.pauseWatchdog) {
      clearTimeout(this.pauseWatchdog);
      this.pauseWatchdog = null;
    }
    this.isPaused = false;
    this.notifyState(true);
    this.sendCommand('resume');
    console.log('[Voice] Sent "resume" to helper.');
  }

  public setSensitivity(threshold: number): void {
    this.threshold = threshold;
    this.sendCommand(`threshold ${threshold}`);
  }

  public setDevice(deviceIndex: number | null): void {
    this.deviceId = deviceIndex;
    if (deviceIndex !== null && deviceIndex !== undefined && deviceIndex !== -1) {
      this.sendCommand(`device ${deviceIndex}`);
    } else {
      this.sendCommand('device default');
    }
  }

  public updateConfig(options: VoskEngineOptions): void {
    let needsRestart = false;
    if (options.modelName && options.modelName !== this.modelName) {
      this.modelName = options.modelName;
      needsRestart = true;
    }
    if (options.alsoSpider !== undefined && options.alsoSpider !== this.alsoSpider) {
      this.alsoSpider = options.alsoSpider;
      needsRestart = true;
    }
    if (options.threshold !== undefined && options.threshold !== this.threshold) {
      this.setSensitivity(options.threshold);
    }
    if (options.deviceId !== undefined && options.deviceId !== this.deviceId) {
      this.setDevice(options.deviceId);
    }

    if (needsRestart && this.isRunning) {
      this.stop().then(() => this.start());
    }
  }

  private sendCommand(cmd: string): void {
    if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
      try {
        this.process.stdin.write(cmd + '\n');
      } catch (err) {
        console.warn('[Voice] Failed to write command to stdin:', err);
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.pauseWatchdog) {
      clearTimeout(this.pauseWatchdog);
      this.pauseWatchdog = null;
    }
    this.notifyState(false);

    if (this.process) {
      const proc = this.process;
      this.process = null;
      try {
        proc.stdin?.write('quit\n');
        proc.stdin?.end();
      } catch {}

      setTimeout(() => {
        try {
          if (!proc.killed) {
            proc.kill();
          }
        } catch {}
        killStaleVoiceHelpers();
      }, 500);
    } else {
      killStaleVoiceHelpers();
    }
  }
}

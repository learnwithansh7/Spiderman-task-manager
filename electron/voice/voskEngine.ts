import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
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

  private modelName: string;
  private threshold: number;
  private alsoSpider: boolean;
  private deviceId: number | null;

  constructor(options: VoskEngineOptions = {}) {
    this.modelName = options.modelName || 'vosk-model-small-en-in-0.4';
    this.threshold = options.threshold !== undefined ? options.threshold : 0.70;
    this.alsoSpider = !!options.alsoSpider;
    this.deviceId = options.deviceId !== undefined ? options.deviceId : null;
  }

  public getInstalledModels(): string[] {
    const modelsDir = path.resolve(__dirname, '../../models/vosk');
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

  private notifyState(listening: boolean): void {
    for (const cb of this.stateCallbacks) {
      try {
        cb(listening);
      } catch (err) {
        console.error('[VoskEngine] Error in state callback:', err);
      }
    }
  }

  private notifyError(code: WakeWordError['code'], message: string): void {
    for (const cb of this.errorCallbacks) {
      try {
        cb({ code, message });
      } catch (err) {
        console.error('[VoskEngine] Error in error callback:', err);
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

    // Resolve python from venv
    const venvPython = path.resolve(__dirname, '../../tools/voice/.venv/Scripts/python.exe');
    const helperScript = path.resolve(__dirname, '../../tools/voice/voice_helper.py');
    const modelsDir = path.resolve(__dirname, '../../models/vosk');

    if (!fs.existsSync(venvPython)) {
      this.notifyError('OTHER', 'Python virtual environment not found at tools/voice/.venv');
      return;
    }

    if (!fs.existsSync(helperScript)) {
      this.notifyError('OTHER', 'Helper script not found at tools/voice/voice_helper.py');
      return;
    }

    // Resolve model path
    let modelPath = path.join(modelsDir, this.modelName);
    if (!fs.existsSync(modelPath)) {
      // Fallback to any installed model
      const installed = this.getInstalledModels();
      if (installed.length > 0) {
        this.modelName = installed[0];
        modelPath = path.join(modelsDir, this.modelName);
      } else {
        this.notifyError('MODEL_MISSING', `Vosk model not found. Please install a model into models/vosk/`);
        return;
      }
    }

    const args = [
      helperScript,
      '--model', modelPath,
      '--threshold', this.threshold.toString(),
    ];

    if (this.alsoSpider) {
      args.push('--also-spider');
    }

    if (this.deviceId !== null && this.deviceId !== undefined) {
      args.push('--device', this.deviceId.toString());
    }

    console.log(`[VoskEngine] Spawning helper: ${venvPython} ${args.join(' ')}`);

    try {
      this.process = spawn(venvPython, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const rl = readline.createInterface({
        input: this.process.stdout!,
        terminal: false,
      });

      rl.on('line', (line) => {
        this.handleHelperOutput(line);
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          console.warn(`[VoskEngine stderr] ${text}`);
        }
      });

      this.process.on('close', (code) => {
        console.log(`[VoskEngine] Process exited with code ${code}`);
        this.process = null;
        this.notifyState(false);

        // Auto-restart with backoff if unexpected exit
        if (this.isRunning) {
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const backoffMs = this.retryCount * 1500;
            console.log(`[VoskEngine] Helper crashed. Retry ${this.retryCount}/${this.maxRetries} in ${backoffMs}ms...`);
            this.retryTimeout = setTimeout(() => {
              if (this.isRunning) {
                this.spawnHelper();
              }
            }, backoffMs);
          } else {
            console.error('[VoskEngine] Helper crashed repeatedly. Giving up.');
            this.notifyError('CRASH_LOOP', 'Voice activation helper stopped working after multiple attempts.');
          }
        }
      });

      this.process.on('error', (err) => {
        console.error('[VoskEngine] Failed to spawn helper process:', err);
        this.notifyError('OTHER', `Failed to launch voice process: ${err.message}`);
        this.process = null;
      });

    } catch (err: any) {
      console.error('[VoskEngine] Exception launching helper:', err);
      this.notifyError('OTHER', err?.message || 'Unknown spawn error');
    }
  }

  private handleHelperOutput(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);
      switch (msg.type) {
        case 'ready':
          console.log('[VoskEngine] Helper is READY and listening.');
          this.retryCount = 0; // reset retry counter on success
          this.notifyState(true);
          break;

        case 'detected':
          console.log(`[VoskEngine] Wake word detected: "${msg.phrase}" (conf: ${msg.conf})`);
          for (const cb of this.detectedCallbacks) {
            try {
              cb(msg.phrase, msg.conf);
            } catch (err) {
              console.error('[VoskEngine] Error in detected callback:', err);
            }
          }
          break;

        case 'devices':
          for (const cb of this.devicesCallbacks) {
            try {
              cb(msg.list as AudioDevice[]);
            } catch (err) {
              console.error('[VoskEngine] Error in devices callback:', err);
            }
          }
          break;

        case 'error':
          console.warn(`[VoskEngine error event] ${msg.code}: ${msg.message}`);
          this.notifyError(msg.code, msg.message);
          break;
      }
    } catch {
      // Non-JSON output (ignore or debug)
    }
  }

  public pause(): void {
    this.isPaused = true;
    this.notifyState(false);
    this.sendCommand('pause');
  }

  public resume(): void {
    this.isPaused = false;
    this.notifyState(true);
    this.sendCommand('resume');
  }

  public setSensitivity(threshold: number): void {
    this.threshold = threshold;
    this.sendCommand(`threshold ${threshold}`);
  }

  public setDevice(deviceIndex: number | null): void {
    this.deviceId = deviceIndex;
    if (deviceIndex !== null && deviceIndex !== undefined) {
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
        console.warn('[VoskEngine] Failed to write command to stdin:', err);
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    this.notifyState(false);

    if (this.process) {
      const proc = this.process;
      this.process = null;
      try {
        proc.stdin?.write('quit\n');
        proc.stdin?.end();
      } catch {}

      // Force kill after 1 second if still alive
      setTimeout(() => {
        try {
          if (!proc.killed) {
            proc.kill();
          }
        } catch {}
      }, 1000);
    }
  }
}

export interface AudioDevice {
  id: number;
  name: string;
  channels: number;
  default: boolean;
}

export type WakeWordErrorCode = 'NO_MIC' | 'MIC_BLOCKED' | 'MODEL_MISSING' | 'CRASH_LOOP' | 'OTHER';

export interface WakeWordError {
  code: WakeWordErrorCode;
  message: string;
}

export type WakeWordDetectedCallback = (phrase: string, confidence: number) => void;
export type WakeWordDevicesCallback = (devices: AudioDevice[]) => void;
export type WakeWordErrorCallback = (error: WakeWordError) => void;
export type WakeWordStateCallback = (isListening: boolean) => void;

export interface VoiceCommand {
  name: string;
  phrase: string;
  conf: number;
}

export type WakeWordCommandCallback = (command: VoiceCommand) => void;

/**
 * Generic WakeWordEngine interface.
 * Designed so VoskHelperEngine or any other future local engine can plug in seamlessly.
 */
export interface WakeWordEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  onDetected(callback: WakeWordDetectedCallback): void;
  onError(callback: WakeWordErrorCallback): void;
  onDevices(callback: WakeWordDevicesCallback): void;
  onStateChange(callback: WakeWordStateCallback): void;
  setSensitivity(threshold: number): void;
  setDevice(deviceIndex: number | null): void;
  setMode?(mode: 'idle' | 'active'): void;
  getMode?(): 'idle' | 'active';
  isListening(): boolean;
  getInstalledModels(): string[];
}

export type AnimationPhase = 'IDLE' | 'DESCENDING' | 'SWAYING' | 'EXITING';

export interface ElectronAPI {
  send: (channel: string, data?: any) => void;
  on: (channel: string, func: (...args: any[]) => void) => () => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  hideOverlay: () => void;
  notifyAnimationComplete: () => void;
  notifyAction: (action: 'done' | 'snooze', snoozeMinutes?: number) => void;
  onTriggerAnimation: (callback: (payload?: { message?: string }) => void) => () => void;
  onTriggerExit: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

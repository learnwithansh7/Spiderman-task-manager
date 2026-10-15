export interface ElectronAPI {
  send: (channel: string, data?: any) => void;
  on: (channel: string, func: (...args: any[]) => void) => () => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  hideOverlay: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

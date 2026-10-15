import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: any) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => func(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
  hideOverlay: () => {
    ipcRenderer.send('hide-overlay');
  },
  notifyAnimationComplete: () => {
    ipcRenderer.send('animation-complete');
  },
  notifyAction: (action: 'done' | 'snooze', snoozeMinutes?: number) => {
    ipcRenderer.send('reminder-action', action, snoozeMinutes);
  },
  onTriggerAnimation: (callback: (payload?: { message?: string }) => void) => {
    const sub = (_event: Electron.IpcRendererEvent, payload?: { message?: string }) => callback(payload);
    ipcRenderer.on('trigger-animation', sub);
    return () => {
      ipcRenderer.removeListener('trigger-animation', sub);
    };
  },
  onTriggerExit: (callback: () => void) => {
    const sub = () => callback();
    ipcRenderer.on('trigger-exit', sub);
    return () => {
      ipcRenderer.removeListener('trigger-exit', sub);
    };
  },
});

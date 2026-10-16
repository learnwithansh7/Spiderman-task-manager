import { AppSettings } from '../types/settings';

export type AnimationPhase = 'IDLE' | 'DESCENDING' | 'SWAYING' | 'EXITING';

export interface ElectronAPI {
  send: (channel: string, data?: any) => void;
  invoke: (channel: string, data?: any) => Promise<any>;
  on: (channel: string, func: (...args: any[]) => void) => () => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  hideOverlay: () => void;
  notifyAnimationComplete: () => void;
  notifyAction: (action: 'done' | 'snooze', snoozeMinutes?: number) => void;
  onTriggerAnimation: (callback: (payload?: { message?: string }) => void) => () => void;
  onTriggerExit: (callback: () => void) => () => void;
  // Settings methods
  getSettings?: () => Promise<AppSettings>;
  saveSettings?: (settings: AppSettings) => Promise<{ success: boolean }>;
  testReminder?: (type?: string) => void;
  onSettingsUpdated?: (callback: (settings: AppSettings) => void) => () => void;
  getVoiceDevices?: () => Promise<any[]>;
  getVoiceModels?: () => Promise<string[]>;
}

export interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archived: boolean;
  dueDate: null;
  priority: null;
}

export interface TasksApi {
  list: (options?: { includeArchived?: boolean }) => Promise<TaskItem[]>;
  add: (title: string) => Promise<TaskItem>;
  remove: (id: string) => Promise<TaskItem>;
  toggle: (id: string) => Promise<TaskItem>;
  onChanged: (callback: (tasks?: TaskItem[]) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    tasksApi?: TasksApi;
  }
}

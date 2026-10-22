import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export type ReminderTypeKey = 'water' | 'stretch' | 'eyes';

export interface ReminderTypeConfig {
  enabled: boolean;
  message: string;
  voiceText: string;
}

export interface AppSettings {
  intervalMinutes: number;           // e.g. 45 minutes
  activeHours: {
    enabled: boolean;
    start: string;                   // "09:00"
    end: string;                     // "18:00"
  };
  snoozeDurationMinutes: number;     // e.g. 5 minutes
  voiceMuted: boolean;
  startWithWindows: boolean;
  reminderTypes: {
    water: ReminderTypeConfig;
    stretch: ReminderTypeConfig;
    eyes: ReminderTypeConfig;
  };
  lastTriggerTimestamp: number;
  nextTriggerTimestamp: number;
  lastReminderType: ReminderTypeKey;

  // Milestone V1: Voice Activation Settings
  voiceActivationEnabled: boolean;       // OFF by default
  voiceDeviceId: number | null;          // null = default mic
  voiceSensitivity: number;              // threshold, default 0.70
  voiceAlsoSpider: boolean;              // OFF by default
  voiceModelName: string;                // default "vosk-model-small-en-in-0.4"
}

export function getSettingsFilePath(): string {
  try {
    const srDir = path.join(process.env.APPDATA || '', 'spider-reminder');
    if (fs.existsSync(srDir)) {
      return path.join(srDir, 'settings.json');
    }
    if (app && app.getPath) {
      const userData = app.getPath('userData');
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true });
      }
      return path.join(userData, 'settings.json');
    }
  } catch {}
  return path.resolve(__dirname, '../../settings.json');
}

export const DEFAULT_SETTINGS: AppSettings = {
  intervalMinutes: 45,
  activeHours: {
    enabled: true,
    start: '09:00',
    end: '18:00',
  },
  snoozeDurationMinutes: 5,
  voiceMuted: false,
  startWithWindows: false,
  reminderTypes: {
    water: {
      enabled: true,
      message: 'Time to drink water! Stay hydrated.',
      voiceText: 'Time to drink water! Stay hydrated.',
    },
    stretch: {
      enabled: true,
      message: 'Time to stretch your back and shoulders!',
      voiceText: 'Time to stretch your back and shoulders!',
    },
    eyes: {
      enabled: true,
      message: 'Rest your eyes! Look at something 20 feet away.',
      voiceText: 'Rest your eyes! Look away from the screen.',
    },
  },
  lastTriggerTimestamp: 0,
  nextTriggerTimestamp: 0,
  lastReminderType: 'water',

  // Milestone V1 Defaults
  voiceActivationEnabled: true,          // Voice activation is ON by default
  voiceDeviceId: null,
  voiceSensitivity: 0.75,                // 0.75 provides clean noise immunity while catching natural speech
  voiceAlsoSpider: false,                // OFF by default to prevent ambient room noise false triggers
  voiceModelName: 'vosk-model-small-en-us-0.15',
};

export function loadSettings(): AppSettings {
  const filePath = getSettingsFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[Settings] Loaded configuration from ${filePath}`);

      // Deep-merge to preserve any new defaults
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        activeHours: {
          ...DEFAULT_SETTINGS.activeHours,
          ...(parsed.activeHours || {}),
        },
        reminderTypes: {
          water: {
            ...DEFAULT_SETTINGS.reminderTypes.water,
            ...(parsed.reminderTypes?.water || {}),
          },
          stretch: {
            ...DEFAULT_SETTINGS.reminderTypes.stretch,
            ...(parsed.reminderTypes?.stretch || {}),
          },
          eyes: {
            ...DEFAULT_SETTINGS.reminderTypes.eyes,
            ...(parsed.reminderTypes?.eyes || {}),
          },
        },
      };
      return merged;
    }
  } catch (err) {
    console.warn('[Settings] Failed to load settings.json, falling back to defaults:', err);
  }

  saveSettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  const filePath = getSettingsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`[Settings] Settings successfully saved to ${filePath}`);
  } catch (err) {
    console.error(`[Settings] Error saving settings to ${filePath}:`, err);
  }
}

import path from 'path';
import fs from 'fs';

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
  reminderTypes: {
    water: ReminderTypeConfig;
    stretch: ReminderTypeConfig;
    eyes: ReminderTypeConfig;
  };
  lastTriggerTimestamp: number;
  nextTriggerTimestamp: number;
  lastReminderType: ReminderTypeKey;
}

const SETTINGS_FILE = path.resolve(__dirname, '../../settings.json');

export const DEFAULT_SETTINGS: AppSettings = {
  intervalMinutes: 45,
  activeHours: {
    enabled: true,
    start: '09:00',
    end: '18:00',
  },
  snoozeDurationMinutes: 5,
  voiceMuted: false,
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
};

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      console.log(`[Settings] Loaded configuration from ${SETTINGS_FILE}`);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn('[Settings] Failed to load settings.json, falling back to defaults:', err);
  }

  saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log(`[Settings] Settings successfully saved to ${SETTINGS_FILE}`);
  } catch (err) {
    console.error('[Settings] Error saving settings.json:', err);
  }
}

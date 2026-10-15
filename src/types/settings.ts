export type ReminderTypeKey = 'water' | 'stretch' | 'eyes';

export interface ReminderTypeConfig {
  enabled: boolean;
  message: string;
  voiceText: string;
}

export interface AppSettings {
  intervalMinutes: number;
  activeHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  snoozeDurationMinutes: number;
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
}

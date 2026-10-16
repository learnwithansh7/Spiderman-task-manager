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

  // Milestone V1: Voice Activation Settings
  voiceActivationEnabled: boolean;       // OFF by default
  voiceDeviceId: number | null;          // null = default mic
  voiceSensitivity: number;              // threshold, default 0.70
  voiceAlsoSpider: boolean;              // OFF by default
  voiceModelName: string;                // default "vosk-model-small-en-in-0.4"
}

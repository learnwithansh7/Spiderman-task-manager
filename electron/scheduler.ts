import { powerMonitor } from 'electron';
import { AppSettings, ReminderTypeKey, loadSettings, saveSettings } from './settings';

export type TriggerCallback = (reminderType: ReminderTypeKey, message: string, voiceText: string) => void;

export class ReminderScheduler {
  private settings: AppSettings;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private onTriggerCallback: TriggerCallback | null = null;
  private reminderKeys: ReminderTypeKey[] = ['water', 'stretch', 'eyes'];

  constructor(onTrigger: TriggerCallback) {
    this.settings = loadSettings();
    this.onTriggerCallback = onTrigger;
    this.setupPowerMonitor();
  }

  public start(): void {
    console.log('[Scheduler] Starting Reminder Scheduler engine...');

    // If nextTriggerTimestamp is in the past or uninitialized, schedule from now
    const now = Date.now();
    if (!this.settings.nextTriggerTimestamp || this.settings.nextTriggerTimestamp < now - 60000) {
      this.scheduleNextRegularReminder();
    } else {
      console.log(`[Scheduler] Restored pending reminder scheduled for: ${new Date(this.settings.nextTriggerTimestamp).toLocaleTimeString()}`);
    }

    // Heartbeat ticker checks every 3 seconds
    // This guarantees detection of elapsed time across sleep/wake and system clock changes
    this.heartbeatTimer = setInterval(() => {
      this.checkDueReminders();
    }, 3000);
  }

  public stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    console.log('[Scheduler] Scheduler stopped.');
  }

  public handleDone(): void {
    console.log('[Scheduler] User marked reminder as Done. Scheduling next regular interval.');
    this.settings.lastTriggerTimestamp = Date.now();
    this.scheduleNextRegularReminder();
  }

  public handleSnooze(minutes?: number): void {
    const snoozeMin = minutes || this.settings.snoozeDurationMinutes || 5;
    const snoozeTime = Date.now() + snoozeMin * 60 * 1000;
    this.settings.nextTriggerTimestamp = snoozeTime;
    saveSettings(this.settings);
    console.log(`[Scheduler] Reminder snoozed for ${snoozeMin} minutes. Next trigger at: ${new Date(snoozeTime).toLocaleTimeString()}`);
  }

  public triggerImmediateTest(reminderType?: ReminderTypeKey): void {
    const type = reminderType || this.getNextReminderType();
    const config = this.settings.reminderTypes[type];
    console.log(`[Scheduler] Immediate reminder triggered: [${type.toUpperCase()}] "${config.message}"`);
    this.onTriggerCallback?.(type, config.message, config.voiceText);
  }

  public setTestIntervalMinutes(minutes: number): void {
    this.settings.intervalMinutes = minutes;
    this.settings.nextTriggerTimestamp = Date.now() + minutes * 60 * 1000;
    saveSettings(this.settings);
    console.log(`[Scheduler] Test interval set to ${minutes} min. Next due at ${new Date(this.settings.nextTriggerTimestamp).toLocaleTimeString()}`);
  }

  private scheduleNextRegularReminder(): void {
    const delayMs = this.settings.intervalMinutes * 60 * 1000;
    this.settings.nextTriggerTimestamp = Date.now() + delayMs;
    saveSettings(this.settings);
    console.log(`[Scheduler] Next regular reminder scheduled for: ${new Date(this.settings.nextTriggerTimestamp).toLocaleTimeString()} (interval: ${this.settings.intervalMinutes} min)`);
  }

  private checkDueReminders(): void {
    const now = Date.now();
    if (this.settings.nextTriggerTimestamp > 0 && now >= this.settings.nextTriggerTimestamp) {
      // Check active hours
      if (this.isWithinActiveHours()) {
        console.log('[Scheduler] Reminder timestamp reached and active hours confirmed.');
        const type = this.getNextReminderType();
        const config = this.settings.reminderTypes[type];

        this.settings.lastReminderType = type;
        this.settings.lastTriggerTimestamp = now;

        // Auto schedule next occurrence (will be confirmed when user clicks Done)
        const delayMs = this.settings.intervalMinutes * 60 * 1000;
        this.settings.nextTriggerTimestamp = now + delayMs;
        saveSettings(this.settings);

        this.onTriggerCallback?.(type, config.message, config.voiceText);
      } else {
        console.log('[Scheduler] Reminder due, but currently outside configured active hours. Postponing check.');
      }
    }
  }

  private getNextReminderType(): ReminderTypeKey {
    // Cycle through enabled reminder types
    const enabledTypes = this.reminderKeys.filter((k) => this.settings.reminderTypes[k].enabled);
    if (enabledTypes.length === 0) return 'water';

    const lastIndex = enabledTypes.indexOf(this.settings.lastReminderType);
    const nextIndex = (lastIndex + 1) % enabledTypes.length;
    return enabledTypes[nextIndex];
  }

  private isWithinActiveHours(): boolean {
    if (!this.settings.activeHours.enabled) return true;

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = this.settings.activeHours.start.split(':').map(Number);
    const [endH, endM] = this.settings.activeHours.end.split(':').map(Number);

    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    return currentMin >= startMin && currentMin <= endMin;
  }

  private setupPowerMonitor(): void {
    try {
      powerMonitor.on('suspend', () => {
        console.log('[Scheduler] PC suspending/sleeping. Preserving scheduled state in settings.json.');
        saveSettings(this.settings);
      });

      powerMonitor.on('resume', () => {
        console.log('[Scheduler] PC resumed from sleep! Checking for overdue reminders immediately...');
        this.checkDueReminders();
      });
    } catch (err) {
      console.warn('[Scheduler] powerMonitor not available in current environment:', err);
    }
  }
}

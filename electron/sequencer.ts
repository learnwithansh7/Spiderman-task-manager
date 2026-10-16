import { BrowserWindow, screen } from 'electron';
import { VoskHelperEngine } from './voice/voskEngine';
import { ReminderScheduler } from './scheduler';
import { loadSettings } from './settings';

export type SequencerState = 'HIDDEN' | 'INTRO' | 'LOOP' | 'OUTRO';

export class AnimationSequencer {
  private state: SequencerState = 'HIDDEN';
  private triggerCount = 0;
  private overlayWindow: BrowserWindow | null = null;
  private voiceEngine: VoskHelperEngine | null = null;
  private scheduler: ReminderScheduler | null = null;
  private isRendererReady = false;
  private pendingPayload: { id: string; message: string; voiceText: string } | null = null;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastSequenceEndTime = 0;
  private readonly cooldownMs = 3000;
  private readonly handshakeTimeoutMs = 1500;
  private readonly fullSequenceMaxMs = 24000; // ~18.5s full sequence + 5s buffer

  constructor() {
    this.state = 'HIDDEN';
  }

  public setOverlayWindow(win: BrowserWindow | null): void {
    this.overlayWindow = win;
  }

  public setVoiceEngine(engine: VoskHelperEngine | null): void {
    this.voiceEngine = engine;
  }

  public setScheduler(sched: ReminderScheduler | null): void {
    this.scheduler = sched;
  }

  public setRendererReady(): void {
    this.isRendererReady = true;
    console.log('[Seq] Renderer announced ready.');
    if (this.pendingPayload) {
      const p = this.pendingPayload;
      this.pendingPayload = null;
      console.log(`[Seq] [${p.id}] Processing queued trigger payload...`);
      this.executeTrigger(p.id, p.message, p.voiceText, false);
    }
  }

  public getState(): SequencerState {
    return this.state;
  }

  public trigger(source: string, customMessage?: string, customVoiceText?: string): void {
    const id = `#${++this.triggerCount}`;
    const timestamp = new Date().toISOString();
    console.log(`[Seq] [${id}] [${timestamp}] Detection received from source: "${source}"`);

    const settings = this.scheduler ? this.scheduler.getSettings() : loadSettings();

    // 1. Voice activation enabled check (if triggered by voice)
    if (source === 'voice' && !settings.voiceActivationEnabled) {
      console.log(`[Seq] [${id}] [${new Date().toISOString()}] Decision: Ignored. Reason: voice off`);
      return;
    }

    // 2. Already active sequence check
    if (this.state !== 'HIDDEN') {
      console.log(`[Seq] [${id}] [${new Date().toISOString()}] Decision: Ignored. Reason: sequence playing (state=${this.state})`);
      return;
    }

    // 3. Post-sequence cooldown check
    const now = Date.now();
    const elapsedSinceLast = now - this.lastSequenceEndTime;
    if (elapsedSinceLast < this.cooldownMs) {
      const remainingMs = this.cooldownMs - elapsedSinceLast;
      console.log(`[Seq] [${id}] [${new Date().toISOString()}] Decision: Ignored. Reason: cooldown (${remainingMs}ms remaining)`);
      return;
    }

    // 4. Voice engine paused check
    if (source === 'voice' && this.voiceEngine?.isPausedState()) {
      console.log(`[Seq] [${id}] [${new Date().toISOString()}] Decision: Ignored. Reason: paused`);
      return;
    }

    console.log(`[Seq] [${id}] [${new Date().toISOString()}] Decision: Start sequence`);

    const type = this.scheduler ? this.scheduler.getNextReminderInfo().type : 'water';
    const config = settings.reminderTypes[type];
    const greeting = 'Hey! Spider-Man here with your reminder.';
    const message = customMessage || (source === 'voice' ? `${greeting} ${config.message}` : config.message);
    const voiceText = customVoiceText || (source === 'voice' ? `${greeting} ${config.voiceText}` : config.voiceText);

    if (!this.isRendererReady) {
      console.log(`[Seq] [${id}] Renderer not ready yet. Queuing trigger message.`);
      this.pendingPayload = { id, message, voiceText };
      return;
    }

    this.executeTrigger(id, message, voiceText, false);
  }

  private executeTrigger(id: string, message: string, voiceText: string, isRetry: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
      console.error(`[Seq] [${id}] Cannot start sequence: overlay window destroyed or unavailable.`);
      return;
    }

    this.state = 'INTRO';
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] State change: HIDDEN -> INTRO`);

    // Ensure overlay window is positioned on primary display and brought to top
    if (screen && typeof screen.getPrimaryDisplay === 'function') {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        this.overlayWindow.setBounds(primaryDisplay.workArea);
      } catch {}
    }
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    this.overlayWindow.showInactive();
    this.overlayWindow.moveTop();

    const bounds = this.overlayWindow.getBounds();
    const isVisible = this.overlayWindow.isVisible();
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] Overlay window shown: bounds=(${bounds.x}, ${bounds.y}) [${bounds.width}x${bounds.height}], visible=${isVisible}`);

    // Pause voice engine during character presence so he cannot trigger himself
    this.voiceEngine?.pause();

    // Send sequence start command to renderer
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] Message sent to renderer: seq-play`);
    this.overlayWindow.webContents.send('seq-play', { correlationId: id, message, voiceText });

    // Handshake timer: require "seq-started" from renderer within 1500ms
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = setTimeout(() => {
      console.warn(`[Seq] [${id}] [${new Date().toISOString()}] Handshake timeout (${this.handshakeTimeoutMs}ms): renderer did not report started.`);
      if (!isRetry) {
        console.log(`[Seq] [${id}] Retrying sequence once...`);
        this.hideAndReset();
        this.executeTrigger(id, message, voiceText, true);
      } else {
        console.error(`[Seq] [${id}] Handshake failed after retry. Aborting sequence. No voice will play.`);
        this.hideAndReset();
      }
    }, this.handshakeTimeoutMs);

    // Watchdog timer: force return to HIDDEN if non-idle longer than sequence length + 5s
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (this.state !== 'HIDDEN') {
        console.warn(`[Seq] [${id}] [${new Date().toISOString()}] Watchdog expired (${this.fullSequenceMaxMs}ms). Forcing sequencer back to HIDDEN.`);
        this.handleComplete(id);
      }
    }, this.fullSequenceMaxMs);
  }

  public handleRendererStarted(id: string): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] Handshake confirmed: renderer visual frame is active ("playing" event).`);
  }

  public handleStateChange(id: string, newState: SequencerState): void {
    const oldState = this.state;
    this.state = newState;
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] State change: ${oldState} -> ${newState}`);
  }

  public handleVoiceStarted(id: string, text: string): void {
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] Voice greeting started: "${text}"`);
  }

  public handleComplete(id: string): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    const oldState = this.state;
    this.state = 'HIDDEN';
    this.lastSequenceEndTime = Date.now();
    console.log(`[Seq] [${id}] [${new Date().toISOString()}] State change: ${oldState} -> HIDDEN. Sequence complete.`);

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }

    // Cooldown before resuming voice helper
    setTimeout(() => {
      if (this.state === 'HIDDEN' && this.voiceEngine) {
        this.voiceEngine.resume();
      }
    }, this.cooldownMs);
  }

  public hideAndReset(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.state = 'HIDDEN';
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
    if (this.voiceEngine?.isPausedState()) {
      this.voiceEngine.resume();
    }
  }
}

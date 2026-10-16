/**
 * Windows built-in text-to-speech helper for SpiderReminder.
 * Uses Web Speech API (speechSynthesis) native to Chromium/Electron on Windows.
 * No external libraries, no cloud API, no audio files required.
 */

export function speakReminder(text: string, muted: boolean): void {
  if (muted) {
    console.log('[Voice] Spoken reminder is muted by user setting.');
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[Voice] SpeechSynthesis API not supported in this environment.');
    return;
  }

  try {
    window.speechSynthesis.cancel(); // Cancel any lingering utterances first

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      console.log(`[Voice] Speaking: "${text}"`);
    };

    utterance.onerror = (e) => {
      // 'interrupted' is benign — happens when stopVoice() cancels an utterance
      if ((e as any).error !== 'interrupted') {
        console.warn('[Voice] Speech synthesis error:', (e as any).error);
      }
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[Voice] Failed to execute speech synthesis:', err);
  }
}

export function stopVoice(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

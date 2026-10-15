/**
 * Windows built-in text-to-speech and audio playback helper.
 * Uses Web Speech API (speechSynthesis) native to Chromium/Electron on Windows.
 * No external libraries or cloud accounts required.
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

  // Check if a custom audio file is available first
  const audio = new Audio('reminder.mp3');
  audio.play()
    .then(() => {
      console.log('[Voice] Playing custom reminder audio file (assets/reminder.mp3).');
    })
    .catch(() => {
      // Fallback to native Windows Speech Synthesis
      try {
        window.speechSynthesis.cancel(); // Cancel any lingering utterances
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
          console.log(`[Voice] Windows Speech Synthesis speaking: "${text}"`);
        };

        utterance.onerror = (e) => {
          console.warn('[Voice] Speech synthesis error:', e);
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[Voice] Failed to execute speech synthesis:', err);
      }
    });
}

export function stopVoice(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

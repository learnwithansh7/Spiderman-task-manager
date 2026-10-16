export interface MotionConfig {
  geometry: {
    anchorXPercent: number;
    descentDepthPercent: number;
    threadWidth: number;
    threadColor: string;
    characterSize: { width: number; height: number };
    characterPivot: { x: number; y: number };
  };
  timing: {
    descentDurationMs: number;
    swayDurationMs: number;
    autoExitMs: number;
    exitDurationMs: number;
  };
  physics: {
    initialScale: number;
    targetScale: number;
    initialSwayAngleDeg: number;
    dampingK: number;
    frequencyW: number;
  };
  noteCard: {
    label: string;
    defaultMessage: string;
    doneButtonText: string;
    snoozeButtonText: string;
    voiceText: string;
    isMutedDefault: boolean;
    springStiffness: number;
    springDamping: number;
    offset: { x: number; y: number };
  };
}

export const MOTION_CONFIG: MotionConfig = {
  geometry: {
    anchorXPercent: 0.82,              // 82% screen width
    descentDepthPercent: 0.14,         // short web strand (~14% screen height) matching reference
    threadWidth: 2.0,                  // clean thin web line
    threadColor: 'rgba(240, 244, 250, 0.9)',
    characterSize: { width: 220, height: 340 },
    characterPivot: { x: 0.5, y: 0.0 }, // anchored at top/feet of upside down Spider-Man
  },
  timing: {
    descentDurationMs: 2500,           // smooth ease-out descent
    swayDurationMs: 3000,              // settling phase
    autoExitMs: 15000,                 // 15 seconds auto exit
    exitDurationMs: 1200,              // ~1.2 seconds climb up
  },
  physics: {
    initialScale: 0.85,                // smooth descent
    targetScale: 1.0,                  // full size
    initialSwayAngleDeg: 0,            // Stays still in fixed heroic hanging pose (no oscillation)
    dampingK: 1.0,
    frequencyW: 0.0,
  },
  noteCard: {
    label: 'REMINDER',
    defaultMessage: 'Time to drink water!',
    doneButtonText: 'Done',
    snoozeButtonText: 'Snooze (5m)',
    voiceText: 'Time to drink water!',
    isMutedDefault: false,
    springStiffness: 170,              // spring stiffness for natural slide-in
    springDamping: 14,                 // spring damping
    offset: { x: -380, y: 70 },        // positioned comfortably beside Spider-Man's torso
  },
};

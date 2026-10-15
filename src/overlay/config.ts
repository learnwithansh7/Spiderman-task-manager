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
    anchorXPercent: 0.80,              // 80% screen width
    descentDepthPercent: 0.35,         // descends to ~35% screen height
    threadWidth: 1.5,                  // thin web line
    threadColor: 'rgba(235, 238, 245, 0.85)',
    characterSize: { width: 72, height: 72 },
    characterPivot: { x: 0.5, y: 0.0 }, // anchored at top/feet of hanging character
  },
  timing: {
    descentDurationMs: 4000,           // ~4 seconds slow ease-out descent
    swayDurationMs: 4000,              // ~4 seconds damped pendulum settling
    autoExitMs: 15000,                 // 15 seconds auto exit
    exitDurationMs: 1500,              // ~1.5 seconds ease-in climb up
  },
  physics: {
    initialScale: 0.8,                 // starts smaller above screen
    targetScale: 1.0,                  // grows to full size (fakes coming toward you)
    initialSwayAngleDeg: 10,           // starting around 10 degrees
    dampingK: 0.75,                    // settles in ~4 seconds: exp(-0.75 * 4) = 0.0498
    frequencyW: 3.5,                   // pendulum oscillation frequency (rad/sec)
  },
  noteCard: {
    label: 'REMINDER',
    defaultMessage: 'Time to drink water!',
    doneButtonText: 'Done',
    snoozeButtonText: 'Snooze (5 min)',
    voiceText: 'Time to drink water!',
    isMutedDefault: false,
    springStiffness: 180,              // spring stiffness for natural slide-in
    springDamping: 15,                 // spring damping
    offset: { x: -285, y: -10 },       // positioned nicely beside character
  },
};

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
    descentDepthPercent: 0.36,         // descends to ~36% screen height
    threadWidth: 2.0,                  // clean thin web line
    threadColor: 'rgba(240, 244, 250, 0.9)',
    characterSize: { width: 160, height: 200 },
    characterPivot: { x: 0.5, y: 0.0 }, // anchored at top/feet of upside down Spider-Man
  },
  timing: {
    descentDurationMs: 4000,           // ~4 seconds slow ease-out descent
    swayDurationMs: 4000,              // ~4 seconds damped pendulum settling
    autoExitMs: 15000,                 // 15 seconds auto exit
    exitDurationMs: 1500,              // ~1.5 seconds ease-in climb up
  },
  physics: {
    initialScale: 0.75,                // starts smaller above screen
    targetScale: 1.0,                  // grows to full size (fakes coming toward you)
    initialSwayAngleDeg: 8,            // clean natural 8 degrees sway
    dampingK: 0.85,                    // settles smoothly: exp(-0.85 * 3.5) = 0.05
    frequencyW: 3.2,                   // pendulum oscillation frequency (rad/sec)
  },
  noteCard: {
    label: 'HEALTH REMINDER',
    defaultMessage: 'Time to drink water!',
    doneButtonText: 'Done',
    snoozeButtonText: 'Snooze (5m)',
    voiceText: 'Time to drink water!',
    isMutedDefault: false,
    springStiffness: 170,              // spring stiffness for natural slide-in
    springDamping: 14,                 // spring damping
    offset: { x: -400, y: -10 },       // guaranteed 50px+ clearance from maximum sway reach
  },
};

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MOTION_CONFIG } from './config';
import { AnimationPhase } from './types';
import { Character } from './Character';
import { NoteCard } from './NoteCard';
import { speakReminder, stopVoice } from './voice';

export const OverlayApp: React.FC = () => {
  const [phase, setPhase] = useState<AnimationPhase>('IDLE');
  const [message, setMessage] = useState<string>(MOTION_CONFIG.noteCard.defaultMessage);
  const [isMuted, setIsMuted] = useState<boolean>(MOTION_CONFIG.noteCard.isMutedDefault);

  // Motion animation states
  const [threadLength, setThreadLength] = useState<number>(0);
  const [swayAngleDeg, setSwayAngleDeg] = useState<number>(0);
  const [characterScale, setCharacterScale] = useState<number>(MOTION_CONFIG.physics.initialScale);
  const [shadowIntensity, setShadowIntensity] = useState<number>(0);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Note card spring & visibility states
  const [springProgress, setSpringProgress] = useState<number>(0);
  const [cardOpacity, setCardOpacity] = useState<number>(0);

  const phaseRef = useRef<AnimationPhase>('IDLE');
  const phaseStartTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const autoExitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retractStartLengthRef = useRef<number>(0);

  // Spring physics variables
  const springPosRef = useRef<number>(0);
  const springVelRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const voicePlayedRef = useRef<boolean>(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ease-out cubic: fast at first, then slower and slower (gives "slows down gently" feel)
  const easeOutCubic = (p: number): number => {
    const inv = 1 - p;
    return 1 - inv * inv * inv;
  };

  // Ease-in quadratic for climb back up
  const easeInQuad = (p: number): number => p * p;

  // Trigger the exit/retract animation
  const startExit = useCallback((reason: string) => {
    if (phaseRef.current === 'EXITING' || phaseRef.current === 'IDLE') return;

    console.log(`[R3 Motion] Starting exit/retract (trigger: ${reason}).`);
    stopVoice();

    if (autoExitTimerRef.current) {
      clearTimeout(autoExitTimerRef.current);
      autoExitTimerRef.current = null;
    }

    retractStartLengthRef.current = threadLength || (windowSize.height * MOTION_CONFIG.geometry.descentDepthPercent);
    setPhase('EXITING');
    phaseStartTimeRef.current = performance.now();
  }, [threadLength, windowSize.height]);

  // Handle Done button click
  const handleDone = useCallback(() => {
    console.log('[R3 Action] Done button clicked.');
    window.electronAPI?.notifyAction('done');
    startExit('Done clicked');
  }, [startExit]);

  // Handle Snooze button click
  const handleSnooze = useCallback(() => {
    console.log('[R3 Action] Snooze (5 min) button clicked.');
    window.electronAPI?.notifyAction('snooze', 5);
    startExit('Snooze (5 min) clicked');
  }, [startExit]);

  // Toggle Mute
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      console.log(`[R3 Voice] Mute toggled: ${next ? 'MUTED' : 'UNMUTED'}`);
      if (next) stopVoice();
      return next;
    });
  }, []);

  // Start the animation sequence
  const startAnimation = useCallback((msg?: string) => {
    if (phaseRef.current !== 'IDLE') {
      console.log('[R3 Motion] Animation already playing. Ignoring duplicate trigger.');
      return;
    }

    const reminderMsg = msg || MOTION_CONFIG.noteCard.defaultMessage;
    setMessage(reminderMsg);
    voicePlayedRef.current = false;

    console.log(`[R3 Motion] Starting descent animation for: "${reminderMsg}"`);
    setThreadLength(0);
    setSwayAngleDeg(0);
    setCharacterScale(MOTION_CONFIG.physics.initialScale);
    setShadowIntensity(0);
    setSpringProgress(0);
    setCardOpacity(0);
    springPosRef.current = 0;
    springVelRef.current = 0;
    lastTimeRef.current = performance.now();

    setPhase('DESCENDING');
    phaseStartTimeRef.current = performance.now();
  }, []);

  // Listen for trigger events from main process
  useEffect(() => {
    console.log('[Renderer] OverlayApp mounted. Notifying main process (renderer-ready).');
    window.electronAPI?.send('renderer-ready');

    if (window.electronAPI?.onTriggerAnimation) {
      console.log('[Renderer] Subscribed to trigger-animation events.');
      const unsubTrigger = window.electronAPI.onTriggerAnimation((payload) => {
        console.log('[Renderer] Received "trigger-animation" event over IPC! Starting animation.');
        startAnimation(payload?.message);
      });
      const unsubExit = window.electronAPI.onTriggerExit?.(() => {
        console.log('[Renderer] Received "trigger-exit" event over IPC! Calling startExit().');
        startExit('IPC test trigger');
      });
      return () => {
        unsubTrigger();
        unsubExit?.();
      };
    }
  }, [startAnimation, startExit]);

  // Animation physics loop
  useEffect(() => {
    const targetLength = windowSize.height * MOTION_CONFIG.geometry.descentDepthPercent;
    const initialAngleRad = (MOTION_CONFIG.physics.initialSwayAngleDeg * Math.PI) / 180;

    const animate = (time: number) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
      lastTimeRef.current = time;

      const currentPhase = phaseRef.current;
      const elapsed = time - phaseStartTimeRef.current;

      if (currentPhase === 'DESCENDING') {
        const progress = Math.min(1, elapsed / MOTION_CONFIG.timing.descentDurationMs);
        const eased = easeOutCubic(progress);

        // Thread lengthens as character descends
        setThreadLength(targetLength * eased);

        // Scale grows from 0.8 to 1.0 (coming toward you effect)
        const scale = MOTION_CONFIG.physics.initialScale +
          (MOTION_CONFIG.physics.targetScale - MOTION_CONFIG.physics.initialScale) * eased;
        setCharacterScale(scale);

        // Soft shadow intensity increases
        setShadowIntensity(eased);

        // Gentle descent swing
        const descendSway = Math.sin(progress * Math.PI) * 1.5;
        setSwayAngleDeg(descendSway);

        // As character nears the bottom (>75%), begin spring reveal of note card
        if (progress > 0.75) {
          const cardFactor = (progress - 0.75) / 0.25;
          setCardOpacity(cardFactor);
        }

        if (progress >= 1) {
          console.log('[R3 Motion] Descent complete. Starting sway phase and presenting note card.');
          setPhase('SWAYING');
          phaseStartTimeRef.current = time;

          // Play voice reminder ONCE when note card appears
          if (!voicePlayedRef.current) {
            voicePlayedRef.current = true;
            console.log('[R3 Voice] Triggering spoken reminder voice once.');
            speakReminder(message, isMuted);
          }

          // Start 15s auto-exit timer
          autoExitTimerRef.current = setTimeout(() => {
            console.log('[R3 Motion] 15s timeout reached without interaction. Auto-climbing back.');
            startExit('15s timeout');
          }, MOTION_CONFIG.timing.autoExitMs);
        }
      } else if (currentPhase === 'SWAYING') {
        const tSec = elapsed / 1000;
        // Damped pendulum formula: angle(t) = A * e^(-k*t) * cos(w*t)
        const damping = Math.exp(-MOTION_CONFIG.physics.dampingK * tSec);
        const osc = Math.cos(MOTION_CONFIG.physics.frequencyW * tSec);
        const angleRad = initialAngleRad * damping * osc;
        const angleDeg = (angleRad * 180) / Math.PI;

        setThreadLength(targetLength);
        setSwayAngleDeg(angleDeg);
        setCharacterScale(MOTION_CONFIG.physics.targetScale);
        setShadowIntensity(1);

        // Note Card Spring Physics
        const targetSpring = 1.0;
        const springForce = -MOTION_CONFIG.noteCard.springStiffness * (springPosRef.current - targetSpring);
        const dampingForce = -MOTION_CONFIG.noteCard.springDamping * springVelRef.current;
        const accel = springForce + dampingForce;
        springVelRef.current += accel * dt;
        springPosRef.current += springVelRef.current * dt;

        setSpringProgress(springPosRef.current);
        setCardOpacity((prev) => Math.min(1, prev + dt * 4));
      } else if (currentPhase === 'EXITING') {
        const progress = Math.min(1, elapsed / MOTION_CONFIG.timing.exitDurationMs);
        const eased = easeInQuad(progress);
        const startL = retractStartLengthRef.current || targetLength;
        const currentL = Math.max(0, startL * (1 - eased));

        setThreadLength(currentL);
        // Angle dampens to zero rapidly while climbing
        setSwayAngleDeg((prev) => prev * (1 - progress));
        setCharacterScale(MOTION_CONFIG.physics.targetScale - 0.2 * eased);
        setShadowIntensity(1 - eased);

        // Fade out card quickly during climb
        setCardOpacity((prev) => Math.max(0, prev - dt * 6));

        if (progress >= 1) {
          console.log('[R3 Motion] Exit complete. Resetting to IDLE and hiding window.');
          setPhase('IDLE');
          setThreadLength(0);
          setSwayAngleDeg(0);
          setCardOpacity(0);
          setSpringProgress(0);
          window.electronAPI?.notifyAnimationComplete();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [windowSize, message, isMuted, startExit]);

  // Geometry calculations
  const anchorX = windowSize.width * MOTION_CONFIG.geometry.anchorXPercent;
  const anchorY = 0;
  const angleRad = (swayAngleDeg * Math.PI) / 180;
  const characterX = anchorX + threadLength * Math.sin(angleRad);
  const characterY = anchorY + threadLength * Math.cos(angleRad);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        pointerEvents: 'none',
        backgroundColor: 'transparent',
      }}
    >
      {/* SVG Thread from top anchor to character */}
      {threadLength > 0 && (
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <line
            x1={anchorX}
            y1={anchorY}
            x2={characterX}
            y2={characterY}
            stroke={MOTION_CONFIG.geometry.threadColor}
            strokeWidth={MOTION_CONFIG.geometry.threadWidth}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Character and NoteCard Container */}
      {threadLength > 0 && (
        <div
          style={{
            position: 'absolute',
            left: characterX,
            top: characterY,
            pointerEvents: 'none',
          }}
        >
          <Character
            size={MOTION_CONFIG.geometry.characterSize}
            pivot={MOTION_CONFIG.geometry.characterPivot}
            angleDeg={swayAngleDeg}
            scale={characterScale}
            shadowIntensity={shadowIntensity}
          />

          <NoteCard
            message={message}
            springProgress={springProgress}
            opacity={cardOpacity}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onDone={handleDone}
            onSnooze={handleSnooze}
          />
        </div>
      )}
    </div>
  );
};

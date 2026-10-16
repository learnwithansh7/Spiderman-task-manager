import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MOTION_CONFIG } from './config';
import { AnimationPhase } from './types';
import { Character } from './Character';
import { WebStrand } from './WebStrand';
import { NoteCard } from './NoteCard';
import { speakReminder, stopVoice } from './voice';

const GREETING_SPEECH_ENABLED = false;

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
  const currentCorrelationIdRef = useRef<string>('#0');
  const startedReportedRef = useRef<boolean>(false);
  const voiceTextRef = useRef<string>('');

  const threadLengthRef = useRef<number>(0);
  const windowHeightRef = useRef<number>(window.innerHeight);

  useEffect(() => {
    windowHeightRef.current = windowSize.height;
  }, [windowSize.height]);

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

    const corrId = currentCorrelationIdRef.current;
    console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Starting exit. State change: LOOP -> OUTRO (reason: ${reason}).`);
    window.electronAPI?.send?.('seq-state', { correlationId: corrId, state: 'OUTRO' });
    stopVoice();

    if (autoExitTimerRef.current) {
      clearTimeout(autoExitTimerRef.current);
      autoExitTimerRef.current = null;
    }

    retractStartLengthRef.current = threadLengthRef.current || (windowHeightRef.current * MOTION_CONFIG.geometry.descentDepthPercent);
    setPhase('EXITING');
    phaseStartTimeRef.current = performance.now();
  }, []);

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
    const corrId = currentCorrelationIdRef.current;
    if (phaseRef.current !== 'IDLE') {
      console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Animation already playing (state=${phaseRef.current}). Ignoring duplicate trigger.`);
      return;
    }

    const reminderMsg = msg || MOTION_CONFIG.noteCard.defaultMessage;
    setMessage(reminderMsg);
    voicePlayedRef.current = false;
    startedReportedRef.current = false;

    console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Animation play() called: starting descent (state=INTRO).`);
    setThreadLength(0);
    threadLengthRef.current = 0;
    setSwayAngleDeg(0);
    setCharacterScale(MOTION_CONFIG.physics.initialScale);
    setShadowIntensity(0);
    setSpringProgress(0);
    setCardOpacity(0);
    springPosRef.current = 0;
    springVelRef.current = 0;
    lastTimeRef.current = performance.now();
    phaseRef.current = 'DESCENDING';
    setPhase('DESCENDING');
    phaseStartTimeRef.current = performance.now();
  }, []);

  // Listen for trigger events from main process (mount once)
  useEffect(() => {
    console.log('[Renderer] OverlayApp mounted. Notifying main process (renderer-ready).');
    window.electronAPI?.send('renderer-ready');

    const cleanups: Array<() => void> = [];

    // Primary sequencer handshake listener: seq-play
    if (window.electronAPI?.on) {
      const unsubSeq = window.electronAPI.on('seq-play', (payload: any) => {
        const corrId = payload?.correlationId || '#1';
        currentCorrelationIdRef.current = corrId;
        voiceTextRef.current = payload?.voiceText || payload?.message || '';
        console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Renderer received seq-play: "${payload?.message}"`);
        startAnimation(payload?.message);
      });
      cleanups.push(unsubSeq);
    }

    if (window.electronAPI?.onTriggerAnimation) {
      const unsubTrigger = window.electronAPI.onTriggerAnimation((payload) => {
        console.log('[Renderer] Received legacy "trigger-animation" event over IPC! Starting animation.');
        startAnimation(payload?.message);
      });
      cleanups.push(unsubTrigger);
    }

    if (window.electronAPI?.onTriggerExit) {
      const unsubExit = window.electronAPI.onTriggerExit(() => {
        console.log('[Renderer] Received "trigger-exit" event over IPC! Calling startExit().');
        startExit('IPC test trigger');
      });
      cleanups.push(unsubExit);
    }

    return () => {
      cleanups.forEach((c) => c());
    };
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

        // First visual frame confirmation (handshake response)
        if (!startedReportedRef.current) {
          startedReportedRef.current = true;
          const corrId = currentCorrelationIdRef.current;
          console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] First visual frame painted ("playing" event). Replying: seq-started.`);
          window.electronAPI?.send?.('seq-started', { correlationId: corrId });
        }

        // Thread lengthens as character descends
        const currentDescentL = targetLength * eased;
        setThreadLength(currentDescentL);
        threadLengthRef.current = currentDescentL;

        // Scale grows from 0.8 to 1.0 (coming toward you effect)
        const scale = MOTION_CONFIG.physics.initialScale +
          (MOTION_CONFIG.physics.targetScale - MOTION_CONFIG.physics.initialScale) * eased;
        setCharacterScale(scale);

        // Soft shadow intensity increases
        setShadowIntensity(eased);

        // Stationary vertical descent (no side-to-side swinging)
        setSwayAngleDeg(0);

        // As character nears the bottom (>75%), begin spring reveal of note card
        if (progress > 0.75) {
          const cardFactor = (progress - 0.75) / 0.25;
          setCardOpacity(cardFactor);
        }

        if (progress >= 1) {
          const corrId = currentCorrelationIdRef.current;
          console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Descent complete. State change: INTRO -> LOOP.`);
          window.electronAPI?.send?.('seq-state', { correlationId: corrId, state: 'LOOP' });
          setPhase('SWAYING');
          phaseStartTimeRef.current = time;

          // Play voice reminder ONCE when note card appears
          if (!voicePlayedRef.current) {
            voicePlayedRef.current = true;
            const textToSpeak = voiceTextRef.current || message;
            console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Voice greeting started: "${textToSpeak}"`);
            window.electronAPI?.send?.('seq-voice-started', { correlationId: corrId, text: textToSpeak });
            if (GREETING_SPEECH_ENABLED) {
              speakReminder(textToSpeak, isMuted);
            }
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
        threadLengthRef.current = targetLength;
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
        threadLengthRef.current = currentL;
        // Angle dampens to zero rapidly while climbing
        setSwayAngleDeg((prev) => prev * (1 - progress));
        setCharacterScale(MOTION_CONFIG.physics.targetScale - 0.2 * eased);
        setShadowIntensity(1 - eased);

        // Fade out card quickly during climb
        setCardOpacity((prev) => Math.max(0, prev - dt * 6));

        if (progress >= 1) {
          const corrId = currentCorrelationIdRef.current;
          console.log(`[Seq] [${corrId}] [${new Date().toISOString()}] Exit complete. State change: OUTRO -> HIDDEN.`);
          setPhase('IDLE');
          setThreadLength(0);
          threadLengthRef.current = 0;
          setSwayAngleDeg(0);
          setCardOpacity(0);
          setSpringProgress(0);
          window.electronAPI?.send?.('seq-complete', { correlationId: corrId });
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
      {/* Dynamic Spider-Web Silk Wave Strand */}
      {threadLength > 0 && (
        <WebStrand
          startX={anchorX}
          startY={anchorY}
          endX={characterX}
          endY={characterY}
          swayAngleDeg={swayAngleDeg}
          timeSec={(lastTimeRef.current || 0) / 1000}
          isDescending={phase === 'DESCENDING'}
        />
      )}

      {/* NoteCard Container - replaced by dedicated cardWindow */}
      {false && cardOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: anchorX + MOTION_CONFIG.noteCard.offset.x,
            top: windowSize.height * MOTION_CONFIG.geometry.descentDepthPercent + MOTION_CONFIG.noteCard.offset.y,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <NoteCard
            message={message}
            springProgress={springProgress}
            opacity={cardOpacity}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onDone={handleDone}
          />
        </div>
      )}

      {/* Spider Character on Web Thread */}
      {threadLength > 0 && (
        <div
          style={{
            position: 'absolute',
            left: characterX,
            top: characterY,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          <Character
            size={MOTION_CONFIG.geometry.characterSize}
            pivot={MOTION_CONFIG.geometry.characterPivot}
            angleDeg={swayAngleDeg}
            scale={characterScale}
            shadowIntensity={shadowIntensity}
            phase={phase}
          />
        </div>
      )}
    </div>
  );
};

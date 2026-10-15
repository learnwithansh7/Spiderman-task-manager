import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MOTION_CONFIG } from './config';
import { AnimationPhase } from './types';
import { Character } from './Character';

export const OverlayApp: React.FC = () => {
  const [phase, setPhase] = useState<AnimationPhase>('IDLE');
  const [threadLength, setThreadLength] = useState<number>(0);
  const [swayAngleDeg, setSwayAngleDeg] = useState<number>(0);
  const [characterScale, setCharacterScale] = useState<number>(MOTION_CONFIG.physics.initialScale);
  const [shadowIntensity, setShadowIntensity] = useState<number>(0);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const phaseRef = useRef<AnimationPhase>('IDLE');
  const phaseStartTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const autoExitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retractStartLengthRef = useRef<number>(0);

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

    console.log(`[R2 Motion] Starting exit/retract (trigger: ${reason}).`);
    if (autoExitTimerRef.current) {
      clearTimeout(autoExitTimerRef.current);
      autoExitTimerRef.current = null;
    }

    retractStartLengthRef.current = threadLength || (windowSize.height * MOTION_CONFIG.geometry.descentDepthPercent);
    setPhase('EXITING');
    phaseStartTimeRef.current = performance.now();
  }, [threadLength, windowSize.height]);

  // Start the animation sequence
  const startAnimation = useCallback(() => {
    if (phaseRef.current !== 'IDLE') {
      console.log('[R2 Motion] Animation already in progress. Ignoring duplicate trigger.');
      return;
    }

    console.log('[R2 Motion] Starting descent animation (4s ease-out)...');
    setThreadLength(0);
    setSwayAngleDeg(0);
    setCharacterScale(MOTION_CONFIG.physics.initialScale);
    setShadowIntensity(0);

    setPhase('DESCENDING');
    phaseStartTimeRef.current = performance.now();
  }, []);

  // Listen for trigger events from main process
  useEffect(() => {
    console.log('[Renderer] OverlayApp mounted. Notifying main process (renderer-ready).');
    window.electronAPI?.send('renderer-ready');

    if (window.electronAPI?.onTriggerAnimation) {
      console.log('[Renderer] Subscribed to trigger-animation events.');
      const unsubTrigger = window.electronAPI.onTriggerAnimation(() => {
        console.log('[Renderer] Received "trigger-animation" event over IPC! Calling startAnimation().');
        startAnimation();
      });
      const unsubExit = window.electronAPI.onTriggerExit?.(() => {
        console.log('[Renderer] Received "trigger-exit" event over IPC! Calling startExit().');
        startExit('IPC test trigger');
      });
      return () => {
        unsubTrigger();
        unsubExit?.();
      };
    } else {
      console.warn('[Renderer] window.electronAPI.onTriggerAnimation is not defined!');
    }
  }, [startAnimation, startExit]);

  // Animation physics loop
  useEffect(() => {
    const targetLength = windowSize.height * MOTION_CONFIG.geometry.descentDepthPercent;
    const initialAngleRad = (MOTION_CONFIG.physics.initialSwayAngleDeg * Math.PI) / 180;

    const animate = (time: number) => {
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

        if (progress >= 1) {
          console.log('[R2 Motion] Descent finished. Starting damped pendulum sway (4s)...');
          setPhase('SWAYING');
          phaseStartTimeRef.current = time;

          // Start 15s auto-exit timer
          autoExitTimerRef.current = setTimeout(() => {
            console.log('[R2 Motion] 15s timeout reached without interaction. Auto-climbing back.');
            startExit('15s timeout');
          }, MOTION_CONFIG.timing.autoExitMs);
        }
      } else if (currentPhase === 'SWAYING') {
        const tSec = elapsed / 1000;
        // Pendulum equation: angle(t) = A * e^(-k*t) * cos(w*t)
        const damping = Math.exp(-MOTION_CONFIG.physics.dampingK * tSec);
        const osc = Math.cos(MOTION_CONFIG.physics.frequencyW * tSec);
        const angleRad = initialAngleRad * damping * osc;
        const angleDeg = (angleRad * 180) / Math.PI;

        setThreadLength(targetLength);
        setSwayAngleDeg(angleDeg);
        setCharacterScale(MOTION_CONFIG.physics.targetScale);
        setShadowIntensity(1);
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

        if (progress >= 1) {
          console.log('[R2 Motion] Exit complete. Resetting to IDLE and hiding window.');
          setPhase('IDLE');
          setThreadLength(0);
          setSwayAngleDeg(0);
          window.electronAPI?.notifyAnimationComplete();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [windowSize, startExit]);

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

      {/* Character hanging upside-down */}
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
            onClick={() => startExit('character clicked')}
          />

          {/* R2 Indicator Card beside character */}
          <div
            onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
            onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true, { forward: true })}
            style={{
              position: 'absolute',
              right: 85,
              top: 10,
              width: 220,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              color: '#f8fafc',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.45)',
              pointerEvents: 'auto',
              userSelect: 'none',
              opacity: phase === 'DESCENDING' ? Math.min(1, threadLength / 100) : phase === 'EXITING' ? 0.2 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              R2: Animation Prototype
            </div>
            <div style={{ fontSize: '13px', margin: '6px 0 10px 0', color: '#cbd5e1' }}>
              Phase: <strong>{phase}</strong>
            </div>
            <button
              onClick={() => startExit('button clicked')}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#0369a1')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0284c7')}
            >
              Climb Up (Exit)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

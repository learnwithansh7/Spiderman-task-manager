import React, { useState, useEffect, useRef } from 'react';
import { AnimationPhase } from './types';

interface CharacterProps {
  size: { width: number; height: number };
  pivot: { x: number; y: number };
  angleDeg: number;
  scale: number;
  shadowIntensity: number; // 0 to 1
  phase?: AnimationPhase;
  onClick?: () => void;
}

type CharacterMediaType = 'video' | 'image' | 'svg';

export const Character: React.FC<CharacterProps> = ({
  size,
  pivot,
  angleDeg,
  scale,
  shadowIntensity,
  phase = 'IDLE',
  onClick,
}) => {
  const [mediaType, setMediaType] = useState<CharacterMediaType | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Detect available character assets with fallback priority:
  // 1. character.webm (alpha channel video)
  // 2. character.png (transparent image)
  // 3. procedural SVG (neutral placeholder)
  useEffect(() => {
    let isCancelled = false;

    async function probeAssets() {
      // Step 1: Probe character.webm
      try {
        console.log('[Character R6] Probing for transparent video: assets/character.webm...');
        const videoProbe = document.createElement('video');
        videoProbe.src = '../character.webm';
        videoProbe.muted = true;
        videoProbe.preload = 'auto';

        const canPlay = await new Promise<boolean>((resolve) => {
          videoProbe.onloadeddata = () => resolve(true);
          videoProbe.onerror = () => {
            // Also test without ../
            const fallbackProbe = document.createElement('video');
            fallbackProbe.src = 'character.webm';
            fallbackProbe.onloadeddata = () => resolve(true);
            fallbackProbe.onerror = () => resolve(false);
          };
          // Timeout after 1200ms
          setTimeout(() => resolve(false), 1200);
        });

        if (!isCancelled && canPlay) {
          console.log('[Character R6] Successfully loaded alpha-channel video: assets/character.webm!');
          setMediaType('video');
          return;
        }
      } catch (err) {
        console.warn('[Character R6] Error probing character.webm:', err);
      }

      // Step 2: Fall back to character.png
      try {
        console.log('[Character R6] assets/character.webm unavailable. Probing assets/character.png...');
        const imgProbe = new Image();
        imgProbe.src = '../character.png';

        const imgLoaded = await new Promise<boolean>((resolve) => {
          imgProbe.onload = () => resolve(true);
          imgProbe.onerror = () => {
            const fallbackImg = new Image();
            fallbackImg.src = 'character.png';
            fallbackImg.onload = () => resolve(true);
            fallbackImg.onerror = () => resolve(false);
          };
          setTimeout(() => resolve(false), 800);
        });

        if (!isCancelled && imgLoaded) {
          console.log('[Character R6] Successfully loaded fallback image: assets/character.png!');
          setMediaType('image');
          return;
        }
      } catch (err) {
        console.warn('[Character R6] Error probing character.png:', err);
      }

      // Step 3: Procedural SVG placeholder
      if (!isCancelled) {
        console.log('[Character R6] Using neutral procedural SVG placeholder shape.');
        setMediaType('svg');
      }
    }

    probeAssets();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Manage video playback according to animation phase
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current) {
      if (phase === 'DESCENDING' || phase === 'SWAYING') {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch((e) => console.warn('[Character R6] Video play error:', e));
      } else if (phase === 'IDLE' || phase === 'EXITING') {
        videoRef.current.pause();
      }
    }
  }, [phase, mediaType]);

  const shadowBlur = Math.round(shadowIntensity * 16);
  const shadowAlpha = (shadowIntensity * 0.45).toFixed(2);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: size.width,
    height: size.height,
    transformOrigin: `${pivot.x * 100}% ${pivot.y * 100}%`,
    transform: `translate(${-pivot.x * size.width}px, ${-pivot.y * size.height}px) rotate(${angleDeg}deg) scale(${scale})`,
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    pointerEvents: 'auto',
    filter: `drop-shadow(0px ${shadowBlur}px ${shadowBlur * 1.5}px rgba(0, 0, 0, ${shadowAlpha}))`,
    transition: 'filter 0.1s linear',
  };

  return (
    <div style={containerStyle} onClick={onClick}>
      {mediaType === 'video' && (
        <video
          ref={videoRef}
          src="../character.webm"
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: 'transparent',
          }}
        />
      )}

      {mediaType === 'image' && (
        <img
          src="../character.png"
          alt="Character"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: 'transparent',
          }}
        />
      )}

      {mediaType === 'svg' && (
        /* Neutral upside-down hanging character placeholder (no copyrighted artwork) */
        <svg
          width={size.width}
          height={size.height}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Thread grip ring at top */}
          <circle cx="32" cy="4" r="2.5" stroke="#e2e8f0" strokeWidth="1.5" fill="none" />

          {/* Upside-down legs holding the thread */}
          <path d="M26 6 Q30 14 32 18" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M38 6 Q34 14 32 18" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M22 10 Q14 16 12 26" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M42 10 Q50 16 52 26" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M20 20 Q8 28 6 40" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M44 20 Q56 28 58 40" stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />

          {/* Main rounded body (upper part of upside-down pose) */}
          <ellipse cx="32" cy="28" rx="14" ry="16" fill="#1e293b" />
          <ellipse cx="32" cy="26" rx="10" ry="12" fill="#334155" opacity="0.6" />

          {/* Head hanging upside down at the bottom */}
          <circle cx="32" cy="48" r="8" fill="#0f172a" />

          {/* Cute neutral eyes */}
          <circle cx="29" cy="50" r="1.5" fill="#f8fafc" />
          <circle cx="35" cy="50" r="1.5" fill="#f8fafc" />

          {/* Lower front arms */}
          <path d="M24 46 Q18 54 22 60" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <path d="M40 46 Q46 54 42 60" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
};

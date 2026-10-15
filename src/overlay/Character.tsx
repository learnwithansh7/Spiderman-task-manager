import React, { useState, useEffect } from 'react';

interface CharacterProps {
  size: { width: number; height: number };
  pivot: { x: number; y: number };
  angleDeg: number;
  scale: number;
  shadowIntensity: number; // 0 to 1
  onClick?: () => void;
}

export const Character: React.FC<CharacterProps> = ({
  size,
  pivot,
  angleDeg,
  scale,
  shadowIntensity,
  onClick,
}) => {
  const [imageExists, setImageExists] = useState<boolean | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = 'character.png';
    img.onload = () => {
      console.log('[Character] Custom assets/character.png found and loaded.');
      setImageExists(true);
    };
    img.onerror = () => {
      console.log('[Character] assets/character.png not found. Using neutral placeholder shape.');
      setImageExists(false);
    };
  }, []);

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
      {imageExists ? (
        <img
          src="character.png"
          alt="Character"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
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

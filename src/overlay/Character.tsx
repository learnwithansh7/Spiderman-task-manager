import React from 'react';
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

/**
 * Character renders the photorealistic 3D Spider-Man hanging upside down in a static heroic pose,
 * exactly matching the reference screenshot.
 */
export const Character: React.FC<CharacterProps> = ({
  size,
  pivot,
  angleDeg,
  scale,
  shadowIntensity,
  onClick,
}) => {
  // Multi-layered realistic 3D volumetric shadow
  const shadowBlur1 = Math.round(shadowIntensity * 28);
  const shadowAlpha1 = (shadowIntensity * 0.55).toFixed(2);
  const shadowBlur2 = Math.round(shadowIntensity * 10);
  const shadowAlpha2 = (shadowIntensity * 0.4).toFixed(2);

  return (
    <div
      style={{
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
        filter: `drop-shadow(0px ${shadowBlur1 * 0.7}px ${shadowBlur1}px rgba(0, 0, 0, ${shadowAlpha1})) drop-shadow(0px ${shadowBlur2 * 0.5}px ${shadowBlur2}px rgba(0, 0, 0, ${shadowAlpha2}))`,
        transition: 'filter 0.15s ease-out',
      }}
      onClick={onClick}
    >
      <img
        src="../character.png"
        alt="Spider Character"
        onError={(e) => {
          // Fallback to bundled original placeholder if custom character.png is not provided
          const img = e.target as HTMLImageElement;
          if (!img.dataset.fallback) {
            img.dataset.fallback = 'true';
            img.src = '../placeholder-character.png';
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

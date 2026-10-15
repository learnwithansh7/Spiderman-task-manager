import React, { useState } from 'react';
import { AnimationPhase } from './types';
import { Model3DViewer } from './Model3DViewer';

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
 * Character renders the 3D Spider-Man model using Model3DViewer (Three.js WebGL)
 * with automatic fallback to high-resolution PNG if WebGL is unavailable.
 */
export const Character: React.FC<CharacterProps> = ({
  size,
  pivot,
  angleDeg,
  scale,
  shadowIntensity,
  phase = 'IDLE',
  onClick,
}) => {
  const [use3DFallback, setUse3DFallback] = useState(false);

  // If 3D model loads and renders cleanly:
  if (!use3DFallback) {
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size.width,
          height: size.height,
          transform: `translate(${-pivot.x * size.width}px, ${-pivot.y * size.height}px)`,
          pointerEvents: 'auto',
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      >
        <Model3DViewer
          width={size.width}
          height={size.height}
          angleDeg={angleDeg}
          scale={scale}
          shadowIntensity={shadowIntensity}
          isPlaying={phase === 'DESCENDING' || phase === 'SWAYING'}
          onFallback={() => {
            console.log('[Character] Falling back to 2D high-res character image.');
            setUse3DFallback(true);
          }}
        />
      </div>
    );
  }

  // 2D Image Fallback
  const shadowBlur = Math.round(shadowIntensity * 16);
  const shadowAlpha = (shadowIntensity * 0.45).toFixed(2);

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
        filter: `drop-shadow(0px ${shadowBlur}px ${shadowBlur * 1.5}px rgba(0, 0, 0, ${shadowAlpha}))`,
        transition: 'filter 0.1s linear',
      }}
      onClick={onClick}
    >
      <img
        src="../character.png"
        alt="Character"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
};

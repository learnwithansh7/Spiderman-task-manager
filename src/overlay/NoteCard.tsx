import React, { useState } from 'react';

interface NoteCardProps {
  message: string;
  springProgress: number; // 0 to 1
  opacity: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onDone: () => void;
  onSnooze?: () => void;
}

/**
 * NoteCard renders the clean card beside Spider-Man:
 * - Light ice-blue / lavender background (#dbe4f9)
 * - 1.5px solid red border (#dc2626) with distinct red square corner tabs at all 4 corners
 * - Red square bullet + uppercase red "TODAY'S WORK" header
 * - Single "Close" button that makes Spider-Man leave (same as Done)
 * - Clean message text
 */
export const NoteCard: React.FC<NoteCardProps> = ({
  message,
  springProgress,
  opacity,
  isMuted,
  onToggleMute,
  onDone,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    window.electronAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
  };

  if (opacity <= 0.01) return null;

  // Spring slide-in: starts 25px to the right and slides into place with natural spring overshoot
  const slideOffsetX = (1 - springProgress) * 25;
  const cardScale = 0.95 + 0.05 * springProgress;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onDone}
      title="Click Close or anywhere on card to dismiss"
      style={{
        position: 'relative',
        width: 260,
        backgroundColor: '#dbe4f9',
        border: '1.5px solid #dc2626',
        borderRadius: '0px',
        padding: '12px 14px 14px 14px',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(220, 38, 38, 0.25)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        transform: `translateX(${slideOffsetX}px) scale(${cardScale})`,
        opacity: opacity,
        pointerEvents: opacity > 0.3 ? 'auto' : 'none',
        userSelect: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'box-shadow 0.2s ease, transform 0.15s ease',
      }}
    >
      {/* 4 Red Corner Tabs */}
      <span
        style={{
          position: 'absolute',
          top: -3,
          left: -3,
          width: 7,
          height: 7,
          backgroundColor: '#dc2626',
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 7,
          height: 7,
          backgroundColor: '#dc2626',
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          bottom: -3,
          left: -3,
          width: 7,
          height: 7,
          backgroundColor: '#dc2626',
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          bottom: -3,
          right: -3,
          width: 7,
          height: 7,
          backgroundColor: '#dc2626',
          pointerEvents: 'none',
        }}
      />

      {/* Header: Red square bullet + uppercase label + single Close button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: '#dc2626',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '1.2px',
              color: '#dc2626',
              textTransform: 'uppercase',
            }}
          >
            TODAY'S WORK
          </span>
        </div>

        {/* Action button: single Close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isHovered ? 1 : 0.85,
            transition: 'opacity 0.2s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onDone}
            title="Dismiss Spider-Man"
            style={{
              background: 'rgba(220, 38, 38, 0.12)',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              borderRadius: '4px',
              cursor: 'pointer',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#b91c1c',
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.25)';
              e.currentTarget.style.color = '#991b1b';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.12)';
              e.currentTarget.style.color = '#b91c1c';
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Main Message Text */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 700,
          lineHeight: '1.35',
          color: '#0f172a',
          letterSpacing: '-0.2px',
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
    </div>
  );
};

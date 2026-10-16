import React, { useState } from 'react';
import { MOTION_CONFIG } from './config';

interface NoteCardProps {
  message: string;
  springProgress: number; // 0 to 1
  opacity: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onDone: () => void;
  onSnooze: () => void;
}

/**
 * NoteCard renders the clean, minimal reminder box matching the user's reference screenshot:
 * - Light ice-blue / lavender background (#dbe4f9)
 * - 1.5px solid red border (#dc2626) with distinct red square corner tabs at all 4 corners
 * - Red square bullet + uppercase red "REMINDER" header
 * - Bold dark charcoal message text with water drop emoji
 * - Click anywhere to dismiss, with subtle hover controls for Snooze (5m) & Voice Mute
 */
export const NoteCard: React.FC<NoteCardProps> = ({
  message,
  springProgress,
  opacity,
  isMuted,
  onToggleMute,
  onDone,
  onSnooze,
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

  // Ensure water drop emoji if not already present in water reminders
  const displayMessage =
    message.toLowerCase().includes('water') && !message.includes('💧')
      ? `${message} 💧`
      : message;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onDone}
      title="Click to dismiss"
      style={{
        position: 'relative',
        width: 250,
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
      {/* 4 Red Corner Tabs (Matching Screenshot) */}
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

      {/* Header: Red square bullet + uppercase red label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
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
            {MOTION_CONFIG.noteCard.label}
          </span>
        </div>

        {/* Hover action buttons: Mute & Snooze */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isHovered ? 1 : 0.4,
            transition: 'opacity 0.2s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '1px 3px',
              fontSize: '12px',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={onSnooze}
            title="Snooze 5 minutes"
            style={{
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '3px',
              cursor: 'pointer',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 700,
              color: '#b91c1c',
              lineHeight: 1.2,
            }}
          >
            5m
          </button>
        </div>
      </div>

      {/* Main Reminder Message Text */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 700,
          lineHeight: '1.35',
          color: '#0f172a',
          letterSpacing: '-0.2px',
          wordBreak: 'break-word',
        }}
      >
        {displayMessage}
      </div>
    </div>
  );
};

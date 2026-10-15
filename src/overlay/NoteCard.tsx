import React from 'react';
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

export const NoteCard: React.FC<NoteCardProps> = ({
  message,
  springProgress,
  opacity,
  isMuted,
  onToggleMute,
  onDone,
  onSnooze,
}) => {
  const handleMouseEnter = () => {
    window.electronAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
  };

  if (opacity <= 0.01) return null;

  // Spring translation offset and scale
  const slideOffsetX = (1 - springProgress) * 35;
  const cardScale = 0.94 + 0.06 * springProgress;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute',
        left: MOTION_CONFIG.noteCard.offset.x,
        top: MOTION_CONFIG.noteCard.offset.y,
        width: 260,
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: '14px',
        padding: '16px 18px',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25)',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transform: `translateX(${slideOffsetX}px) scale(${cardScale})`,
        opacity: opacity,
        pointerEvents: opacity > 0.3 ? 'auto' : 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header: Label Badge + Mute Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: '#38bdf8',
              boxShadow: '0 0 6px #38bdf8',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: '#94a3b8',
              textTransform: 'uppercase',
            }}
          >
            {MOTION_CONFIG.noteCard.label}
          </span>
        </div>

        {/* Audio Mute/Unmute Toggle */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
          style={{
            background: 'none',
            border: 'none',
            color: isMuted ? '#64748b' : '#38bdf8',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '13px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          {isMuted ? '🔇' : '🔊'}
          <span style={{ fontSize: '10px', color: '#64748b' }}>{isMuted ? 'Muted' : 'Voice'}</span>
        </button>
      </div>

      {/* Reminder Message Text */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          lineHeight: '1.4',
          color: '#f1f5f9',
        }}
      >
        {message}
      </div>

      {/* Action Buttons: Done and Snooze (5 minutes) */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <button
          onClick={onDone}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#16a34a',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#22c55e')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#16a34a')}
        >
          {MOTION_CONFIG.noteCard.doneButtonText}
        </button>

        <button
          onClick={onSnooze}
          style={{
            flex: 1.3,
            padding: '8px 10px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            color: '#cbd5e1',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
        >
          {MOTION_CONFIG.noteCard.snoozeButtonText}
        </button>
      </div>
    </div>
  );
};

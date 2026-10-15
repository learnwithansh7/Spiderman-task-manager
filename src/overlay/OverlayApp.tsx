import React, { useState } from 'react';
import './types';

export const OverlayApp: React.FC = () => {
  const [clickCount, setClickCount] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    // Allow pointer clicks and interactions inside the card
    window.electronAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Clicks pass through everywhere outside the card
    window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
  };

  const handleDismiss = () => {
    window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
    window.electronAPI?.hideOverlay();
  };

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
      {/* Coloured shape card anchored in upper-right screen area */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'absolute',
          top: 60,
          right: 80,
          width: 320,
          backgroundColor: 'rgba(18, 22, 30, 0.94)',
          backdropFilter: 'blur(16px)',
          border: isHovered ? '2px solid #58a6ff' : '2px solid rgba(88, 166, 255, 0.4)',
          borderRadius: '14px',
          padding: '20px 24px',
          boxShadow: isHovered
            ? '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(88, 166, 255, 0.35)'
            : '0 12px 32px rgba(0, 0, 0, 0.5)',
          color: '#f0f6fc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          pointerEvents: 'auto',
          userSelect: 'none',
          transition: 'border 0.2s ease, box-shadow 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#3fb950',
                boxShadow: '0 0 8px #3fb950',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '1px',
                color: '#58a6ff',
                textTransform: 'uppercase',
              }}
            >
              R1: Overlay Foundation
            </span>
          </div>

          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: isHovered ? 'rgba(63, 185, 80, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: isHovered ? '#3fb950' : '#8b949e',
              fontWeight: 600,
            }}
          >
            {isHovered ? 'Mouse Active' : 'Pass-Through'}
          </span>
        </div>

        {/* Informational Text */}
        <div style={{ fontSize: '14px', lineHeight: '1.45', color: '#c9d1d9' }}>
          This overlay is <strong>transparent</strong>, <strong>frameless</strong>, and <strong>always on top</strong>.
          Clicks pass through everywhere outside this shape so you can type and work in other apps underneath.
        </div>

        {/* Interactive Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={() => setClickCount((c) => c + 1)}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#238636',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2ea043')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#238636')}
          >
            Clicks: {clickCount}
          </button>

          <button
            onClick={handleDismiss}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '8px',
              border: '1px solid rgba(240, 246, 252, 0.2)',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#f0f6fc',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.16)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

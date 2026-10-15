const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  console.log('[R6 Generator] Starting character.webm alpha video generator...');

  const tempDir = path.resolve(__dirname, '../docs/temp_frames');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const win = new BrowserWindow({
    width: 128,
    height: 128,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
        canvas { background: transparent; }
      </style>
    </head>
    <body>
      <canvas id="c" width="128" height="128"></canvas>
      <script>
        const { ipcRenderer } = require('electron');
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');

        function drawSpider(t) {
          ctx.clearRect(0, 0, 128, 128);

          const breathe = Math.sin(t * Math.PI * 2) * 1.5;
          const legWiggle = Math.sin(t * Math.PI * 2 * 2);

          // Top thread grip ring
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(64, 8, 5, 0, Math.PI * 2);
          ctx.stroke();

          // Upper legs holding thread (upside-down spider)
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';

          // Leg pair 1 (holding top)
          ctx.beginPath();
          ctx.moveTo(52, 12);
          ctx.quadraticCurveTo(60, 28, 64, 36);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(76, 12);
          ctx.quadraticCurveTo(68, 28, 64, 36);
          ctx.stroke();

          // Leg pair 2 (curved outwards)
          ctx.beginPath();
          ctx.moveTo(44, 20);
          ctx.quadraticCurveTo(28, 32 + legWiggle * 2, 24, 52);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(84, 20);
          ctx.quadraticCurveTo(100, 32 - legWiggle * 2, 104, 52);
          ctx.stroke();

          // Leg pair 3 (mid body)
          ctx.beginPath();
          ctx.moveTo(40, 40);
          ctx.quadraticCurveTo(16, 56 - legWiggle * 2, 12, 80);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(88, 40);
          ctx.quadraticCurveTo(112, 56 + legWiggle * 2, 116, 80);
          ctx.stroke();

          // Main body (abdomen, upside down)
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.ellipse(64, 56, 28 + breathe * 0.5, 32 + breathe, 0, 0, Math.PI * 2);
          ctx.fill();

          // Abdomen highlight
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.ellipse(64, 52, 20, 24, 0, 0, Math.PI * 2);
          ctx.fill();

          // Head (at bottom)
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(64, 96, 16, 0, Math.PI * 2);
          ctx.fill();

          // Eyes (blinking at t ~ 0.45 to 0.55)
          const isBlinking = t > 0.46 && t < 0.54;
          ctx.fillStyle = '#f8fafc';
          if (isBlinking) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f8fafc';
            ctx.beginPath();
            ctx.moveTo(55, 100); ctx.lineTo(61, 100);
            ctx.moveTo(67, 100); ctx.lineTo(73, 100);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(58, 100, 3.5, 0, Math.PI * 2);
            ctx.arc(70, 100, 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Eye shine
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(59, 99, 1.2, 0, Math.PI * 2);
            ctx.arc(71, 99, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Lower front legs
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(48, 92);
          ctx.quadraticCurveTo(36, 108 + legWiggle * 3, 44, 120);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(80, 92);
          ctx.quadraticCurveTo(92, 108 - legWiggle * 3, 84, 120);
          ctx.stroke();
        }

        window.renderFrame = (t) => {
          drawSpider(t);
          return canvas.toDataURL('image/png');
        };
      </script>
    </body>
  </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  console.log('[R6 Generator] Rendering 60 frames of neutral hanging character animation...');
  const totalFrames = 60; // 2 seconds at 30fps

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const dataUrl = await win.webContents.executeJavaScript(`window.renderFrame(${t})`);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const frameFile = path.join(tempDir, `frame_${String(i).padStart(2, '0')}.png`);
    fs.writeFileSync(frameFile, base64Data, 'base64');
  }

  // Also write frame 0 as character.png placeholder fallback
  const pngTarget = path.resolve(__dirname, '../assets/character.png');
  const frame0 = path.join(tempDir, 'frame_00.png');
  fs.copyFileSync(frame0, pngTarget);
  console.log(`[R6 Generator] Created assets/character.png (${fs.statSync(pngTarget).size} bytes).`);

  // Use ffmpeg to encode VP9 WebM with alpha channel
  const webmTarget = path.resolve(__dirname, '../assets/character.webm');
  console.log('[R6 Generator] Encoding WebM video with alpha channel via ffmpeg...');

  const ffmpegCmd = `ffmpeg -y -framerate 30 -i "${path.join(tempDir, 'frame_%02d.png')}" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 800k -auto-alt-ref 0 "${webmTarget}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  console.log(`[R6 Generator] Created assets/character.webm (${fs.statSync(webmTarget).size} bytes)!`);

  // Clean up temporary frame PNGs
  const files = fs.readdirSync(tempDir);
  for (const f of files) {
    fs.unlinkSync(path.join(tempDir, f));
  }
  fs.rmdirSync(tempDir);

  win.destroy();
  console.log('[R6 Generator] Generator completed successfully.');
  app.quit();
});

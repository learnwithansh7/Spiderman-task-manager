const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  console.log('[R8 Icon] Generating 256x256 high-resolution application icon...');

  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const html = `
  <!DOCTYPE html>
  <html>
    <body style="margin:0;padding:0;background:transparent;">
      <canvas id="c" width="256" height="256"></canvas>
      <script>
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');

        // Rounded background squircle
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(16, 16, 224, 224, 48);
        ctx.fill();

        // Subtle gradient border
        const grad = ctx.createLinearGradient(16, 16, 240, 240);
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(1, '#0284c7');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(16, 16, 224, 224, 48);
        ctx.stroke();

        // Spider web subtle background lines
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(128, 16); ctx.lineTo(128, 240);
        ctx.moveTo(16, 128); ctx.lineTo(240, 128);
        ctx.moveTo(48, 48); ctx.lineTo(208, 208);
        ctx.moveTo(208, 48); ctx.lineTo(48, 208);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(128, 128, 60, 0, Math.PI * 2);
        ctx.stroke();

        // Center neutral hanging spider
        ctx.save();
        ctx.translate(128, 128);
        ctx.scale(1.2, 1.2);

        // Legs
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        // Upper legs holding thread
        ctx.beginPath(); ctx.moveTo(-16, -40); ctx.quadraticCurveTo(-6, -24, 0, -18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(16, -40); ctx.quadraticCurveTo(6, -24, 0, -18); ctx.stroke();

        // Mid legs
        ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(-42, -6, -46, 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, -20); ctx.quadraticCurveTo(42, -6, 46, 14); ctx.stroke();

        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.quadraticCurveTo(-46, 16, -50, 42); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(22, 0); ctx.quadraticCurveTo(46, 16, 50, 42); ctx.stroke();

        // Abdomen
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(0, -4, 16, 20, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 36, 15, 0, Math.PI * 2);
        ctx.fill();

        // Glowing cyan eyes
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(-5, 38, 3.5, 0, Math.PI * 2);
        ctx.arc(5, 38, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(-5, 38, 1.5, 0, Math.PI * 2);
        ctx.arc(5, 38, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Front legs
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-12, 34); ctx.quadraticCurveTo(-22, 50, -14, 60); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, 34); ctx.quadraticCurveTo(22, 50, 14, 60); ctx.stroke();

        ctx.restore();

        window.getIconData = () => canvas.toDataURL('image/png');
      </script>
    </body>
  </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const dataUrl = await win.webContents.executeJavaScript('window.getIconData()');
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

  const iconPng = path.resolve(__dirname, '../assets/icon.png');
  fs.writeFileSync(iconPng, base64, 'base64');
  console.log(`[R8 Icon] Generated assets/icon.png (256x256, ${fs.statSync(iconPng).size} bytes).`);

  // Convert to .ico using ffmpeg
  const iconIco = path.resolve(__dirname, '../assets/icon.ico');
  execSync(`ffmpeg -y -i "${iconPng}" "${iconIco}"`, { stdio: 'inherit' });
  console.log(`[R8 Icon] Generated assets/icon.ico (${fs.statSync(iconIco).size} bytes).`);

  win.destroy();
  app.quit();
});

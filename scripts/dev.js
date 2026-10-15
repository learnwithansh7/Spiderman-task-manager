const { spawn, execSync } = require('child_process');
const path = require('path');
const electron = require('electron');

async function start() {
  // Clean up any stale background instances before launching dev
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM SpiderReminder.exe /T 2>nul || exit 0', { stdio: 'ignore' });
    }
  } catch {}

  const { createServer } = await import('vite');

  console.log('[Dev] Compiling Electron main and preload scripts...');
  try {
    execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  } catch (err) {
    console.error('[Dev] Failed to compile electron TypeScript.');
    process.exit(1);
  }

  console.log('[Dev] Starting Vite development server for overlay...');
  const viteServer = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5173 },
  });

  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const devUrl = `http://localhost:${address.port}`;
  console.log(`[Dev] Vite server ready at ${devUrl}`);

  console.log('[Dev] Launching Electron process...');
  const electronProcess = spawn(electron, ['.', ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: devUrl,
    },
    stdio: 'inherit',
  });

  electronProcess.on('close', async (code) => {
    console.log(`[Dev] Electron exited with code ${code}. Stopping Vite server.`);
    await viteServer.close();
    process.exit(code || 0);
  });

  process.on('SIGINT', async () => {
    electronProcess.kill();
    await viteServer.close();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[Dev] Error starting dev environment:', err);
  process.exit(1);
});

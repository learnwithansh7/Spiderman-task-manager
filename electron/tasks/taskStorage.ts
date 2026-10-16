import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Task, TasksDataFile } from './types';

export class TaskStorage {
  private readonly tasksDir: string;
  private readonly tasksFilePath: string;
  private readonly bakFilePath: string;
  private readonly tmpFilePath: string;
  private readonly backupsDir: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(customBaseDir?: string) {
    let baseDir: string;
    if (customBaseDir) {
      baseDir = customBaseDir;
    } else {
      try {
        const srDir = path.join(process.env.APPDATA || '', 'spider-reminder');
        const defaultUserData = app && app.getPath ? app.getPath('userData') : '';
        if (fs.existsSync(path.join(srDir, 'tasks'))) {
          baseDir = srDir;
        } else if (defaultUserData) {
          baseDir = defaultUserData;
        } else {
          baseDir = srDir;
        }
      } catch {
        baseDir = process.cwd();
      }
    }

    this.tasksDir = path.join(baseDir, 'tasks');
    this.tasksFilePath = path.join(this.tasksDir, 'tasks.json');
    this.bakFilePath = path.join(this.tasksDir, 'tasks.json.bak');
    this.tmpFilePath = path.join(this.tasksDir, 'tasks.json.tmp');
    this.backupsDir = path.join(this.tasksDir, 'backups');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true });
      }
      if (!fs.existsSync(this.backupsDir)) {
        fs.mkdirSync(this.backupsDir, { recursive: true });
      }
    } catch (err: any) {
      console.error(`[Tasks] Failed to initialize tasks directory: ${err?.message || err}`);
    }
  }

  public getTasksFilePath(): string {
    return this.tasksFilePath;
  }

  public getBakFilePath(): string {
    return this.bakFilePath;
  }

  public getBackupsDir(): string {
    return this.backupsDir;
  }

  /**
   * Validates a single task object according to the schema rules.
   */
  public isValidTask(t: any): t is Task {
    if (!t || typeof t !== 'object') return false;
    if (typeof t.id !== 'string' || !t.id) return false;
    if (typeof t.title !== 'string') return false;
    const trimmedTitle = t.title.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 200) return false;
    if (t.done !== undefined && typeof t.done !== 'boolean') return false;
    return true;
  }

  /**
   * Validates a parsed tasks JSON structure. Returns Task[] if valid, null otherwise.
   * Tasks loaded without "done" are treated as done=false.
   */
  public validateDataFile(data: any): Task[] | null {
    if (!data || typeof data !== 'object') return null;
    if (data.version !== 1) return null;
    if (!Array.isArray(data.tasks)) return null;

    const validated: Task[] = [];
    for (const item of data.tasks) {
      if (!this.isValidTask(item)) {
        return null;
      }
      const isDone = typeof item.done === 'boolean' ? item.done : false;
      validated.push({
        ...item,
        id: item.id,
        title: item.title.trim(),
        done: isDone,
        order: typeof item.order === 'number' ? item.order : 0,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        completedAt: item.completedAt !== undefined ? item.completedAt : (isDone ? new Date().toISOString() : null),
        archived: typeof item.archived === 'boolean' ? item.archived : false,
        dueDate: null,
        priority: null,
      });
    }
    return validated;
  }

  /**
   * Loads tasks from disk with fallback recovery from tasks.json.bak and corruption archiving.
   * Never throws to the caller.
   */
  public load(): Task[] {
    this.ensureDirectories();

    let mainContent: any = null;
    let mainValid = false;

    if (fs.existsSync(this.tasksFilePath)) {
      try {
        const raw = fs.readFileSync(this.tasksFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const tasks = this.validateDataFile(parsed);
        if (tasks !== null) {
          mainContent = tasks;
          mainValid = true;
        } else {
          console.warn('[Tasks] tasks.json failed schema validation.');
        }
      } catch (err: any) {
        console.warn(`[Tasks] Error reading/parsing tasks.json: ${err?.message || err}`);
      }
    }

    if (mainValid && mainContent !== null) {
      console.log(`[Tasks] Successfully loaded ${mainContent.length} tasks from tasks.json.`);
      return mainContent;
    }

    const mainExists = fs.existsSync(this.tasksFilePath);
    const bakExists = fs.existsSync(this.bakFilePath);

    if (!mainExists && !bakExists) {
      console.log('[Tasks] No existing task store found. Initialized with empty task list.');
      return [];
    }

    // Main file missing or damaged: attempt recovery from backup
    console.warn('[Tasks] tasks.json damaged or missing. Attempting recovery from tasks.json.bak...');
    let bakContent: any = null;
    let bakValid = false;

    if (fs.existsSync(this.bakFilePath)) {
      try {
        const rawBak = fs.readFileSync(this.bakFilePath, 'utf-8');
        const parsedBak = JSON.parse(rawBak);
        const tasksBak = this.validateDataFile(parsedBak);
        if (tasksBak !== null) {
          bakContent = tasksBak;
          bakValid = true;
        } else {
          console.warn('[Tasks] tasks.json.bak failed schema validation.');
        }
      } catch (err: any) {
        console.warn(`[Tasks] Error reading/parsing tasks.json.bak: ${err?.message || err}`);
      }
    }

    if (bakValid && bakContent !== null) {
      console.log(`[Tasks] Recovered ${bakContent.length} tasks from tasks.json.bak.`);
      try {
        // Restore good backup to main tasks.json
        this.writeAtomicSync(bakContent);
      } catch (writeErr: any) {
        console.error(`[Tasks] Failed to restore backup to tasks.json: ${writeErr?.message || writeErr}`);
      }
      return bakContent;
    }

    // Both are damaged or missing: handle corruption renaming
    const timestamp = Date.now();
    if (fs.existsSync(this.tasksFilePath)) {
      const corruptMain = path.join(this.tasksDir, `tasks.json.corrupt-${timestamp}`);
      try {
        fs.renameSync(this.tasksFilePath, corruptMain);
        console.warn(`[Tasks] Renamed damaged tasks.json to ${path.basename(corruptMain)}.`);
      } catch (renErr: any) {
        console.error(`[Tasks] Failed to rename corrupt tasks.json: ${renErr?.message || renErr}`);
      }
    }

    if (fs.existsSync(this.bakFilePath)) {
      const corruptBak = path.join(this.tasksDir, `tasks.json.bak.corrupt-${timestamp}`);
      try {
        fs.renameSync(this.bakFilePath, corruptBak);
        console.warn(`[Tasks] Renamed damaged tasks.json.bak to ${path.basename(corruptBak)}.`);
      } catch (renBakErr: any) {
        console.error(`[Tasks] Failed to rename corrupt tasks.json.bak: ${renBakErr?.message || renBakErr}`);
      }
    }

    console.log('[Tasks] Starting with empty task list.');
    return [];
  }

  /**
   * Serializes writes to disk through a single FIFO queue to guarantee no concurrency races.
   */
  public save(tasks: Task[]): Promise<void> {
    const operation = () => {
      return new Promise<void>((resolve, reject) => {
        try {
          this.writeAtomicSync(tasks);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    };

    // Chain onto writeQueue
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  /**
   * Writes the tasks array atomically to disk with backup rotation and daily snapshot retention.
   */
  private writeAtomicSync(tasks: Task[]): void {
    this.ensureDirectories();

    const data: TasksDataFile = {
      version: 1,
      tasks,
    };
    const jsonStr = JSON.stringify(data, null, 2);

    // 1. Write to temporary file
    fs.writeFileSync(this.tmpFilePath, jsonStr, 'utf-8');

    // 2. If valid tasks.json already exists, copy it to tasks.json.bak
    if (fs.existsSync(this.tasksFilePath)) {
      try {
        fs.copyFileSync(this.tasksFilePath, this.bakFilePath);
      } catch (copyErr: any) {
        console.warn(`[Tasks] Failed to update tasks.json.bak: ${copyErr?.message || copyErr}`);
      }
    }

    // 3. Atomically rename tmp to tasks.json
    try {
      fs.renameSync(this.tmpFilePath, this.tasksFilePath);
    } catch {
      // Windows fallback if destination is momentarily locked
      fs.copyFileSync(this.tmpFilePath, this.tasksFilePath);
      try {
        fs.unlinkSync(this.tmpFilePath);
      } catch {}
    }

    // 4. Daily backup snapshot (keep last 7)
    this.rotateDailyBackups(jsonStr);

    console.log(`[Tasks] Atomically saved ${tasks.length} tasks to disk.`);
  }

  /**
   * Creates a daily backup snapshot tasks-YYYY-MM-DD.json and retains only the last 7 daily files.
   */
  private rotateDailyBackups(currentJsonStr: string): void {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayDateStr = `${year}-${month}-${day}`;
      const dailyBackupPath = path.join(this.backupsDir, `tasks-${todayDateStr}.json`);

      // Write daily snapshot if not already created today
      if (!fs.existsSync(dailyBackupPath)) {
        fs.writeFileSync(dailyBackupPath, currentJsonStr, 'utf-8');
        console.log(`[Tasks] Created daily backup snapshot: tasks-${todayDateStr}.json`);
      }

      // Prune backups: keep only last 7
      const files = fs.readdirSync(this.backupsDir)
        .filter((f) => /^tasks-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort(); // Lexicographical sort corresponds to chronological for YYYY-MM-DD

      if (files.length > 7) {
        const toDelete = files.slice(0, files.length - 7);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(path.join(this.backupsDir, file));
            console.log(`[Tasks] Pruned older daily backup: ${file}`);
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn(`[Tasks] Daily backup rotation error: ${err?.message || err}`);
    }
  }
}

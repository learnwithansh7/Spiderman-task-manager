import { EventEmitter } from 'events';
import crypto from 'crypto';
import { Task } from './types';
import { TaskStorage } from './taskStorage';

export interface TaskServiceOptions {
  customBaseDir?: string;
  autoMidnightSchedule?: boolean;
}

export class TaskService extends EventEmitter {
  private readonly storage: TaskStorage;
  private tasks: Task[] = [];
  private midnightTimer: NodeJS.Timeout | null = null;
  private readonly maxTasks = 5000;

  constructor(options: TaskServiceOptions = {}) {
    super();
    this.storage = new TaskStorage(options.customBaseDir);
    this.tasks = this.storage.load();

    if (options.autoMidnightSchedule !== false) {
      // Run archive at startup
      this.archiveOldCompleted();
      // Setup timer for local midnight
      this.scheduleMidnightArchive();
    }
  }

  public getStorage(): TaskStorage {
    return this.storage;
  }

  /**
   * Returns a copy of the tasks list.
   * If includeArchived is false (default), excludes archived tasks.
   * Orders open tasks by order ascending, then completed tasks.
   */
  public list(options: { includeArchived?: boolean } = {}): Task[] {
    const includeArchived = !!options.includeArchived;
    const filtered = includeArchived
      ? this.tasks.slice()
      : this.tasks.filter((t) => !t.archived);

    // Sort: open tasks first sorted by order asc, then completed tasks by completedAt desc
    return filtered.sort((a, b) => {
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }
      if (!a.done) {
        return a.order - b.order;
      }
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  /**
   * Adds a new task.
   */
  public async add(title: string): Promise<Task> {
    if (typeof title !== 'string') {
      throw new Error('Task title must be a string');
    }
    const trimmed = title.trim();
    if (trimmed.length < 1) {
      throw new Error('Task title cannot be empty');
    }
    if (trimmed.length > 200) {
      throw new Error('Task title cannot exceed 200 characters');
    }
    if (this.tasks.length >= this.maxTasks) {
      throw new Error(`Maximum limit of ${this.maxTasks} tasks reached`);
    }

    // Determine highest order among open tasks
    const openTasks = this.tasks.filter((t) => !t.done && !t.archived);
    const maxOrder = openTasks.reduce((max, t) => Math.max(max, t.order), -1);
    const nextOrder = maxOrder + 1;

    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: trimmed,
      done: false,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archived: false,
      dueDate: null,
      priority: null,
    };

    this.tasks.push(task);
    await this.storage.save(this.tasks);
    console.log(`[Tasks] Added task (id: ${task.id}, count: ${this.tasks.length})`);
    this.emit('changed');
    return { ...task };
  }

  /**
   * Updates an existing task's properties (such as title).
   */
  public async update(id: string, patch: { title?: string }): Promise<Task> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const task = this.tasks[idx];
    if (patch.title !== undefined) {
      if (typeof patch.title !== 'string') {
        throw new Error('Task title must be a string');
      }
      const trimmed = patch.title.trim();
      if (trimmed.length < 1) {
        throw new Error('Task title cannot be empty');
      }
      if (trimmed.length > 200) {
        throw new Error('Task title cannot exceed 200 characters');
      }
      task.title = trimmed;
    }

    task.updatedAt = new Date().toISOString();
    await this.storage.save(this.tasks);
    console.log(`[Tasks] Updated task (id: ${task.id})`);
    this.emit('changed');
    return { ...task };
  }

  /**
   * Toggles task completion state.
   */
  public async toggle(id: string): Promise<Task> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const task = this.tasks[idx];
    task.done = !task.done;
    task.updatedAt = new Date().toISOString();

    if (task.done) {
      task.completedAt = task.updatedAt;
    } else {
      task.completedAt = null;
      task.archived = false;
    }

    await this.storage.save(this.tasks);
    console.log(`[Tasks] Toggled task (id: ${task.id}, done: ${task.done})`);
    this.emit('changed');
    return { ...task };
  }

  /**
   * Removes a task by ID. Returns the removed task for undo/restore support.
   */
  public async remove(id: string): Promise<Task> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error(`Task not found: ${id}`);
    }

    const [removed] = this.tasks.splice(idx, 1);
    await this.storage.save(this.tasks);
    console.log(`[Tasks] Removed task (id: ${removed.id}, remaining: ${this.tasks.length})`);
    this.emit('changed');
    return { ...removed };
  }

  /**
   * Restores a removed task.
   */
  public async restore(task: Task): Promise<Task> {
    if (!this.storage.isValidTask(task)) {
      throw new Error('Invalid task structure for restore');
    }

    const idx = this.tasks.findIndex((t) => t.id === task.id);
    const restored: Task = {
      ...task,
      updatedAt: new Date().toISOString(),
    };

    if (idx !== -1) {
      this.tasks[idx] = restored;
    } else {
      this.tasks.push(restored);
    }

    await this.storage.save(this.tasks);
    console.log(`[Tasks] Restored task (id: ${restored.id})`);
    this.emit('changed');
    return { ...restored };
  }

  /**
   * Reorders open tasks according to an array of task IDs in desired order.
   */
  public async reorder(idsInOrder: string[]): Promise<Task[]> {
    if (!Array.isArray(idsInOrder)) {
      throw new Error('idsInOrder must be an array of task IDs');
    }

    let changed = false;
    idsInOrder.forEach((id, newOrder) => {
      const task = this.tasks.find((t) => t.id === id);
      if (task && task.order !== newOrder) {
        task.order = newOrder;
        task.updatedAt = new Date().toISOString();
        changed = true;
      }
    });

    if (changed) {
      await this.storage.save(this.tasks);
      console.log(`[Tasks] Reordered ${idsInOrder.length} tasks.`);
      this.emit('changed');
    }
    return this.list();
  }

  /**
   * Archives completed tasks that were finished before today's local midnight.
   */
  public async archiveOldCompleted(now?: Date): Promise<number> {
    const ref = now || new Date();
    const localMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);

    let archiveCount = 0;
    const nowIso = new Date().toISOString();

    for (const task of this.tasks) {
      if (task.done && task.completedAt && !task.archived) {
        const completedTime = new Date(task.completedAt).getTime();
        if (completedTime < localMidnight.getTime()) {
          task.archived = true;
          task.updatedAt = nowIso;
          archiveCount++;
        }
      }
    }

    if (archiveCount > 0) {
      await this.storage.save(this.tasks);
      console.log(`[Tasks] Archived ${archiveCount} completed tasks from before midnight.`);
      this.emit('changed');
    }
    return archiveCount;
  }

  /**
   * Schedules a daily recurring archive job at local midnight.
   */
  private scheduleMidnightArchive(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }

    const now = new Date();
    const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
    const msUntilMidnight = Math.max(1000, tomorrowMidnight.getTime() - now.getTime());

    console.log(`[Tasks] Scheduled midnight archive in ${Math.round(msUntilMidnight / 60000)} minutes.`);
    this.midnightTimer = setTimeout(async () => {
      try {
        await this.archiveOldCompleted();
      } catch (err: any) {
        console.warn(`[Tasks] Error in midnight archive job: ${err?.message || err}`);
      }
      this.scheduleMidnightArchive();
    }, msUntilMidnight);
  }

  /**
   * Cleans up timers when shutting down.
   */
  public destroy(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }
  }
}

export interface Task {
  id: string;                         // uuid string
  title: string;                      // 1 to 200 characters, trimmed, any Unicode
  done: boolean;                      // true when completed
  order: number;                      // position among open tasks (0, 1, 2...)
  createdAt: string;                  // ISO 8601 date string
  updatedAt: string;                  // ISO 8601 date string
  completedAt: string | null;         // ISO 8601 date string when ticked, null when unticked
  archived: boolean;                  // true for completed tasks from previous days
  dueDate: null;                      // Reserved for later. Always null in version 1.
  priority: null;                     // Reserved for later. Always null in version 1.
}

export interface TasksDataFile {
  version: 1;
  tasks: Task[];
}

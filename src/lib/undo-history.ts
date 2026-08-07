/**
 * One undo stack for both views.
 *
 * Every action that writes to a note registers how to reverse itself. The
 * history is shared, so a link drawn in the Gantt can be taken back from the
 * map and vice versa — the alternative, a stack per view, makes "undo" mean
 * different things depending on where you are looking.
 *
 * Redo is deliberately absent: the vault is the source of truth and can be
 * edited from anywhere, so a redo stack would go stale without warning.
 */

export interface UndoEntry {
  /** Shown on the button, e.g. "moved 3 tasks by 2 days". */
  label: string;
  undo: () => Promise<void>;
}

/** Older entries are dropped; an undo from far enough back is not trustworthy. */
const MAX_ENTRIES = 50;

export class UndoHistory {
  private entries: UndoEntry[] = [];
  private listeners = new Set<() => void>();
  private running = false;

  push(entry: UndoEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.notify();
  }

  canUndo(): boolean {
    return this.entries.length > 0 && !this.running;
  }

  /** What pressing undo would take back. */
  peekLabel(): string | null {
    return this.entries[this.entries.length - 1]?.label ?? null;
  }

  /**
   * Reverses the most recent action. A failed undo does not put the entry
   * back: the vault is in an unknown state and retrying would compound it.
   */
  async undoLast(): Promise<string | null> {
    if (this.running) return null;

    const entry = this.entries.pop();
    if (!entry) return null;

    this.running = true;
    this.notify();

    try {
      await entry.undo();
      return entry.label;
    } finally {
      this.running = false;
      this.notify();
    }
  }

  clear(): void {
    this.entries = [];
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export type PlanJournalEntry = {
  eventId: number | null;
  taskId: number | null;
  taskName: string;
  start: Date;
  end: Date | null;
  eventTitle: string;
};

/** @deprecated Use PlanJournalEntry */
export type DayJournalEntry = PlanJournalEntry;

export type PlanSnapshotBlock = {
  event_id?: number;
  task_id?: number | null;
  name?: string;
  start_datetime?: string;
  end_datetime?: string;
};

export function snapshotBlocksToJournalEntries(blocks: PlanSnapshotBlock[]): PlanJournalEntry[] {
  const entries: PlanJournalEntry[] = [];
  for (const block of blocks) {
    if (!block.start_datetime) continue;
    const start = new Date(block.start_datetime);
    if (Number.isNaN(start.getTime())) continue;
    const name = block.name || 'Planned block';
    entries.push({
      eventId: block.event_id ?? null,
      taskId: block.task_id ?? null,
      taskName: name,
      start,
      end: block.end_datetime ? new Date(block.end_datetime) : null,
      eventTitle: name,
    });
  }
  entries.sort((a, b) => a.start.getTime() - b.start.getTime());
  return entries;
}

export function journalEntryDurationMinutes(entry: PlanJournalEntry): number {
  if (entry.end && entry.end.getTime() > entry.start.getTime()) {
    return Math.max(15, Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000));
  }
  return 60;
}

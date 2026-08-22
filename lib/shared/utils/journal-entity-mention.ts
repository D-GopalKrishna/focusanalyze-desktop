import {
  DASHBOARD_CALENDAR,
  DASHBOARD_HABITS,
  moveToProjectBoardView,
} from '@/lib/config/urls';
import { getFocusAnalyzeBoardUrlWithOpenIssue } from "@shared/utils/navigations";

export type JournalEntityMentionKind = 'task' | 'event' | 'project' | 'habit';

export type JournalEntityMentionAttrs = {
  kind: JournalEntityMentionKind;
  id: number;
  label: string;
  projectId?: number | null;
  acronym?: string | null;
};

const LABEL_MAX_CHARS = 40;

export function truncateMentionLabel(label: string, max = LABEL_MAX_CHARS): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

export function mentionLabelFromSearchResult(result: {
  type?: string;
  name?: string;
  task_acronym?: string | null;
}): string {
  const name = (result.name || '').trim() || 'Untitled';
  if (result.type === 'task' && result.task_acronym) {
    return `${result.task_acronym} — ${name}`;
  }
  return name;
}

export function buildJournalEntityMentionHref(attrs: JournalEntityMentionAttrs): string | null {
  const id = Number(attrs.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  switch (attrs.kind) {
    case 'task': {
      const projectId = attrs.projectId != null ? Number(attrs.projectId) : null;
      const acronym = (attrs.acronym || '').trim();
      if (projectId && acronym) {
        return getFocusAnalyzeBoardUrlWithOpenIssue(String(projectId), acronym);
      }
      return null;
    }
    case 'event':
      return `${DASHBOARD_CALENDAR}?event_id=${id}`;
    case 'project':
      return moveToProjectBoardView(String(id));
    case 'habit':
      return `${DASHBOARD_HABITS}?habit=${id}`;
    default:
      return null;
  }
}

export function parseMentionKind(raw: string | null | undefined): JournalEntityMentionKind | null {
  if (raw === 'task' || raw === 'event' || raw === 'project' || raw === 'habit') return raw;
  return null;
}

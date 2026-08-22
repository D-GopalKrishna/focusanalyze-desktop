import {
  URL_PARAMS,
  dashboardCalendarEventPath,
  dashboardHabitPath,
  dashboardJournalPath,
  dashboardLifeAreaPath,
  dashboardNotificationPath,
  dashboardPlanPath,
  dashboardProjectPath,
  dashboardReportDialogPath,
  moveToProjectAllTracksView,
  withQueryParams,
} from '@/lib/config/urls';
import {
  getFocusAnalyzeBoardUrlWithOpenIssue,
  getFocusAnalyzeBoardUrlWithOpenIssueAndComment,
  getFocusAnalyzeTaskPageUrl,
} from "@shared/utils/navigations";
import { SearchResult } from "@shared/api-client";
import { settingsUrl, type SettingsEntry } from '@/lib/config/settings-registry';

/**
 * One flat, ordered list backing the global-search result panel. Settings matches and
 * backend entity results share a single index space so arrow-key navigation stays simple —
 * rendering and keyboard selection must always walk this same array.
 */
export type SearchNavigableItem =
  | { kind: 'setting'; entry: SettingsEntry }
  | { kind: 'entity'; result: SearchResult };

/** Resolves any navigable item to its destination URL ('' when not navigable). */
export function navigableItemUrl(item: SearchNavigableItem): string {
  return item.kind === 'setting' ? settingsUrl(item.entry.id) : navigateToSearchResult(item.result);
}

export function navigateToSearchResult(searchItem: SearchResult) {
  const item = searchItem;
  if (item.type === 'event') {
    return item.id != null ? dashboardCalendarEventPath(item.id) : '';
  }
  if (item.type === 'project') {
    return item.project_id != null ? dashboardProjectPath(item.project_id) : '';
  }
  if (item.type === 'projecttrack' || item.type === 'track') {
    if (item.project_id != null && item.track_id != null) {
      return withQueryParams(moveToProjectAllTracksView(String(item.project_id)), {
        [URL_PARAMS.OPEN_TRACK]: item.track_id,
      });
    }
    return '';
  }
  if (item.type === 'task') {
    if (item.project_id == null) return '';
    const acronym = item.task_acronym?.trim();
    if (acronym) {
      return getFocusAnalyzeBoardUrlWithOpenIssue(String(item.project_id), acronym);
    }
    if (item.id != null) {
      return getFocusAnalyzeTaskPageUrl(item.project_id, item.id);
    }
    return '';
  }
  if (item.type === 'habit') {
    return item.id != null ? dashboardHabitPath(item.id) : '';
  }
  if (item.type === 'life_area') {
    const lifeAreaId = item.life_area_id ?? item.id;
    return lifeAreaId != null ? dashboardLifeAreaPath(lifeAreaId) : '';
  }
  if (item.type === 'notification') {
    return dashboardNotificationPath(item.path);
  }
  if (item.type === 'journal') {
    const scopeRaw = (item.journal_kind || item.scope || 'daily').toLowerCase();
    const scope = scopeRaw === 'weekly' || scopeRaw === 'week' ? 'weekly' : 'daily';
    return item.period_start ? dashboardJournalPath(scope, item.period_start) : '';
  }
  if (item.type === 'report') {
    const scopeRaw = (item.report_kind || item.scope || 'daily').toLowerCase();
    const scope =
      scopeRaw === 'week' || scopeRaw === 'weekly'
        ? 'weekly'
        : scopeRaw === 'month' || scopeRaw === 'monthly'
          ? 'monthly'
          : 'daily';
    return item.period_start ? dashboardReportDialogPath(scope, item.period_start) : '';
  }
  if (item.type === 'plan') {
    const scope = (item.scope || 'daily').toLowerCase();
    return item.period_start ? dashboardPlanPath(scope, item.period_start) : '';
  }
  if (item.type === 'task_comment') {
    const acronym = item.task_acronym?.trim();
    const commentUuid = item.comment_uuid?.trim();
    if (item.project_id != null && acronym && commentUuid) {
      return getFocusAnalyzeBoardUrlWithOpenIssueAndComment(
        String(item.project_id),
        acronym,
        commentUuid,
      );
    }
    if (item.project_id != null && acronym) {
      return getFocusAnalyzeBoardUrlWithOpenIssue(String(item.project_id), acronym);
    }
    return '';
  }
  return '';
}

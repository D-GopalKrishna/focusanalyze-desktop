import type { Destination } from "@shared/api-client";
import {
  DASHBOARD_CALENDAR,
  DASHBOARD_CAPACITY,
  dashboardHabitPath,
  dashboardPerformancePath,
  moveToProjectAllTracksView,
  moveToProjectBoardView,
  moveToProjectListView,
  PROJECT_CALENDAR_VIEW,
  PROJECT_TIMELINE_VIEW,
  SETTINGS_PREFIX,
  URL_PARAMS,
} from '@/lib/config/urls';
import {
  getFocusAnalyzeBoardUrlWithOpenIssue,
  getFocusAnalyzeBoardUrlWithOpenIssueAndComment,
} from "@shared/utils/navigations";

/** Whitelist settings path segments (mirrors BE SETTINGS_SECTIONS). */
const SETTINGS_SECTIONS: Record<string, string> = {
  profile: 'profile',
  billing: 'billing',
  'keyboard-shortcuts': 'keyboard-shortcuts',
  team: 'team',
  download: 'download',
  calendar: 'calendar-settings',
  'calendar-settings': 'calendar-settings',
  project: 'project-settings',
  'project-settings': 'project-settings',
  planner: 'planner-settings',
  'planner-settings': 'planner-settings',
  preferences: 'preferences',
  appearance: 'appearance',
  inbox: 'inbox',
  'ai-models': 'ai-models',
  'gpt-usage-history': 'gpt-usage-history',
  'calendar-integration': 'calendar-integration',
  'project-integration': 'project-integration',
  'meeting-integration': 'meeting-integration',
  'systems-habits': 'systems-habits',
  extensions: 'extensions',
  capacity: 'capacity',
  'ui-extensions': 'ui-extensions',
  ui: 'ui-extensions',
  reports: 'reports-settings',
  'reports-settings': 'reports-settings',
  performance: 'reports-settings',
  'performance-settings': 'reports-settings',
};

function queryPath(path: string, values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === false || value === '') continue;
    params.set(key, value === true ? '1' : String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function projectViewPath(projectId: number, view?: string) {
  switch (view) {
    case 'list':
      return moveToProjectListView(String(projectId));
    case 'tracks':
      return moveToProjectAllTracksView(String(projectId));
    case 'timeline':
      return PROJECT_TIMELINE_VIEW.replace('PROJECT_ID', String(projectId));
    case 'calendar':
      return PROJECT_CALENDAR_VIEW.replace('PROJECT_ID', String(projectId));
    default:
      return moveToProjectBoardView(String(projectId));
  }
}

function settingsPath(section?: string) {
  const key = (section || 'profile').trim().toLowerCase().replace(/_/g, '-');
  const segment = SETTINGS_SECTIONS[key] || SETTINGS_SECTIONS.profile;
  return `${SETTINGS_PREFIX}/${segment}`;
}

/**
 * Resolve the typed backend destination to the product's canonical URL.
 * `currentDashboardPath` lets Focus AI open as an overlay without leaving the
 * surface the user is currently viewing.
 */
export function buildDestinationHref(
  destination: Destination,
  currentDashboardPath = DASHBOARD_CALENDAR,
): string | null {
  switch (destination.kind as string) {
    case 'event':
      return destination.event_id != null
        ? queryPath(DASHBOARD_CALENDAR, { event_id: destination.event_id })
        : null;
    case 'calendar_day':
      return destination.date ? queryPath(DASHBOARD_CALENDAR, { date: destination.date }) : null;
    case 'planning':
      return destination.scope
        ? queryPath(DASHBOARD_CALENDAR, {
            planning: destination.scope,
            [destination.scope === 'weekly' ? 'week_start' : 'date']: destination.period_start,
          })
        : null;
    case 'plan':
      return destination.scope && destination.period_start
        ? queryPath(DASHBOARD_CALENDAR, {
            plan: destination.scope,
            [destination.scope === 'weekly' ? 'week_start' : 'date']: destination.period_start,
          })
        : null;
    case 'plan_history':
      return destination.scope && destination.period_start
        ? queryPath(DASHBOARD_CALENDAR, {
            plan: destination.scope,
            plan_history: 1,
            [destination.scope === 'weekly' ? 'week_start' : 'date']: destination.period_start,
          })
        : null;
    case 'plans_hub':
      return queryPath(DASHBOARD_CALENDAR, { plans: 1 });
    case 'task':
      return destination.project_id != null && destination.acronym
        ? getFocusAnalyzeBoardUrlWithOpenIssue(String(destination.project_id), destination.acronym)
        : null;
    case 'task_comment':
      return destination.project_id != null && destination.acronym && destination.comment_uuid
        ? getFocusAnalyzeBoardUrlWithOpenIssueAndComment(
            String(destination.project_id),
            destination.acronym,
            destination.comment_uuid,
          )
        : null;
    case 'project':
    case 'project_board':
      return destination.project_id != null
        ? projectViewPath(destination.project_id, destination.view)
        : null;
    case 'project_settings':
      return destination.project_id != null
        ? queryPath(projectViewPath(destination.project_id, destination.view || 'board'), {
            [URL_PARAMS.OPEN_PROJECT_SETTINGS]: 1,
          })
        : null;
    case 'track':
      return destination.project_id != null && destination.track_id != null
        ? queryPath(moveToProjectAllTracksView(String(destination.project_id)), {
            [URL_PARAMS.OPEN_TRACK]: destination.track_id,
          })
        : null;
    case 'report':
      return destination.period && destination.date
        ? dashboardPerformancePath(destination.period, destination.date)
        : null;
    case 'report_dialog': {
      if (!destination.scope || !destination.period_start) return null;
      const scope = String(destination.scope);
      const dateKey =
        scope === 'weekly' || scope === 'week'
          ? 'week_start'
          : scope === 'monthly' || scope === 'month'
            ? 'month'
            : 'date';
      return queryPath(DASHBOARD_CALENDAR, {
        report: scope === 'week' ? 'weekly' : scope === 'month' ? 'monthly' : scope,
        [dateKey]: destination.period_start,
      });
    }
    case 'journal':
      return destination.scope && destination.period_start
        ? queryPath(DASHBOARD_CALENDAR, {
            journal: destination.scope,
            [destination.scope === 'weekly' ? 'week_start' : 'date']: destination.period_start,
          })
        : null;
    case 'focusai': {
      const path = currentDashboardPath.startsWith('/dashboard')
        ? currentDashboardPath
        : DASHBOARD_CALENDAR;
      return queryPath(path, {
        focusai: 1,
        chat: destination.conversation_uuid,
        voice: destination.voice,
      });
    }
    case 'focusai_history': {
      const path = currentDashboardPath.startsWith('/dashboard')
        ? currentDashboardPath
        : DASHBOARD_CALENDAR;
      return queryPath(path, { focusai: 1, history: 1 });
    }
    case 'habit':
      return destination.habit_id != null ? dashboardHabitPath(destination.habit_id) : null;
    case 'life_area': {
      if (destination.life_area_id == null) return null;
      // Stay on the current dashboard surface; NavLifeAreas opens the sidebar panel.
      const path = currentDashboardPath.startsWith('/dashboard')
        ? currentDashboardPath
        : DASHBOARD_CALENDAR;
      return queryPath(path, {
        [URL_PARAMS.OPEN_LIFE_AREAS]: 1,
        [URL_PARAMS.LIFE_AREA]: destination.life_area_id,
      });
    }
    case 'settings':
      return settingsPath(destination.section);
    case 'capacity':
      return queryPath(DASHBOARD_CAPACITY, {
        scope: destination.scope || 'weekly',
        period_start: destination.period_start,
      });
    default:
      return null;
  }
}

export interface DestinationRouter {
  push: (href: string) => void;
}

export function openDestination(
  destination: Destination,
  router: DestinationRouter,
  currentDashboardPath?: string,
): boolean {
  const href = buildDestinationHref(destination, currentDashboardPath);
  if (!href) return false;
  router.push(href);
  return true;
}

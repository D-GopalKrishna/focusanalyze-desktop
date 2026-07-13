import { moveToProjectAllTracksView, URL_PARAMS } from '@/lib/config/urls';
import { getFocusAnalyzeBoardUrlWithOpenIssue } from "@shared/utils/navigations";
import { SearchResult } from "@shared/api-client";

export function navigateToSearchResult(searchItem: SearchResult) {
  let url = '';
  if (searchItem.type === 'event') {
    url = `/dashboard/calendar?event_id=${searchItem.id}`;
  } else if (searchItem.type === 'project') {
    url = `/dashboard/projects/focusanalyze/${searchItem.project_id}`;
  } else if (searchItem.type === 'projecttrack' || searchItem.type === 'track') {
    if (searchItem.project_id != null && searchItem.track_id != null) {
      const base = moveToProjectAllTracksView(String(searchItem.project_id));
      url = `${base}?${URL_PARAMS.OPEN_TRACK}=${encodeURIComponent(String(searchItem.track_id))}`;
    }
  } else if (searchItem.type === 'task') {
    if (searchItem.project_id != null) {
      const acronym = searchItem.task_acronym?.trim();
      if (acronym) {
        url = getFocusAnalyzeBoardUrlWithOpenIssue(String(searchItem.project_id), acronym);
      } else if (searchItem.id != null) {
        url = `/dashboard/projects/focusanalyze/${searchItem.project_id}/task/${searchItem.id}`;
      }
    }
  }
  return url;
}

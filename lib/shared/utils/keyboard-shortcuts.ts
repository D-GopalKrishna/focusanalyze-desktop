import { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { NextRouter } from 'next/router';
import type { IGlobalOption } from '@/components/dashboard/common/search/GlobalOptions';
import { DASHBOARD_CALENDAR, FOCUSANALYZE_PROJECT_PREFIX } from '@/lib/config/urls';
import { isModKeyPressed, matchesShortcutKey, shortcutKeyLabelFromEvent } from "@shared/utils/mod-key";
import type { SearchNavigableItem } from "@shared/utils/search";

export function isKeyboardFocusInsideTextField(): boolean {
  const active = document.activeElement;
  return !!(
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      (active as HTMLElement).isContentEditable)
  );
}

/**
 * Cmd/Ctrl + ' (Quote) — planner on calendar; integrations on FocusAnalyze project pages.
 * Uses `event.code === 'Quote'` so the chord matches regardless of layout-specific `key` quirks.
 */
export function handleContextPanelQuoteShortcut(
  event: KeyboardEvent,
  options: {
    pathname: string | null | undefined;
    isPlannerWidgetOpen: boolean;
    isIntegrationSidebarOpen: boolean;
    setIsPlannerWidgetOpen: (open: boolean) => void;
    setIsIntegrationSidebarOpen: (open: boolean) => void;
  },
) {
  const isQuoteKey = event.code === 'Quote' || event.key === "'" || event.key === '"';

  const modifiersOk = !event.altKey && !event.shiftKey && isModKeyPressed(event);

  if (!isQuoteKey || !modifiersOk) return;
  if (isKeyboardFocusInsideTextField()) return;

  const pathname = options.pathname ?? '';
  const onCalendar =
    pathname === DASHBOARD_CALENDAR || pathname.startsWith(`${DASHBOARD_CALENDAR}/`);
  const onFocusAnalyzeProject = pathname.startsWith(`${FOCUSANALYZE_PROJECT_PREFIX}/`);

  if (onCalendar) {
    event.preventDefault();
    options.setIsPlannerWidgetOpen(!options.isPlannerWidgetOpen);
    return;
  }

  if (onFocusAnalyzeProject) {
    event.preventDefault();
    const nextOpen = !options.isIntegrationSidebarOpen;
    options.setIsIntegrationSidebarOpen(nextOpen);
    if (nextOpen) options.setIsPlannerWidgetOpen(false);
  }
}

/** @deprecated Use handleContextPanelQuoteShortcut */
export const handleContextPanelPeriodShortcut = handleContextPanelQuoteShortcut;

/** @deprecated Use handleContextPanelQuoteShortcut */
export const handleContextPanelCtrlPeriodKeyDown = handleContextPanelQuoteShortcut;

// Types for the function parameters
interface HandleGlobalSearchNavigationParams {
  event: KeyboardEvent | ReactKeyboardEvent;
  isSearchMode: boolean;
  /**
   * Flat list of everything selectable in search mode — settings matches first, then
   * backend entity results. Single index space, so `selectedResultIndex` addresses both.
   */
  navigableItems: SearchNavigableItem[];
  selectedResultIndex: number;
  setSelectedResultIndex: (fn: (prev: number) => number) => void;
  selectedOptionIndex: number;
  setSelectedOptionIndex: (fn: (prev: number) => number) => void;
  globalOptions: any[];
  setSidebarState: (fn: (prev: any) => any) => void;
  /** Close overlay and go to a URL without undoing navigation via history.back(). */
  navigateFromSearch: (url: string) => void;
  /** Maps a navigable item (setting or entity) to its destination URL. */
  resolveItemUrl: (item: SearchNavigableItem) => string | undefined;
  query: string;
  DASHBOARD_FOCUSAI: string;
  DASHBOARD_SEARCH: string;
  onFocusAIQuickAsk?: (option: IGlobalOption) => void;
}

// Handles keyboard navigation for the GlobalSearch dialog
export function handleGlobalSearchNavigation({
  event,
  isSearchMode,
  navigableItems,
  selectedResultIndex,
  setSelectedResultIndex,
  selectedOptionIndex,
  setSelectedOptionIndex,
  globalOptions,
  setSidebarState,
  navigateFromSearch,
  resolveItemUrl,
  query,
  DASHBOARD_FOCUSAI,
  DASHBOARD_SEARCH,
  onFocusAIQuickAsk,
}: HandleGlobalSearchNavigationParams) {
  if (isSearchMode) {
    const resultsLength = navigableItems.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (resultsLength > 0)
        setSelectedResultIndex((prev) =>
          prev < resultsLength - 1 ? (prev === -1 ? 0 : prev + 1) : prev,
        );
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (resultsLength > 0) setSelectedResultIndex((prev) => (prev <= 0 ? -1 : prev - 1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedResultIndex < 0) {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        navigateFromSearch(
          params.toString() ? `${DASHBOARD_SEARCH}?${params.toString()}` : DASHBOARD_SEARCH,
        );
      } else {
        const navigableItem = navigableItems[selectedResultIndex];
        if (navigableItem) {
          const url = resolveItemUrl(navigableItem);
          if (url) {
            navigateFromSearch(url);
          }
        }
      }
    }
  } else {
    // Not in search mode: navigate global options
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedOptionIndex((prev) => (prev + 1) % globalOptions.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedOptionIndex((prev) => (prev - 1 + globalOptions.length) % globalOptions.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = globalOptions[selectedOptionIndex];
      if (option?.type === 'focusgpt' && !option?.disabled) {
        if (option.quickAsk && onFocusAIQuickAsk) {
          onFocusAIQuickAsk(option);
          setSidebarState((prev) => ({ ...prev, searchOpen: false }));
        } else {
          const searchParams = new URLSearchParams();
          searchParams.set('query', query);
          navigateFromSearch(`${DASHBOARD_FOCUSAI}?${searchParams.toString()}`);
        }
      }
    }
  }
}

/**
 * Delete-event chord, cross-platform.
 *
 * Windows/Linux (and Mac full-size keyboards) have a real `Delete` key. MacBooks do not —
 * the key labelled *delete* (⌫) reports `Backspace`, and forward-delete needs fn+⌫ — so the
 * Mac-native gesture ⌘+⌫ is accepted as well.
 *
 * Bare `Backspace` is deliberately NOT a trigger: it is far too easy to hit by accident and
 * the destructive action would fire with no modifier held.
 */
export function matchesDeleteEventShortcut(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  if (event.key === 'Delete') return true;
  return event.key === 'Backspace' && isModKeyPressed(event);
}

interface HandleQuickEventDialogNavigationParams {
  event: KeyboardEvent | ReactKeyboardEvent;
  showDateConfig: boolean;
  setShowDateConfig: (open: boolean) => void;
  isTaskDropdownOpen: boolean;
  setIsTaskDropdownOpen: (open: boolean) => void;
  onClose: () => void;
  isEditing: boolean;
  handleKeyboardSubmit: (e: KeyboardEvent | ReactKeyboardEvent) => void;
  /** Delete existing event (view mode only; ignored while editing or in a text field). */
  onDelete?: () => void;
}

export function handleQuickEventDialogNavigation({
  event,
  showDateConfig,
  setShowDateConfig,
  isTaskDropdownOpen,
  setIsTaskDropdownOpen,
  onClose,
  isEditing,
  handleKeyboardSubmit,
  onDelete,
}: HandleQuickEventDialogNavigationParams) {
  if (event.key === 'Escape') {
    if (showDateConfig) {
      setShowDateConfig(false);
    } else if (isTaskDropdownOpen) {
      setIsTaskDropdownOpen(false);
    } else {
      onClose();
    }
  }
  if (event.key === 'Enter' && isModKeyPressed(event)) {
    if (isEditing) {
      handleKeyboardSubmit(event);
    }
  }
  if (
    matchesDeleteEventShortcut(event) &&
    onDelete &&
    !isEditing &&
    !showDateConfig &&
    !isTaskDropdownOpen &&
    !isKeyboardFocusInsideTextField()
  ) {
    event.preventDefault();
    onDelete();
  }
}

interface HandleShortcutEditKeyDownParams {
  event: KeyboardEvent;
  saveEdit: () => void;
  setTempShortcut: (shortcut: any) => void;
}

export function handleShortcutEditKeyDown({
  event,
  saveEdit,
  setTempShortcut,
}: HandleShortcutEditKeyDownParams) {
  // If Enter is pressed, save the shortcut
  if (event.key === 'Enter') {
    event.preventDefault();
    saveEdit();
    return;
  }

  event.preventDefault();

  // Ignore standalone modifier keys and Enter key
  if (['Control', 'Shift', 'Alt', 'Meta', 'Enter'].includes(event.key)) {
    return;
  }

  // Create new shortcut based on pressed keys
  const newShortcut = {
    keys: [shortcutKeyLabelFromEvent(event)],
    mod: isModKeyPressed(event),
    shift: event.shiftKey,
    alt: event.altKey,
  };

  setTempShortcut(newShortcut);
}

const TIME_GRID_VIEWS = ['timeGridWeek', 'timeGridWeekday', 'timeGridThreeDay'];

interface HandleCalendarKeyboardShortcutsParams {
  event: KeyboardEvent;
  calendarApi: any;
  isSearchExpanded: boolean;
  quickEventPosition: any;
  currentView: any;
  setCurrentView: (view: any) => void;
  setCurrentDate: (date: any) => void;
  fetchAllEvents: (fromDatetime: string, toDatetime: string, projectId?: number | null) => void;
  handlePrevClick: (...args: any[]) => void;
  handleNextClick: (...args: any[]) => void;
  handleTodayClick: (...args: any[]) => void;
  handleViewChange: (...args: any[]) => void;
  onTimeZoomIn?: () => void;
  onTimeZoomOut?: () => void;
}

export function handleCalendarKeyboardShortcuts({
  event,
  calendarApi,
  isSearchExpanded,
  quickEventPosition,
  currentView,
  setCurrentView,
  setCurrentDate,
  fetchAllEvents,
  handlePrevClick,
  handleNextClick,
  handleTodayClick,
  handleViewChange,
  onTimeZoomIn,
  onTimeZoomOut,
}: HandleCalendarKeyboardShortcutsParams) {
  // Ignore if input/textarea is focused
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      (active as HTMLElement).isContentEditable)
  ) {
    return;
  }
  // Ignore if search or quick event dialog is open
  if (isSearchExpanded || quickEventPosition || !calendarApi) return;

  // Alt++ zoom in / Alt+- zoom out (time grid views only)
  const isTimeGridView = TIME_GRID_VIEWS.includes(currentView);
  if (isTimeGridView && event.altKey && onTimeZoomIn && onTimeZoomOut) {
    if (matchesShortcutKey('+', event)) {
      event.preventDefault();
      onTimeZoomIn();
      return;
    }
    if (matchesShortcutKey('-', event)) {
      event.preventDefault();
      onTimeZoomOut();
      return;
    }
  }

  // Alt+3 -> 3-Day view / Alt+W -> Weekday view
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (matchesShortcutKey('3', event)) {
      event.preventDefault();
      handleViewChange(
        calendarApi,
        'timeGridThreeDay',
        setCurrentView,
        setCurrentDate,
        fetchAllEvents,
      );
      return;
    }
    if (matchesShortcutKey('w', event)) {
      event.preventDefault();
      handleViewChange(
        calendarApi,
        'timeGridWeekday',
        setCurrentView,
        setCurrentDate,
        fetchAllEvents,
      );
      return;
    }
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  if (event.key === 'p') {
    handlePrevClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 'n') {
    handleNextClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 't') {
    handleTodayClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 'w') {
    handleViewChange(calendarApi, 'timeGridWeek', setCurrentView, setCurrentDate, fetchAllEvents);
  } else if (event.key === 'd') {
    handleViewChange(calendarApi, 'timeGridDay', setCurrentView, setCurrentDate, fetchAllEvents);
  } else if (event.key === 'm') {
    handleViewChange(calendarApi, 'dayGridMonth', setCurrentView, setCurrentDate, fetchAllEvents);
  }
}

export const handleKeyDownOnEscape = (
  e: KeyboardEvent,
  showDateConfig: boolean,
  isTaskDropdownOpen: boolean,
  onClose: () => void,
  /** e.g. task detail sheet open on top of the quick event */
  blockClose?: boolean,
) => {
  if (e.key === 'Escape') {
    // Only close if no sub-dialogs are open
    if (!showDateConfig && !isTaskDropdownOpen && !blockClose) {
      onClose();
    }
  }
};

import { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { NextRouter } from 'next/router';
import type { IGlobalOption } from '@/components/dashboard/common/search/GlobalOptions';
import { DASHBOARD_CALENDAR, FOCUSANALYZE_PROJECT_PREFIX } from '@/lib/config/urls';

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

  const modifiersOk = !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey);

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
  result: any;
  selectedResultIndex: number;
  setSelectedResultIndex: (fn: (prev: number) => number) => void;
  selectedOptionIndex: number;
  setSelectedOptionIndex: (fn: (prev: number) => number) => void;
  globalOptions: any[];
  setSidebarState: (fn: (prev: any) => any) => void;
  router: any;
  navigateToSearchResult: (item: any) => string | undefined;
  query: string;
  DASHBOARD_FOCUSAI: string;
  DASHBOARD_SEARCH: string;
  onFocusAIQuickAsk?: (option: IGlobalOption) => void;
}

// Handles keyboard navigation for the GlobalSearch dialog
export function handleGlobalSearchNavigation({
  event,
  isSearchMode,
  result,
  selectedResultIndex,
  setSelectedResultIndex,
  selectedOptionIndex,
  setSelectedOptionIndex,
  globalOptions,
  setSidebarState,
  router,
  navigateToSearchResult,
  query,
  DASHBOARD_FOCUSAI,
  DASHBOARD_SEARCH,
  onFocusAIQuickAsk,
}: HandleGlobalSearchNavigationParams) {
  if (isSearchMode) {
    const resultsLength = result?.searchResults?.length || 0;
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
        setSidebarState((prev) => ({ ...prev, searchOpen: false }));
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        router.push(
          params.toString() ? `${DASHBOARD_SEARCH}?${params.toString()}` : DASHBOARD_SEARCH,
        );
      } else {
        const searchItem = result?.searchResults?.[selectedResultIndex];
        if (searchItem) {
          setSidebarState((prev) => ({ ...prev, searchOpen: false }));
          const url = navigateToSearchResult(searchItem);
          if (url) {
            router.push(url);
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
          router.push(`${DASHBOARD_FOCUSAI}?${searchParams.toString()}`);
          setSidebarState((prev) => ({ ...prev, searchOpen: false }));
        }
      }
    }
  }
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
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    if (isEditing) {
      handleKeyboardSubmit(event);
    }
  }
  if (
    event.key === 'Delete' &&
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
    keys: [event.key === ' ' ? 'Space' : event.key],
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
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
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onTimeZoomIn();
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      onTimeZoomOut();
      return;
    }
  }

  if (event.key === 'p') {
    handlePrevClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 'n') {
    handleNextClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 't') {
    handleTodayClick(calendarApi, setCurrentDate, currentView, setCurrentView, fetchAllEvents);
  } else if (event.key === 'w') {
    handleViewChange(calendarApi, 'timeGridWeek', setCurrentView, setCurrentDate, fetchAllEvents);
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

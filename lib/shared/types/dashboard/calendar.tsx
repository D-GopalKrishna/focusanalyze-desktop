export type ICreateNewEventModalDetails = {
  isOpen: boolean;
  startDatetime: string;
  endDatetime: string;
};

export type ICalendarView =
  | 'timeGridWeekday'
  | 'timeGridThreeDay'
  | 'timeGridWeek'
  | 'dayGridMonth'
  | 'timeGridDay';

/** `null` = all accounts; `'focusanalyze'` = local-only; number = Google integration id. */
export type CalendarAccountFilter = number | 'focusanalyze' | null;

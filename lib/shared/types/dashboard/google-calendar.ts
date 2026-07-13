export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
  attendees: Array<{
    email: string;
    name: string;
    response_status: string;
  }>;
  organizer: string;
  is_all_day: boolean;
}

export interface GoogleCalendarResponse {
  success: boolean;
  events: GoogleCalendarEvent[];
  total: number;
  error?: string;
}

export function formatEventTime(startTime: string, endTime: string, isAllDay: boolean): string {
  if (isAllDay) {
    return 'All day';
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  const startFormatted = start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endFormatted = end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${startFormatted} - ${endFormatted}`;
}

export function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function getEventStatusColor(responseStatus: string): string {
  switch (responseStatus?.toLowerCase()) {
    case 'accepted':
      return 'text-green-600';
    case 'declined':
      return 'text-red-600';
    case 'tentative':
      return 'text-yellow-600';
    default:
      return 'text-gray-600';
  }
}

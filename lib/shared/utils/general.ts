import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SUPPORT_LINK } from '../config/urls';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getContrastColor(color: string) {
  const rgb = color.replace('#', '').match(/.{1,2}/g);
  if (!rgb) {
    return '#ffffff';
  }
  const r = parseInt(rgb[0], 16);
  const g = parseInt(rgb[1], 16);
  const b = parseInt(rgb[2], 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? '#000000' : '#ffffff';
}

export const trimStringToLength = (str: string, length: number) => {
  return str?.length > length ? str.substring(0, length) + '...' : str;
};

export function capitalize(str: string) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const truncate = (str: string, length: number) => {
  if (!str || str.length <= length) {
    return str;
  }
  return `${str.slice(0, length)}...`;
};

export function formatDate(input: string | number): string {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDueDate(dueDate?: string | null): string {
  if (!dueDate) {
    return '-';
  }

  const parsedDate = new Date(dueDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return dueDate;
  }

  return parsedDate.toLocaleDateString();
}

export function absoluteUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

export const onClickSupport = () => {
  window.open(SUPPORT_LINK, '_blank');
};

export const shouldBeLongHeader = (pathname: string) => {
  return (pathname.includes('/posts/') && pathname !== '/posts') || pathname.includes('/studio');
};

export const formatDateTime = (input: string | number): string => {
  if (!input) {
    return 'Present';
  }
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatSlideIndex = (index: number) => {
  return index.toString().padStart(2, '0');
};

const badgeColors = [
  '#00FF00',
  '#4dc9ff',
  '#FF00FF',
  '#FFFF00',
  '#FF0000',
  '#00FFFF',
  '#ff7aff',
  '#FFA500',
];

export const getRandomColor = () => {
  return badgeColors[Math.floor(Math.random() * badgeColors.length)];
};

/**
 * DRF may return either a bare array or a paginated payload `{ results: T[] }`.
 */
export function unwrapPaginatedList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

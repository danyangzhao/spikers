/**
 * Date utilities for consistent timezone handling
 *
 * Dates are stored in PostgreSQL as UTC. Both the web and iOS apps
 * now send proper timezone-aware ISO strings (e.g. "2024-12-13T22:00:00Z"),
 * so we display them in the user's local timezone.
 */

/**
 * Format a date string for display
 */
export function formatSessionDate(dateString: string): string {
  const date = new Date(dateString)

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Format a date string for shorter display (session lists)
 */
export function formatSessionDateShort(dateString: string): string {
  const date = new Date(dateString)

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date string with time for lists
 */
export function formatSessionDateTime(dateString: string): string {
  const date = new Date(dateString)

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

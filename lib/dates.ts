/**
 * Date utilities for consistent timezone handling
 * 
 * The issue: When a user enters "2pm" in their local timezone,
 * the datetime-local input gives us "2024-12-13T14:00" (no timezone).
 * JavaScript's Date constructor treats this as local time, but when
 * stored in PostgreSQL and retrieved, it becomes UTC.
 * 
 * Solution: Display dates using UTC to match what was stored.
 */

/**
 * Format a date string for display
 * Uses UTC to ensure consistency across timezones
 */
export function formatSessionDate(dateString: string): string {
  const date = new Date(dateString)
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC', // Display in UTC to match stored value
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
    timeZone: 'UTC',
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
    timeZone: 'UTC',
  })
}


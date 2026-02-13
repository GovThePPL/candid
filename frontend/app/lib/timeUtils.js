/**
 * Format a date as a short relative time string: "now", "2m", "3h", "5d", "2w", "3mo", "1y"
 * Uses i18n keys from the discuss namespace.
 *
 * @param {string|Date} date - ISO string or Date object
 * @param {function} t - i18next t function (must have discuss namespace loaded)
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date, t) {
  if (!date) return ''

  const now = Date.now()
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime()
  const diffMs = now - then

  if (diffMs < 0 || isNaN(diffMs)) return t('discuss:timeJustNow')

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (seconds < 60) return t('discuss:timeJustNow')
  if (minutes < 60) return t('discuss:timeMinutes', { count: minutes })
  if (hours < 24) return t('discuss:timeHours', { count: hours })
  if (days < 7) return t('discuss:timeDays', { count: days })
  if (weeks < 5) return t('discuss:timeWeeks', { count: weeks })
  if (months < 12) return t('discuss:timeMonths', { count: months })
  return t('discuss:timeYears', { count: years })
}

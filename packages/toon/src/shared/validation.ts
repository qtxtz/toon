import { COMMENT_MARKER, DEFAULT_DELIMITER, LIST_ITEM_MARKER } from '../constants.ts'
import { isBooleanOrNullLiteral } from './literal-utils.ts'

const NUMERIC_LIKE_PATTERN = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i
const LEADING_ZERO_PATTERN = /^0\d+$/

/**
 * Checks if a key can be used without quotes.
 *
 * @remarks
 * Valid unquoted keys must start with a letter or underscore,
 * followed by letters, digits, underscores, or dots.
 */
export function isValidUnquotedKey(key: string): boolean {
  return /^[A-Z_][\w.]*$/i.test(key)
}

/**
 * Determines if a string value can be safely encoded without quotes.
 *
 * @remarks
 * A string needs quoting if it:
 * - Is empty
 * - Has leading or trailing whitespace
 * - Could be confused with a literal (boolean, null, number)
 * - Contains structural characters (colons, brackets, braces)
 * - Contains quotes or backslashes (need escaping)
 * - Contains control characters (newlines, tabs, etc.)
 * - Contains the active delimiter
 * - Starts with a list marker (hyphen)
 * - Starts with a comment marker (#)
 */
export function isSafeUnquoted(value: string, delimiter: string = DEFAULT_DELIMITER): boolean {
  if (!value) {
    return false
  }

  if (value !== value.trim()) {
    return false
  }

  if (isBooleanOrNullLiteral(value) || isNumericLike(value)) {
    return false
  }

  if (value.includes(':')) {
    return false
  }

  if (value.includes('"') || value.includes('\\')) {
    return false
  }

  if (/[[\]{}]/.test(value)) {
    return false
  }

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F]/.test(value)) {
    return false
  }

  if (value.includes(delimiter)) {
    return false
  }

  if (value.startsWith(LIST_ITEM_MARKER)) {
    return false
  }

  if (value.startsWith(COMMENT_MARKER)) {
    return false
  }

  return true
}

function isNumericLike(value: string): boolean {
  return NUMERIC_LIKE_PATTERN.test(value) || LEADING_ZERO_PATTERN.test(value)
}

/**
 * Simple line-level diff using longest common subsequence (LCS).
 *
 * @param {string} original - Original text
 * @param {string} edited - Edited text
 * @returns {Array<{type: 'same'|'add'|'remove', text: string}>}
 */
export function computeLineDiff(original, edited) {
  const origLines = (original || '').split('\n')
  const editLines = (edited || '').split('\n')

  const m = origLines.length
  const n = editLines.length

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === editLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to produce diff
  const result = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === editLines[j - 1]) {
      result.push({ type: 'same', text: origLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: editLines[j - 1] })
      j--
    } else {
      result.push({ type: 'remove', text: origLines[i - 1] })
      i--
    }
  }

  return result.reverse()
}

/**
 * Character-level diff between two strings using LCS.
 * Returns an array of segments: { text, highlighted } where highlighted
 * means the characters differ between the two strings.
 *
 * @param {string} oldStr
 * @param {string} newStr
 * @param {'remove'|'add'} side - Which side's text to return segments for
 * @returns {Array<{text: string, highlighted: boolean}>}
 */
export function computeCharDiff(oldStr, newStr) {
  // Strip common prefix and suffix to anchor the alignment and reduce LCS size.
  // Without this, LCS backtracking can misalign repeated characters
  // (e.g. "related terms" → "related terms and stuff" would match the 's'
  // in "terms" with the 's' in "stuff").
  let prefixLen = 0
  const minLen = Math.min(oldStr.length, newStr.length)
  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  const maxSuffix = minLen - prefixLen
  while (
    suffixLen < maxSuffix &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const prefix = oldStr.slice(0, prefixLen)
  const suffix = suffixLen > 0 ? oldStr.slice(oldStr.length - suffixLen) : ''
  const oldMiddle = oldStr.slice(prefixLen, oldStr.length - suffixLen)
  const newMiddle = newStr.slice(prefixLen, newStr.length - suffixLen)

  // If middle portions are identical (all changes were in prefix/suffix — shouldn't happen, but safe)
  if (oldMiddle === newMiddle) {
    const oldSegments = []
    const newSegments = []
    if (prefix) { oldSegments.push({ text: prefix, highlighted: false }); newSegments.push({ text: prefix, highlighted: false }) }
    if (oldMiddle) { oldSegments.push({ text: oldMiddle, highlighted: false }); newSegments.push({ text: newMiddle, highlighted: false }) }
    if (suffix) { oldSegments.push({ text: suffix, highlighted: false }); newSegments.push({ text: suffix, highlighted: false }) }
    return { oldSegments: oldSegments.length ? oldSegments : [{ text: '', highlighted: false }], newSegments: newSegments.length ? newSegments : [{ text: '', highlighted: false }] }
  }

  const m = oldMiddle.length
  const n = newMiddle.length

  // For very long lines, skip character diff to avoid O(m*n) blowup
  if (m * n > 50000) {
    const oldSegments = []
    const newSegments = []
    if (prefix) { oldSegments.push({ text: prefix, highlighted: false }); newSegments.push({ text: prefix, highlighted: false }) }
    oldSegments.push({ text: oldMiddle, highlighted: true })
    newSegments.push({ text: newMiddle, highlighted: true })
    if (suffix) { oldSegments.push({ text: suffix, highlighted: false }); newSegments.push({ text: suffix, highlighted: false }) }
    return { oldSegments, newSegments }
  }

  // Build LCS table for middle characters
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldMiddle[i - 1] === newMiddle[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to get char-level ops
  const ops = []
  let ci = m
  let cj = n
  while (ci > 0 || cj > 0) {
    if (ci > 0 && cj > 0 && oldMiddle[ci - 1] === newMiddle[cj - 1]) {
      ops.push({ type: 'same', oldChar: oldMiddle[ci - 1], newChar: newMiddle[cj - 1] })
      ci--
      cj--
    } else if (cj > 0 && (ci === 0 || dp[ci][cj - 1] >= dp[ci - 1][cj])) {
      ops.push({ type: 'add', newChar: newMiddle[cj - 1] })
      cj--
    } else {
      ops.push({ type: 'remove', oldChar: oldMiddle[ci - 1] })
      ci--
    }
  }
  ops.reverse()

  // Build segments for old and new sides
  const oldSegments = []
  const newSegments = []

  if (prefix) {
    oldSegments.push({ text: prefix, highlighted: false })
    newSegments.push({ text: prefix, highlighted: false })
  }

  for (const op of ops) {
    if (op.type === 'same') {
      _appendSegment(oldSegments, op.oldChar, false)
      _appendSegment(newSegments, op.newChar, false)
    } else if (op.type === 'remove') {
      _appendSegment(oldSegments, op.oldChar, true)
    } else {
      _appendSegment(newSegments, op.newChar, true)
    }
  }

  if (suffix) {
    oldSegments.push({ text: suffix, highlighted: false })
    newSegments.push({ text: suffix, highlighted: false })
  }

  return { oldSegments, newSegments }
}

function _appendSegment(segments, char, highlighted) {
  const last = segments[segments.length - 1]
  if (last && last.highlighted === highlighted) {
    last.text += char
  } else {
    segments.push({ text: char, highlighted })
  }
}

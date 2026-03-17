export interface InlineSpan {
  text: string
  type: 'same' | 'change'
}

/**
 * Compute inline highlights between old and new text.
 * Finds common prefix/suffix and marks the differing middle.
 */
export function computeInlineSpans(
  oldText: string,
  newText: string
): { oldSpans: InlineSpan[]; newSpans: InlineSpan[] } {
  let prefixLen = 0
  const minLen = Math.min(oldText.length, newText.length)
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const prefix = oldText.substring(0, prefixLen)
  const suffix = suffixLen > 0 ? oldText.substring(oldText.length - suffixLen) : ''
  const oldMiddle = oldText.substring(prefixLen, oldText.length - suffixLen)
  const newMiddle = newText.substring(prefixLen, newText.length - suffixLen)

  const oldSpans: InlineSpan[] = []
  const newSpans: InlineSpan[] = []

  if (prefix) {
    oldSpans.push({ text: prefix, type: 'same' })
    newSpans.push({ text: prefix, type: 'same' })
  }
  if (oldMiddle) oldSpans.push({ text: oldMiddle, type: 'change' })
  if (newMiddle) newSpans.push({ text: newMiddle, type: 'change' })
  if (suffix) {
    oldSpans.push({ text: suffix, type: 'same' })
    newSpans.push({ text: suffix, type: 'same' })
  }

  return { oldSpans, newSpans }
}

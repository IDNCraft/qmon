import { THEME } from './components/ui'

export interface MarkdownLine {
  text: string
  bold: boolean
  color?: string
}

function stripInlineMarkdown(line: string): string {
  return line
    .replaceAll(/`([^`]*)`/g, '$1')
    .replaceAll(/\*\*([^*]*)\*\*/g, '$1')
    .replaceAll(/__([^_]*)__/g, '$1')
    .replaceAll(/\*([^*]*)\*/g, '$1')
    .replaceAll(/_([^_]*)_/g, '$1')
    .replaceAll(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
}

// Release-note bullets carry noisy PR links ("... in <url>") that are useless
// in a terminal; drop the URL and its " in" connector but keep the attribution.
// Standalone URLs (e.g. "Full Changelog:") are kept.
function stripTrailingPrUrl(line: string): string {
  const parts = line.split(' ')
  const last = parts.at(-1) ?? ''
  if (parts.length > 1 && /^https?:\/\/\S+$/.test(last)) {
    let trimmed = parts.slice(0, -1)
    if (trimmed.at(-1) === 'in') trimmed = trimmed.slice(0, -1)
    return trimmed.join(' ').trimEnd()
  }
  return line
}

function breakLongWord(word: string, width: number): string[] {
  const chunks: string[] = []
  for (let start = 0; start < word.length; start += width) {
    chunks.push(word.slice(start, start + width))
  }
  return chunks
}

function wrapText(text: string, width: number, indent: string): string[] {
  const wrapped: string[] = []
  let current = ''
  const flush = () => {
    if (current) wrapped.push(`${indent}${current}`)
    current = ''
  }
  for (const word of text.split(' ')) {
    if (word.length > width) {
      flush()
      wrapped.push(...breakLongWord(word, width).map((chunk) => `${indent}${chunk}`))
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > width && current) {
      flush()
      current = word
    } else {
      current = candidate
    }
  }
  flush()
  return wrapped
}

export function renderMarkdownLines(notes: string, wrapWidth: number): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  // Continuation lines keep the item indent, so the effective wrap width shrinks.
  const push = (line: MarkdownLine, indent = '') => {
    for (const text of wrapText(line.text, wrapWidth - indent.length, indent)) {
      lines.push({ ...line, text })
    }
  }
  let inCodeFence = false
  let inHtml = false
  // Tracks whether the previous emitted content line came from a list item.
  // Continuation (wrapped) lines do not start with the bullet, so a plain
  // last-line check would miss the list→paragraph boundary.
  let lastWasListItem = false

  for (const rawLine of notes.split('\n')) {
    const line = rawLine.trimEnd()

    if (line.trimStart().startsWith('```')) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) {
      if (line.trim()) {
        push({ text: line.trim(), bold: false, color: THEME.muted }, '  ')
      }
      continue
    }

    // Skip HTML blocks/tags: GitHub releases often embed badges and <p> wrappers.
    if (line.trimStart().startsWith('<') && line.trimStart().endsWith('>')) {
      continue
    }
    if (
      line.includes('<details') ||
      line.includes('</details') ||
      line.includes('<summary') ||
      line.includes('</summary')
    ) {
      inHtml = line.includes('<details') || line.includes('<summary')
      continue
    }
    if (inHtml) {
      const stripped = stripInlineMarkdown(line.replace(/^\s*-\s+/, '• '))
      if (stripped.trim()) {
        push({ text: stripped.trim(), bold: false, color: THEME.muted }, '  ')
      }
      continue
    }

    if (/^\s*#{1,6}\s+/.test(line)) {
      const level = (line.match(/^\s*(#{1,6})\s+/)?.[1] ?? '#').length
      const heading = stripInlineMarkdown(line.replace(/^\s*#{1,6}\s+/, ''))
      // Blank line before a section heading (e.g. "What's Changed") so each
      // release block starts on its own line instead of hugging the previous
      // release's last note line.
      if (lines.length > 0 && lines.at(-1)?.text !== '') {
        lines.push({ text: '', bold: false })
      }
      push({ text: heading, bold: true, color: level <= 2 ? THEME.accent : THEME.text })
      lines.push({ text: '', bold: false })
      lastWasListItem = false
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      // Space out list items so multi-line bullets don't visually merge.
      if (lastWasListItem && lines.at(-1)?.text !== '') {
        lines.push({ text: '', bold: false })
      }
      const indent = (line.match(/^\s*/) ?? [''])[0].length
      const item = stripTrailingPrUrl(stripInlineMarkdown(line.replace(/^\s*([-*+]|\d+\.)\s+/, '')))
      push({ text: `• ${item}`, bold: false }, `${' '.repeat(indent)}  `)
      lastWasListItem = true
      continue
    }

    if (/^\s*(---|===|\*\*\*)\s*$/.test(line)) {
      continue
    }

    // Blockquotes (e.g. recovery hints in release notes): drop the "> "
    // marker and render muted with a hanging indent, so wrapped
    // continuation lines stay aligned instead of starting flush-left.
    if (/^\s*>/.test(line)) {
      const quote = stripTrailingPrUrl(stripInlineMarkdown(line.replace(/^\s*>+\s?/, '')))
      if (quote.trim()) {
        if (lines.length > 0 && lines.at(-1)?.text !== '') {
          lines.push({ text: '', bold: false })
        }
        push({ text: quote.trim(), bold: false, color: THEME.muted }, '  ')
        lastWasListItem = false
      }
      continue
    }

    const text = stripInlineMarkdown(line)
    if (text.trim()) {
      // Separate a trailing paragraph (e.g. "Full Changelog:") from the list above.
      if (lastWasListItem) {
        lines.push({ text: '', bold: false })
      }
      push({ text: text.trim(), bold: false })
      lastWasListItem = false
    }
  }

  return lines
}

/** @jsxImportSource @opentui/react */
import { useKeyboard } from '@opentui/react'
import { useEffect, useRef, useState } from 'react'

import { THEME } from '@/components/ui'

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  focused: boolean
  placeholder?: string
  maskChar?: string
  onMouseDown?: () => void
}

/**
 * Custom text input that owns the keyboard buffer directly. Works around stale
 * event handlers and first-character focus issues in OpenTUI's built-in <input>.
 */
export function TextInput({
  value,
  onChange,
  onSubmit,
  focused,
  placeholder = '',
  maskChar,
  onMouseDown,
}: Props) {
  const [cursor, setCursor] = useState(value.length)
  const valueRef = useRef(value)
  const cursorRef = useRef(cursor)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    setCursor(value.length)
  }, [value])

  useKeyboard((key) => {
    if (!focused) return

    if (key.name === 'return') {
      onSubmit()
      return
    }
    if (key.name === 'backspace') {
      const currentCursor = cursorRef.current
      const currentValue = valueRef.current
      if (currentCursor > 0) {
        const next = currentValue.slice(0, currentCursor - 1) + currentValue.slice(currentCursor)
        valueRef.current = next
        cursorRef.current = currentCursor - 1
        onChange(next)
        setCursor(currentCursor - 1)
      }
      return
    }
    if (key.name === 'delete') {
      const currentCursor = cursorRef.current
      const currentValue = valueRef.current
      if (currentCursor < currentValue.length) {
        const next = currentValue.slice(0, currentCursor) + currentValue.slice(currentCursor + 1)
        valueRef.current = next
        onChange(next)
      }
      return
    }
    if (key.name === 'left') {
      const currentCursor = cursorRef.current
      const next = Math.max(0, currentCursor - 1)
      cursorRef.current = next
      setCursor(next)
      return
    }
    if (key.name === 'right') {
      const currentCursor = cursorRef.current
      const currentValue = valueRef.current
      const next = Math.min(currentValue.length, currentCursor + 1)
      cursorRef.current = next
      setCursor(next)
      return
    }
    if (key.name === 'home') {
      cursorRef.current = 0
      setCursor(0)
      return
    }
    if (key.name === 'end') {
      const currentValue = valueRef.current
      cursorRef.current = currentValue.length
      setCursor(currentValue.length)
      return
    }
    if (key.ctrl || key.meta) return

    const char = key.sequence
    if (char?.length === 1 && char >= ' ') {
      const currentCursor = cursorRef.current
      const currentValue = valueRef.current
      const next = currentValue.slice(0, currentCursor) + char + currentValue.slice(currentCursor)
      valueRef.current = next
      cursorRef.current = currentCursor + 1
      onChange(next)
      setCursor(currentCursor + 1)
    }
  })

  const display = maskChar ? maskChar.repeat(value.length) : value
  const showPlaceholder = value.length === 0 && placeholder

  if (showPlaceholder && !focused) {
    return (
      <text selectable={false} fg="#666666">
        {placeholder}
      </text>
    )
  }

  const before = display.slice(0, cursor)
  const isEnd = cursor === display.length
  const cursorChar = isEnd ? '█' : (display[cursor] ?? ' ')
  const after = isEnd ? '' : display.slice(cursor + 1)

  return (
    <box flexDirection="row" onMouseDown={onMouseDown}>
      <text selectable={false}>{before}</text>
      {focused && (
        <text selectable={false} fg={THEME.accent}>
          {cursorChar}
        </text>
      )}
      <text selectable={false}>{after}</text>
    </box>
  )
}

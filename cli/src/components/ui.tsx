/** @jsxImportSource @opentui/react */
import { MouseEvent, RGBA, TextAttributes } from '@opentui/core'
import React, { useState } from 'react'

export interface ThemeColors {
  accent: string
  accentBg: string
  success: string
  warning: string
  danger: string
  muted: string
  text: string
  textInverse: string
  border: string
  borderHover: string
  panelBg: string
  selectedBg: string
}

export const THEME: ThemeColors = {
  accent: '#00ADB5',
  accentBg: '#0f3a3d',
  success: '#4CAF50',
  warning: '#FFD369',
  danger: '#FF2E93',
  muted: '#888888',
  text: '#EEEEEE',
  textInverse: '#1A1A1A',
  border: '#393E46',
  borderHover: '#00ADB5',
  panelBg: '#1e1e1e',
  selectedBg: '#223638',
}

interface CardProps {
  children: React.ReactNode
  title?: string
  titleColor?: string
  width?: number | 'auto' | `${number}%`
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | 'auto' | undefined
  borderColor?: string
  marginTop?: number
  marginBottom?: number
  padding?: number
  paddingX?: number
  paddingY?: number
  backgroundColor?: string | RGBA
  onMouseDown?: (event: MouseEvent) => void
}

export function Card({
  children,
  title,
  titleColor = THEME.accent,
  width,
  flexGrow,
  flexShrink,
  flexBasis,
  borderColor = THEME.border,
  marginTop = 0,
  marginBottom = 0,
  padding = 1,
  paddingX,
  paddingY,
  backgroundColor,
  onMouseDown,
}: CardProps) {
  // The extra horizontal cell belongs to the right side: long left-aligned
  // labels crowd the right border, while the left inset already reads wide
  // because of terminal cell aspect. Explicit paddingX opts out (compact
  // layouts need the symmetric inset).
  const pl = paddingX ?? padding
  const pr = paddingX ?? (paddingY === undefined ? padding + 1 : padding)
  const py = paddingY ?? padding
  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      width={width}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      flexBasis={flexBasis}
      marginTop={marginTop}
      marginBottom={marginBottom}
      backgroundColor={backgroundColor}
      paddingLeft={pl}
      paddingRight={pr}
      paddingTop={py}
      paddingBottom={py}
      onMouseDown={(event) => {
        onMouseDown?.(event)
      }}
    >
      {title && (
        <box marginBottom={1}>
          <text selectable={false} attributes={TextAttributes.BOLD} fg={titleColor}>
            {title}
          </text>
        </box>
      )}
      {children}
    </box>
  )
}

interface BadgeProps {
  label: string
  color: string
  bgColor?: string
}

export function Badge({ label, color, bgColor }: BadgeProps) {
  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      border
      borderStyle="rounded"
      borderColor={color}
      backgroundColor={bgColor}
    >
      <text selectable={false} attributes={TextAttributes.BOLD} fg={color}>
        {label}
      </text>
    </box>
  )
}

interface ButtonProps {
  label: string
  onClick: () => void
  color?: string
  disabled?: boolean
  width?: number
  align?: 'left' | 'center' | 'right'
}

/**
 * A cleaner clickable button with subtle hover feedback.
 */
export function Button({
  label,
  onClick,
  color = THEME.accent,
  disabled = false,
  width,
  align = 'center',
}: ButtonProps) {
  const [hovered, setHovered] = useState(false)

  const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'

  return (
    <box
      border
      borderStyle="rounded"
      borderColor={disabled ? THEME.border : hovered ? color : THEME.borderHover}
      backgroundColor={disabled ? undefined : hovered ? color : undefined}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
      width={width}
      justifyContent={justifyContent}
      onMouseOver={() => {
        if (!disabled) {
          setHovered(true)
        }
      }}
      onMouseOut={() => {
        setHovered(false)
      }}
      onMouseDown={() => {
        if (!disabled) {
          onClick()
        }
      }}
    >
      <text
        selectable={false}
        attributes={TextAttributes.BOLD}
        fg={disabled ? THEME.muted : hovered ? THEME.textInverse : color}
      >
        {label}
      </text>
    </box>
  )
}

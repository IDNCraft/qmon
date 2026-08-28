/** @jsxImportSource @opentui/react */
import React from 'react'

import { Badge, Button, THEME } from '../ui'

interface Props {
  loading: boolean
  version: string
  onRefresh: () => void
  onSettings: () => void
  onLogout: () => void
}

export function DashboardHeader({ loading, version, onRefresh, onSettings, onLogout }: Props) {
  return (
    <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
      <box flexDirection="row" gap={1}>
        <Button label="Refresh" onClick={onRefresh} />
        <Button label="Settings" onClick={onSettings} />
        <Button label="Logout" color={THEME.danger} onClick={onLogout} />
      </box>
      <box flexDirection="row" gap={1}>
        <Badge label={`v${version}`} color={THEME.muted} />
        {loading ? (
          <Badge label="Refreshing" color={THEME.warning} />
        ) : (
          <Badge label="Live" color={THEME.success} />
        )}
      </box>
    </box>
  )
}

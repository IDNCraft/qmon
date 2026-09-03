/** @jsxImportSource @opentui/react */
import { Badge, Button, THEME } from '@/components/ui'

interface Props {
  loading: boolean
  version: string
  updateVersion?: string
  updating: boolean
  onRefresh: () => void
  onSettings: () => void
  onLogout: () => void
  onUpdate: () => void
}

export function DashboardHeader({
  loading,
  version,
  updateVersion,
  updating,
  onRefresh,
  onSettings,
  onLogout,
  onUpdate,
}: Props) {
  return (
    <box
      flexDirection="row"
      flexWrap="wrap"
      justifyContent="space-between"
      columnGap={1}
      marginBottom={1}
    >
      <box flexDirection="row" gap={1}>
        <Button label="Refresh" onClick={onRefresh} />
        <Button label="Settings" onClick={onSettings} />
        <Button label="Logout" color={THEME.danger} onClick={onLogout} />
      </box>
      <box flexDirection="row" flexWrap="wrap" gap={1} justifyContent="flex-end" flexGrow={1}>
        {updateVersion && (
          <>
            <Badge label={`v${updateVersion} available`} color={THEME.warning} />
            <Button
              label={updating ? 'Updating...' : 'Update'}
              color={THEME.warning}
              disabled={updating}
              onClick={onUpdate}
            />
          </>
        )}
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

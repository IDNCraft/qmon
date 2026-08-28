/** @jsxImportSource @opentui/react */
import type { QuotaSnapshot } from '../api'
import type { SettingsItem } from './dashboard/SettingsCard'
import { RGBA, TextAttributes } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useMemo, useState } from 'react'

import { DashboardHeader } from './dashboard/DashboardHeader'
import { Footer } from './dashboard/Footer'
import { SettingsCard } from './dashboard/SettingsCard'
import { SummaryCards } from './dashboard/SummaryCards'
import { LoadingScreen } from './LoadingScreen'
import { QuotaGrid } from './QuotaGrid'
import { Card, THEME } from './ui'
import packageJson from '../../../package.json' with { type: 'json' }
import { clearConfig } from '../config'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { useQuotaData } from '../hooks/useQuotaData'

interface Props {
  onLogout: () => void
}

export function Dashboard({ onLogout }: Props) {
  const { width: terminalColumns, height: terminalRows } = useTerminalDimensions()
  const dashboardColumns = Math.min(120, terminalColumns)
  const isCompact = terminalColumns < 100
  const tableWidth = Math.max(20, dashboardColumns - 8)
  const compactStatusWidth = Math.max(12, Math.floor(tableWidth * 0.42))
  const compactLabelWidth = Math.max(8, tableWidth - compactStatusWidth)
  const desktopModelWidth = Math.max(24, Math.floor(tableWidth * 0.32))
  const desktopResetWidth = Math.max(24, tableWidth - 18 - desktopModelWidth - 15)
  const scrollBoxHeight = Math.max(4, terminalRows - 15)

  const [scrollHovered, setScrollHovered] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)

  const { snapshots, error, loading, lastRefreshed, loadData } = useQuotaData(onLogout)
  const {
    showSettings,
    setShowSettings,
    selectedSettingIndex,
    setSelectedSettingIndex,
    showUsedMetric,
    showAbsoluteTime,
    hiddenProviders,
    autoUpdate,
    updateStatus,
    availableVersion,
    updating,
    toggleUsedMetric,
    toggleAbsoluteTime,
    toggleProviderVisibility,
    toggleAutoUpdate,
    checkForUpdate,
    updateNow,
  } = useDashboardSettings()

  const uniqueProviders = useMemo(
    () => [...new Set(snapshots.map((s: QuotaSnapshot) => s.name))],
    [snapshots]
  )

  const settingsItems = useMemo<SettingsItem[]>(
    () => [
      { type: 'metric', label: 'Metric Display', value: showUsedMetric ? 'Used %' : 'Remaining %' },
      {
        type: 'time',
        label: 'Time Display',
        value: showAbsoluteTime ? 'Absolute (Date)' : 'Relative (Timer)',
      },
      ...uniqueProviders.map((p) => ({
        type: 'provider' as const,
        label: p,
        value: !hiddenProviders.has(p),
      })),
      { type: 'autoUpdate', label: 'Auto Update', value: autoUpdate },
      { type: 'checkUpdate', label: 'Check for Update', value: updateStatus },
    ],
    [uniqueProviders, showUsedMetric, showAbsoluteTime, hiddenProviders, autoUpdate, updateStatus]
  )

  useKeyboard((key) => {
    if (showSettings) {
      switch (key.name) {
        case 'up': {
          setSelectedSettingIndex((prev) => Math.max(0, prev - 1))

          break
        }
        case 'down': {
          setSelectedSettingIndex((prev) => Math.min(settingsItems.length - 1, prev + 1))

          break
        }
        case 'space':
        case 'return': {
          const item = settingsItems[selectedSettingIndex]
          if (!item) return
          switch (item.type) {
            case 'metric': {
              toggleUsedMetric()
              break
            }
            case 'time': {
              toggleAbsoluteTime()
              break
            }
            case 'provider': {
              toggleProviderVisibility(item.label)
              break
            }
            case 'autoUpdate': {
              toggleAutoUpdate()
              break
            }
            case 'checkUpdate': {
              {
                checkForUpdate()
                // No default
              }
              break
            }
          }

          break
        }
        case 'escape':
        case 's': {
          setShowSettings(false)

          break
        }
        // No default
      }
    } else {
      switch (key.name) {
        case 'r': {
          loadData()

          break
        }
        case 's': {
          setShowSettings(true)
          setSelectedSettingIndex(0)

          break
        }
        case 'u': {
          toggleUsedMetric()

          break
        }
        case 't': {
          toggleAbsoluteTime()

          break
        }
        // No default
      }
    }
  })

  const handleLogoutClick = () => {
    clearConfig()
    onLogout()
  }

  const openSettings = () => {
    setShowSettings(true)
    setSelectedSettingIndex(0)
  }

  return (
    <box
      flexDirection="column"
      alignItems="center"
      padding={1}
      height={terminalRows - 2}
      style={{ position: 'relative' }}
    >
      <Card
        title="Qmon Dashboard"
        titleColor={THEME.accent}
        width={dashboardColumns - 4}
        paddingX={1}
        paddingY={0}
        borderColor={THEME.border}
        flexGrow={1}
      >
        <DashboardHeader
          loading={loading}
          version={packageJson.version}
          updateVersion={availableVersion}
          updating={updating}
          onRefresh={() => {
            void loadData()
          }}
          onSettings={openSettings}
          onLogout={handleLogoutClick}
          onUpdate={() => {
            void updateNow()
          }}
        />

        {!error && snapshots.length > 0 && (
          <SummaryCards
            isCompact={isCompact}
            snapshots={snapshots}
            showUsedMetric={showUsedMetric}
            showAbsoluteTime={showAbsoluteTime}
          />
        )}

        {error ? (
          <box flexGrow={1} marginTop={1}>
            <box
              border
              borderStyle="single"
              borderColor={THEME.danger}
              paddingLeft={1}
              paddingRight={1}
              paddingTop={0}
              paddingBottom={0}
            >
              <text selectable={false} fg={THEME.danger} attributes={TextAttributes.BOLD}>
                Error: {error}
              </text>
            </box>
          </box>
        ) : loading && snapshots.length === 0 ? (
          <LoadingScreen label="Loading quota data" />
        ) : (
          <box flexGrow={1} marginTop={1}>
            <scrollbox
              height={scrollBoxHeight}
              flexGrow={1}
              scrollY
              focused={!showSettings}
              verticalScrollbarOptions={{
                visible: scrollHovered && hasOverflow,
                showArrows: false,
              }}
              onMouseOver={() => {
                setScrollHovered(true)
              }}
              onMouseOut={() => {
                setScrollHovered(false)
              }}
            >
              <QuotaGrid
                snapshots={snapshots}
                hiddenProviders={hiddenProviders}
                showUsedMetric={showUsedMetric}
                showAbsoluteTime={showAbsoluteTime}
                lastRefreshed={lastRefreshed}
                isCompact={isCompact}
                compactLabelWidth={compactLabelWidth}
                compactStatusWidth={compactStatusWidth}
                desktopProviderWidth={18}
                desktopModelWidth={desktopModelWidth}
                desktopMetricWidth={15}
                desktopResetWidth={desktopResetWidth}
                viewportHeight={scrollBoxHeight}
                onOverflowChange={setHasOverflow}
              />
            </scrollbox>
          </box>
        )}
      </Card>

      <Card
        width={dashboardColumns - 4}
        paddingX={0}
        paddingY={0}
        borderColor={THEME.border}
        marginTop={0}
      >
        <Footer terminalColumns={terminalColumns} />
      </Card>

      {showSettings && (
        <box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor={RGBA.fromValues(0, 0, 0, 0.7)}
          justifyContent="center"
          alignItems="center"
          onMouseDown={(e) => {
            setShowSettings(false)
            e.stopPropagation()
          }}
        >
          <SettingsCard
            items={settingsItems}
            selectedIndex={selectedSettingIndex}
            onSelect={setSelectedSettingIndex}
            onToggleMetric={toggleUsedMetric}
            onToggleTime={toggleAbsoluteTime}
            onToggleProvider={toggleProviderVisibility}
            onToggleAutoUpdate={toggleAutoUpdate}
            onCheckUpdate={() => {
              void checkForUpdate()
            }}
            width={Math.max(16, Math.min(80, terminalColumns - 4))}
          />
        </box>
      )}
    </box>
  )
}

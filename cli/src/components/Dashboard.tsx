/** @jsxImportSource @opentui/react */
import type { QuotaSnapshot } from '../api'
import { RGBA, TextAttributes } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import React, { useMemo, useState } from 'react'

import { clearConfig } from '../config'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { useQuotaData } from '../hooks/useQuotaData'
import { Card, THEME } from './ui'
import { DashboardHeader } from './dashboard/DashboardHeader'
import packageJson from '../../package.json' with { type: 'json' }
import { Footer } from './dashboard/Footer'
import { LoadingScreen } from './LoadingScreen'
import { QuotaTable } from './QuotaTable'
import { SettingsCard, type SettingsItem } from './dashboard/SettingsCard'
import { SummaryCards } from './dashboard/SummaryCards'

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
    toggleUsedMetric,
    toggleAbsoluteTime,
    toggleProviderVisibility,
  } = useDashboardSettings()

  const uniqueProviders = useMemo(
    () => Array.from(new Set(snapshots.map((s: QuotaSnapshot) => s.name))),
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
      ...uniqueProviders.map((p) => ({ type: 'provider' as const, label: p, value: !hiddenProviders.has(p) })),
    ],
    [uniqueProviders, showUsedMetric, showAbsoluteTime, hiddenProviders]
  )

  useKeyboard((key) => {
    if (showSettings) {
      if (key.name === 'up') {
        setSelectedSettingIndex((prev) => Math.max(0, prev - 1))
      } else if (key.name === 'down') {
        setSelectedSettingIndex((prev) => Math.min(settingsItems.length - 1, prev + 1))
      } else if (key.name === 'space' || key.name === 'return') {
        const item = settingsItems[selectedSettingIndex]
        if (!item) return
        if (item.type === 'metric') toggleUsedMetric()
        else if (item.type === 'time') toggleAbsoluteTime()
        else if (item.type === 'provider') toggleProviderVisibility(item.label)
      } else if (key.name === 'escape' || key.name === 's') {
        setShowSettings(false)
      }
    } else {
      if (key.name === 'r') {
        loadData()
      } else if (key.name === 's') {
        setShowSettings(true)
        setSelectedSettingIndex(0)
      } else if (key.name === 'u') {
        toggleUsedMetric()
      } else if (key.name === 't') {
        toggleAbsoluteTime()
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
          onRefresh={loadData}
          onSettings={openSettings}
          onLogout={handleLogoutClick}
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
              verticalScrollbarOptions={{ visible: scrollHovered && hasOverflow, showArrows: false }}
              onMouseOver={() => setScrollHovered(true)}
              onMouseOut={() => setScrollHovered(false)}
            >
              <QuotaTable
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
            width={Math.max(16, Math.min(80, terminalColumns - 4))}
          />
        </box>
      )}
    </box>
  )
}

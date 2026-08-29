/** @jsxImportSource @opentui/react */
import type { ReleaseInfo } from '../../update'
import { TextAttributes } from '@opentui/core'
import { useState } from 'react'

import { renderMarkdownLines } from '../../markdown'
import { Button, Card, THEME } from '../ui'

interface Props {
    version: string
    releases: ReleaseInfo[]
    width: number
    height: number
    onClose: () => void
    onUpdate: () => void
}

export function ReleaseNotesModal({ version, releases, width, height, onClose, onUpdate }: Props) {
    const [expanded, setExpanded] = useState<number[]>([0])
    const cardWidth = Math.max(30, Math.min(70, width))
    const contentIndent = 2
    // Interior width: card border (2) + horizontal padding (2) + scrollbar gutter (1)
    // + the content indent applied below each version header.
    const wrapWidth = cardWidth - 5 - contentIndent

    const toggle = (index: number) => {
        setExpanded((prev) =>
            prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index]
        )
    }

    // One entry per release slot (3): real releases first, padded with
    // placeholders so every header always renders even if the API returns fewer.
    const releaseSlots: Array<ReleaseInfo | null> = [...releases]
    while (releaseSlots.length < 3) releaseSlots.push(null)
    releaseSlots.length = Math.min(releaseSlots.length, 3)

    // The modal grows with the opened collapsibles: content budget = full
    // terminal height minus the modal chrome (card border, title, padding,
    // button row, gaps, overlay margin ≈ 12 rows) minus the version headers
    // that must always stay visible. Notes that still exceed the budget are
    // truncated with an ellipsis so no header is ever pushed out of view.
    const headerRows = releaseSlots.length * 2 - 1
    let contentBudget = Math.max(0, height - 12 - headerRows)
    const slotLines = releaseSlots.map((release, index) => {
        if (!release || !expanded.includes(index)) return []
        const all = renderMarkdownLines(release.notes, wrapWidth)
        let lines = all
        if (all.length > contentBudget - 1) {
            const shown = Math.max(1, contentBudget - 2)
            lines = [...all.slice(0, shown), { text: '…', bold: false, color: THEME.muted }]
        }
        contentBudget -= lines.length + 1
        return lines
    })
    let notesRows = headerRows
    for (const lines of slotLines) {
        if (lines.length > 0) notesRows += lines.length + 1
    }
    const notesHeight = Math.max(3, notesRows)

    return (
        <box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            backgroundColor="#000000b3"
            justifyContent="center"
            alignItems="center"
            onMouseDown={(event) => {
                event.stopPropagation()
            }}
        >
            <Card
                title={`Qmon v${version} is available`}
                titleColor={THEME.warning}
                width={cardWidth}
                borderColor={THEME.warning}
                padding={1}
                onMouseDown={(event) => {
                    event.stopPropagation()
                }}
            >
                <box flexDirection="column" gap={1}>
                    <scrollbox
                        height={notesHeight}
                        scrollY
                        verticalScrollbarOptions={{ visible: false, showArrows: false }}
                    >
                        {releaseSlots.map((release, index) => {
                            const isOpen = expanded.includes(index)
                            const lines = slotLines[index] ?? []
                            const label = release ? `v${release.version}` : `v${index === 0 ? version : '?'}`
                            return (
                                <box key={label} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
                                    <box
                                        flexDirection="row"
                                        onMouseDown={(event) => {
                                            if (release) {
                                                toggle(index)
                                            }
                                            event.stopPropagation()
                                        }}
                                    >
                                        <text selectable={false} fg={THEME.accent} attributes={TextAttributes.BOLD}>
                                            {`${isOpen ? '▾' : '▸'} ${label}`}
                                        </text>
                                    </box>
                                    {isOpen && (
                                        <box flexDirection="column" paddingLeft={contentIndent}>
                                            <text selectable={false}> </text>
                                            {lines.length > 0 ? (
                                                lines.map((line, lineIndex) => (
                                                    <text
                                                        selectable={false}
                                                        key={`${label}-${lineIndex}`}
                                                        fg={line.color}
                                                        attributes={line.bold ? TextAttributes.BOLD : 0}
                                                    >
                                                        {line.text}
                                                    </text>
                                                ))
                                            ) : (
                                                <text selectable={false} attributes={TextAttributes.DIM}>
                                                    {release
                                                        ? 'No release notes were published for this version.'
                                                        : 'Release information unavailable.'}
                                                </text>
                                            )}
                                        </box>
                                    )}
                                </box>
                            )
                        })}
                    </scrollbox>
                    <box flexDirection="row" gap={1} justifyContent="center">
                        <Button label="Update" color={THEME.warning} onClick={onUpdate} />
                        <Button label="Close" color={THEME.muted} onClick={onClose} />
                    </box>
                </box>
            </Card>
        </box>
    )
}

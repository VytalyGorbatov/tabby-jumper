import { Injectable } from '@angular/core'
import { AppService, HotkeysService, LogService, Logger, NotificationsService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalTabComponent, XTermFrontend } from 'tabby-terminal'

interface BookmarkEntry {
    /** Absolute buffer line number. */
    line: number
    /** xterm.js IMarker — keeps the position alive as the buffer scrolls. */
    marker: any
    /** xterm.js IDecoration — the visual gutter + overview ruler pip. */
    decoration: any
}

interface TabState {
    /** Absolute line numbers (baseY + cursorY) recorded when Enter was pressed. */
    commandLines: number[]
    /** Index into commandLines for prev/next navigation. */
    commandIndex: number
    /** Bookmarks with their xterm decoration handles, sorted by line. */
    bookmarkEntries: BookmarkEntry[]
}

/** @hidden */
@Injectable({ providedIn: 'root' })
export class JumperService {
    private tabStates = new WeakMap<BaseTerminalTabComponent, TabState>()
    private logger: Logger

    constructor (
        private app: AppService,
        hotkeys: HotkeysService,
        log: LogService,
        private notifications: NotificationsService,
    ) {
        this.logger = log.create('tabby-jumper')
        this.logger.info('JumperService initialised')

        hotkeys.hotkey$.subscribe(h => {
            if (h.startsWith('jumper-')) {
                this.logger.info(`Hotkey received: ${h}`)
            }
            switch (h) {
                case 'jumper-prev-command':   this.jumpPrevCommand();   break
                case 'jumper-next-command':   this.jumpNextCommand();   break
                case 'jumper-add-bookmark':   this.addBookmark();       break
                case 'jumper-prev-bookmark':  this.jumpPrevBookmark();  break
                case 'jumper-next-bookmark':  this.jumpNextBookmark();  break
            }
        })
    }

    /**
     * Called by JumperDecorator when the user presses Enter in a terminal.
     * Records the current cursor row as a command start line.
     */
    recordCommandLine (tab: BaseTerminalTabComponent): void {
        const xterm = this.getXterm(tab)
        if (!xterm) {
            this.logger.warn('recordCommandLine: could not get xterm instance (frontend not XTermFrontend or not ready)')
            return
        }
        const line: number = xterm.buffer.active.baseY + xterm.buffer.active.cursorY
        const state = this.getOrCreateState(tab)

        // Avoid duplicate entries for consecutive rapid enters
        if (state.commandLines[state.commandLines.length - 1] !== line) {
            state.commandLines.push(line)
            this.logger.debug(`Recorded command at line ${line} (history size: ${state.commandLines.length})`)
            // Cap history to avoid unbounded growth
            if (state.commandLines.length > 1000) {
                state.commandLines.shift()
            }
        } else {
            this.logger.debug(`Skipped duplicate command line ${line}`)
        }
        state.commandIndex = state.commandLines.length
    }

    /**
     * Bookmark the selected line (if any selection exists) or the cursor line.
     */
    addBookmark (tab?: BaseTerminalTabComponent): void {
        const t = tab ?? this.getActiveTab()
        if (!t) {
            this.logger.warn('addBookmark: no active terminal tab')
            return
        }
        const xterm = this.getXterm(t)
        if (!xterm) {
            this.logger.warn('addBookmark: could not get xterm instance')
            return
        }

        // Prefer the start row of the current selection; fall back to cursor row.
        const selectionPosition = xterm.getSelectionPosition?.()
        const cursorLine: number = xterm.buffer.active.baseY + xterm.buffer.active.cursorY
        const line: number = selectionPosition ? selectionPosition.start.y : cursorLine
        this.logger.info(`addBookmark: selectionPosition=${JSON.stringify(selectionPosition)}, cursorLine=${cursorLine}, resolved line=${line}`)

        const state = this.getOrCreateState(t)

        if (state.bookmarkEntries.some(e => e.line === line)) {
            this.notifications.notice(`Line ${line + 1} is already bookmarked`)
            return
        }

        // registerMarker offset is relative to the current cursor row
        const offsetFromCursor = line - cursorLine
        const marker = xterm.registerMarker(offsetFromCursor)
        const bookmarkWidth = 3
        const decoration = xterm.registerDecoration({
            marker,
            x: xterm.cols - bookmarkWidth,
            width: bookmarkWidth,
            // Paint a pip in the overview ruler (scrollbar overview) as well
            overviewRulerOptions: {
                color: '#d59139a4',
                position: 'right',
            },
        })

        // Inject a tiny CSS class the first time any decoration is created so
        // the gutter bar has a background colour.
        if (decoration) {
            decoration.onRender((el: HTMLElement) => {
                el.style.background = '#f5a623'
                el.style.opacity = '0.8'
            })
        }

        state.bookmarkEntries.push({ line, marker, decoration })
        state.bookmarkEntries.sort((a, b) => a.line - b.line)
        this.logger.info(`Bookmark added at line ${line} (total: ${state.bookmarkEntries.length}), marker=${!!marker}, decoration=${!!decoration}`)
        this.notifications.notice(`Bookmarked line ${line + 1}`)
    }

    jumpPrevCommand (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            this.logger.warn('jumpPrevCommand: no active terminal tab')
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.commandLines.length === 0) {
            this.logger.info('jumpPrevCommand: no recorded commands yet')
            return
        }
        state.commandIndex = Math.max(0, state.commandIndex - 1)
        this.logger.info(`jumpPrevCommand: index=${state.commandIndex}, line=${state.commandLines[state.commandIndex]}`)
        this.scrollToLine(tab, state.commandLines[state.commandIndex])
    }

    jumpNextCommand (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            this.logger.warn('jumpNextCommand: no active terminal tab')
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.commandLines.length === 0) {
            this.logger.info('jumpNextCommand: no recorded commands yet')
            return
        }
        state.commandIndex = Math.min(state.commandLines.length - 1, state.commandIndex + 1)
        this.logger.info(`jumpNextCommand: index=${state.commandIndex}, line=${state.commandLines[state.commandIndex]}`)
        this.scrollToLine(tab, state.commandLines[state.commandIndex])
    }

    jumpPrevBookmark (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            this.logger.warn('jumpPrevBookmark: no active terminal tab')
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.bookmarkEntries.length === 0) {
            this.notifications.notice('No bookmarks in this tab')
            return
        }
        const xterm = this.getXterm(tab)
        if (!xterm) {
            this.logger.warn('jumpPrevBookmark: could not get xterm instance')
            return
        }
        const currentTop: number = xterm.buffer.active.viewportY
        const lines = state.bookmarkEntries.map(e => e.line)
        // Find the last bookmark strictly above the current viewport top
        const prev = [...lines].reverse().find(b => b < currentTop)
        // Wrap around to the last bookmark if none found above
        const target = prev !== undefined ? prev : lines[lines.length - 1]
        this.logger.info(`jumpPrevBookmark: currentTop=${currentTop}, bookmarks=${JSON.stringify(lines)}, target=${target}`)
        this.scrollToLine(tab, target)
    }

    jumpNextBookmark (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            this.logger.warn('jumpNextBookmark: no active terminal tab')
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.bookmarkEntries.length === 0) {
            this.notifications.notice('No bookmarks in this tab')
            return
        }
        const xterm = this.getXterm(tab)
        if (!xterm) {
            this.logger.warn('jumpNextBookmark: could not get xterm instance')
            return
        }
        const currentTop: number = xterm.buffer.active.viewportY
        const lines = state.bookmarkEntries.map(e => e.line)
        // Find the first bookmark strictly below the current viewport top
        const next = lines.find(b => b > currentTop)
        // Wrap around to the first bookmark if none found below
        const target = next !== undefined ? next : lines[0]
        this.logger.info(`jumpNextBookmark: currentTop=${currentTop}, bookmarks=${JSON.stringify(lines)}, target=${target}`)
        this.scrollToLine(tab, target)
    }

    private scrollToLine (tab: BaseTerminalTabComponent, line: number): void {
        const xterm = this.getXterm(tab)
        if (!xterm) {
            this.logger.warn('scrollToLine: could not get xterm instance')
            return
        }
        this.logger.info(`scrollToLine: scrolling to line ${line}`)
        xterm.scrollToLine(line)
        this.flashLine(xterm, line)
    }

    private flashLine (xterm: any, line: number): void {
        const cursorLine: number = xterm.buffer.active.baseY + xterm.buffer.active.cursorY
        const marker = xterm.registerMarker(line - cursorLine)
        if (!marker) {
            return
        }
        const decoration = xterm.registerDecoration({
            marker,
            width: xterm.cols,
        })
        if (!decoration) {
            marker.dispose()
            return
        }
        decoration.onRender((el: HTMLElement) => {
            el.style.transition = 'none'
            el.style.background = 'rgba(255, 220, 80, 0.35)'
            // Force a reflow so the browser registers the start state before animating
            void el.offsetHeight
            el.style.transition = 'background 500ms ease-out'
            el.style.background = 'rgba(255, 220, 80, 0)'
        })
        setTimeout(() => {
            decoration.dispose()
            marker.dispose()
        }, 500)
    }

    private getActiveTab (): BaseTerminalTabComponent | null {
        const activeTab = this.app.activeTab
        // Unwrap SplitTabComponent to get the focused pane inside it
        const tab = activeTab instanceof SplitTabComponent
            ? activeTab.getFocusedTab()
            : activeTab
        this.logger.debug(`getActiveTab: resolved tab type=${tab?.constructor?.name ?? 'none'}`)
        if (tab instanceof BaseTerminalTabComponent) {
            return tab
        }
        this.logger.warn(`getActiveTab: active tab is not a terminal (type: ${tab?.constructor?.name ?? 'none'})`)
        return null
    }

    private getOrCreateState (tab: BaseTerminalTabComponent): TabState {
        if (!this.tabStates.has(tab)) {
            this.tabStates.set(tab, { commandLines: [], commandIndex: -1, bookmarkEntries: [] })
        }
        return this.tabStates.get(tab)!
    }

    /**
     * Returns the underlying xterm.js Terminal instance for the tab's frontend,
     * or null if the frontend is not an XTermFrontend.
     */
    private getXterm (tab: BaseTerminalTabComponent): any {
        const frontend = (tab as any).frontend
        if (!frontend) {
            this.logger.warn('getXterm: tab has no frontend yet')
            return null
        }
        if (!(frontend instanceof XTermFrontend)) {
            this.logger.warn(`getXterm: frontend is not XTermFrontend (type: ${frontend?.constructor?.name})`)
            return null
        }
        const xterm = (frontend as any).xterm ?? null
        if (!xterm) {
            this.logger.warn('getXterm: XTermFrontend has no xterm instance yet')
        }
        return xterm
    }
}

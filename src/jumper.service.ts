import { Injectable } from '@angular/core'
import { AppService, HotkeysService, NotificationsService } from 'tabby-core'
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
    private tabStates = new WeakMap<BaseTerminalTabComponent<any>, TabState>()

    constructor (
        private app: AppService,
        private hotkeys: HotkeysService,
        private notifications: NotificationsService,
    ) {
        hotkeys.hotkey$.subscribe(h => {
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
    recordCommandLine (tab: BaseTerminalTabComponent<any>): void {
        const xterm = this.getXterm(tab)
        if (!xterm) {
            return
        }
        const line: number = xterm.buffer.active.baseY + xterm.buffer.active.cursorY
        const state = this.getOrCreateState(tab)

        // Avoid duplicate entries for consecutive rapid enters
        if (state.commandLines[state.commandLines.length - 1] !== line) {
            state.commandLines.push(line)
            // Cap history to avoid unbounded growth
            if (state.commandLines.length > 1000) {
                state.commandLines.shift()
            }
        }
        state.commandIndex = state.commandLines.length - 1
    }

    /**
     * Bookmark the current cursor line of the given tab (or the active tab).
     */
    addBookmark (tab?: BaseTerminalTabComponent<any>): void {
        const t = tab ?? this.getActiveTab()
        if (!t) {
            return
        }
        const xterm = this.getXterm(t)
        if (!xterm) {
            return
        }
        const line: number = xterm.buffer.active.baseY + xterm.buffer.active.cursorY
        const state = this.getOrCreateState(t)

        if (state.bookmarkEntries.some(e => e.line === line)) {
            this.notifications.notice(`Line ${line + 1} is already bookmarked`)
            return
        }

        // registerMarker offset is relative to the current cursor row
        const offsetFromCursor = line - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY)
        const marker = xterm.registerMarker(offsetFromCursor)
        const decoration = xterm.registerDecoration({
            marker,
            // A narrow coloured bar in the left gutter of the terminal
            width: 2,
            // Paint a pip in the overview ruler (scrollbar overview) as well
            overviewRulerOptions: {
                color: '#f5a623',
                position: 'left',
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
        this.notifications.notice(`Bookmarked line ${line + 1}`)
    }

    jumpPrevCommand (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.commandLines.length === 0) {
            return
        }
        state.commandIndex = Math.max(0, state.commandIndex - 1)
        this.scrollToLine(tab, state.commandLines[state.commandIndex])
    }

    jumpNextCommand (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.commandLines.length === 0) {
            return
        }
        state.commandIndex = Math.min(state.commandLines.length - 1, state.commandIndex + 1)
        this.scrollToLine(tab, state.commandLines[state.commandIndex])
    }

    jumpPrevBookmark (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.bookmarkEntries.length === 0) {
            this.notifications.notice('No bookmarks in this tab')
            return
        }
        const xterm = this.getXterm(tab)
        if (!xterm) {
            return
        }
        const currentTop: number = xterm.buffer.active.baseY
        const lines = state.bookmarkEntries.map(e => e.line)
        // Find the last bookmark strictly above the current viewport top
        const prev = [...lines].reverse().find(b => b < currentTop)
        // Wrap around to the last bookmark if none found above
        const target = prev !== undefined ? prev : lines[lines.length - 1]
        this.scrollToLine(tab, target)
    }

    jumpNextBookmark (): void {
        const tab = this.getActiveTab()
        if (!tab) {
            return
        }
        const state = this.tabStates.get(tab)
        if (!state || state.bookmarkEntries.length === 0) {
            this.notifications.notice('No bookmarks in this tab')
            return
        }
        const xterm = this.getXterm(tab)
        if (!xterm) {
            return
        }
        const currentTop: number = xterm.buffer.active.baseY
        const lines = state.bookmarkEntries.map(e => e.line)
        // Find the first bookmark strictly below the current viewport top
        const next = lines.find(b => b > currentTop)
        // Wrap around to the first bookmark if none found below
        const target = next !== undefined ? next : lines[0]
        this.scrollToLine(tab, target)
    }

    private scrollToLine (tab: BaseTerminalTabComponent<any>, line: number): void {
        const xterm = this.getXterm(tab)
        if (!xterm) {
            return
        }
        xterm.scrollToLine(line)
    }

    private getActiveTab (): BaseTerminalTabComponent<any> | null {
        const tab = this.app.activeTab
        if (tab instanceof BaseTerminalTabComponent) {
            return tab
        }
        return null
    }

    private getOrCreateState (tab: BaseTerminalTabComponent<any>): TabState {
        if (!this.tabStates.has(tab)) {
            this.tabStates.set(tab, { commandLines: [], commandIndex: -1, bookmarkEntries: [] })
        }
        return this.tabStates.get(tab)!
    }

    /**
     * Returns the underlying xterm.js Terminal instance for the tab's frontend,
     * or null if the frontend is not an XTermFrontend.
     */
    private getXterm (tab: BaseTerminalTabComponent<any>): any {
        const frontend = (tab as any).frontend
        if (frontend instanceof XTermFrontend) {
            return (frontend as any).xterm ?? null
        }
        return null
    }
}

import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'

/** @hidden */
@Injectable()
export class JumperHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            {
                id: 'jumper-prev-command',
                name: 'Jump to previous command',
            },
            {
                id: 'jumper-next-command',
                name: 'Jump to next command',
            },
            {
                id: 'jumper-add-bookmark',
                name: 'Bookmark current line',
            },
            {
                id: 'jumper-prev-bookmark',
                name: 'Jump to previous bookmark',
            },
            {
                id: 'jumper-next-bookmark',
                name: 'Jump to next bookmark',
            },
        ]
    }
}

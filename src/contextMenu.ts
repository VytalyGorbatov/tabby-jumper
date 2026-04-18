import { Injectable } from '@angular/core'
import { MenuItemOptions } from 'tabby-core'
import { BaseTerminalTabComponent, TerminalContextMenuItemProvider } from 'tabby-terminal'
import { JumperService } from './jumper.service'

/** @hidden */
@Injectable()
export class JumperContextMenuProvider extends TerminalContextMenuItemProvider {
    weight = 10

    constructor (
        private jumper: JumperService,
    ) {
        super()
    }

    async getItems (tab: BaseTerminalTabComponent): Promise<MenuItemOptions[]> {
        return [
            {
                label: 'Bookmark this line',
                click: () => this.jumper.addBookmark(tab),
            },
        ]
    }
}

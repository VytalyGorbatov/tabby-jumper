import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider, TabContextMenuItemProvider } from 'tabby-core'
import { TerminalDecorator } from 'tabby-terminal'

import { JumperConfigProvider } from './configProvider'
import { JumperDecorator } from './terminalDecorator'
import { JumperHotkeyProvider } from './hotkeyProvider'
import { JumperContextMenuProvider } from './contextMenu'

@NgModule({
    imports: [
        CommonModule,
        TabbyCoreModule,
    ],
    providers: [
        { provide: TabContextMenuItemProvider, useClass: JumperContextMenuProvider, multi: true },
        { provide: HotkeyProvider, useClass: JumperHotkeyProvider, multi: true },
        { provide: ConfigProvider, useClass: JumperConfigProvider, multi: true },
        { provide: TerminalDecorator, useClass: JumperDecorator, multi: true },
    ],
})
export default class JumperModule { }

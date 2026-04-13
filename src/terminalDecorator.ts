import { Injectable } from '@angular/core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { JumperService } from './jumper.service'

/** @hidden */
@Injectable()
export class JumperDecorator extends TerminalDecorator {
    constructor (
        private jumper: JumperService,
    ) {
        super()
    }

    attach (tab: BaseTerminalTabComponent<any>): void {
        // Subscribe to raw input; detect Enter (CR = 0x0d) to record the
        // current cursor position as a command start line.
        tab.input$.subscribe((data: Buffer) => {
            if (data.includes(0x0d)) {
                this.jumper.recordCommandLine(tab)
            }
        })
    }
}

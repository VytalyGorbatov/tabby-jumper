import { Injectable } from '@angular/core'
import { LogService, Logger } from 'tabby-core'
import { TerminalDecorator, BaseTerminalTabComponent } from 'tabby-terminal'
import { JumperService } from './jumper.service'

/** @hidden */
@Injectable()
export class JumperDecorator extends TerminalDecorator {
    private logger: Logger

    constructor (
        private jumper: JumperService,
        log: LogService,
    ) {
        super()
        this.logger = log.create('tabby-jumper')
        this.logger.info('JumperDecorator instantiated')
    }

    attach (tab: BaseTerminalTabComponent): void {
        this.logger.info(`JumperDecorator attached to tab: ${tab.title}`)
        tab.input$.subscribe((data: Buffer) => {
            if (data.includes(0x0d)) {
                this.logger.debug(`Enter detected in tab: ${tab.title}`)
                this.jumper.recordCommandLine(tab)
            }
        })
    }
}

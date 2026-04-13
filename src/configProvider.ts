import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class JumperConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'jumper-prev-command':  [],
            'jumper-next-command':  [],
            'jumper-add-bookmark':  [],
            'jumper-prev-bookmark': [],
            'jumper-next-bookmark': [],
        },
    }
}

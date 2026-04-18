import { Engine } from './_engine.js'
import { sendMessage } from '../messages.js'


export class CarlEngine extends Engine {

  static executeTimeout = 10
  static hears = [
    /^(карл[^ ]*)+ *(.*)/i,
    /^(carl[^ ]*)+ *(.*)/i
  ]

  /** @type {[RegExp, (carl:CarlEngine) => Promise<void>|void][]} */
  static commands = [
    [
      /^carl|^карл/i,
      carl => sendMessage(carl.context, 'carl')
    ],
    [
      /^search|^поиск/i,
      carl => sendMessage(carl.context, 'search')
    ],
    [
      /^pins|^закреп/i,
      carl => sendMessage(carl.context, 'pins')
    ],
    [
      /^maps|^карт/i,
      carl => sendMessage(carl.context, 'maps')
    ]
  ]

  async execute() {
    const word = this.text.trim()
    let matched

    if (word) {
      for (const [keywords, command] of CarlEngine.commands) {
        if (keywords.test(word)) {
          matched = true
          await command(this)
          break
        }
      }
    } else {
      await sendMessage(this.context, 'carl')
      matched = true
    }

    if (!matched) await this.next()
  }

}

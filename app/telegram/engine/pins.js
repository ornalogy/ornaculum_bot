import { fmt, code } from 'telegraf/format'
import { Engine } from './_engine.js'
import { isAnyChat, isAdmin } from '../utils.js'
/* global RegExpExecArray */

export class PinsEngine extends Engine {

  static hears = /^(!)+ *(.+)/
  static displayLimit = 7
  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string}} context
   */
  static async writeStatistic(app, context) {
    await app.db.User.findOrCreateFromTelegram(context.from)
    if (context.from.id !== context.chat.id) {
      await app.db.Chat.findOrCreateFromTelegram(context.chat)
    }
  }

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string}} context
   * @returns {Promise<boolean>}
   */
  static async addPin(app, context) {
    if (await isAdmin(context)) {
      let link = null
      let title = ''
      /** @type {string|string[]} */
      let keywords = ''
      /** @type {string|string[]} */
      let payload = (context.payload || '').trim()
      /** @type {import('telegraf/types').Message} */// @ts-ignore
      const rMsg = context.message.reply_to_message
      const isReply = rMsg && rMsg.message_id !== rMsg.message_thread_id
      const chat = context.message.chat.id
      const thread = isReply && rMsg.is_topic_message ? context.message.message_thread_id : null
      const message = isReply ? rMsg.message_id : null

      if (!payload) {
        await this.replyTo(context, 'Не указаны данные закрепления, см. /pins')

        return false
      }
      payload = payload.split(/\n+/)

      if (isReply) {
        [title, keywords] = payload
      } else {
        [link, title, keywords] = payload
        link = link.trim()
        try {
          link = new URL(link).href
        } catch (_) {
          await this.replyTo(context, 'Указана некорректная ссылка, см. /pins')

          return false
        }
      }

      title = (title || '').trim()
      if (!title) {
        await this.replyTo(context, 'Не указан заголовок для поиска закрепления, см. /pins')

        return false
      }
      if (title.length > 128) {
        await this.replyTo(context, 'Максимальная длина заголовка 128 символов')

        return false
      }

      keywords = (keywords || '').trim()
      if (!keywords) {
        await this.replyTo(context, 'Не указаны ключевые слова для поиска закрепления, см. /pins')

        return false
      }
      if (keywords.length > 128) {
        await this.replyTo(context, 'Максимальная длина списка ключевых слов 128 символов')

        return false
      }
      keywords = keywords.split(/ +/).map(k => k.trim())

      await app.db.ChatPin.createOrUpdate({ chat, thread, message, link, title, keywords })
      await this.replyTo(context, 'Сообщение закреплено для поиска')
    }
  }

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} context
   */
  static async pinList(app, context) {
    if (await isAdmin(context)) {
      const chat = context.message.chat.id
      let last = parseInt(context.payload)

      if (isNaN(last) && context.match) last = parseInt(context.match[1])
      if (isNaN(last)) last = 0

      let message = ''
      const pins = await app.db.ChatPin.pinList(chat, last, 10)

      if (!pins.length) {
        await this.replyTo(context, 'Не удалось ничего найти')

        return
      }

      for (const pin of pins) {
        message += `/pin_${pin.id} ${pin.title}\n`
      }

      message += `еще: /pinlist_${pins[pins.length - 1].id}`

      await this.replyTo(context, message.trim())
    }
  }

  /**
   * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} context
   * @param {import('../../database.js').ChatPin} pin
   * @returns {string}
   */
  static getMessageLink(context, pin) {
    const chat = context.message.chat.id
    let chatName = 'username' in context.chat ? context.chat.username : null
    let link

    if (!chatName) {
      chatName = String(Math.abs(chat))
      if (chatName.length === 13) chatName = chatName.replace(/^100/, '')
      if (chatName.length === 13) chatName = chatName.replace(/^10/, '')
      chatName = 'c/' + chatName
    }

    if (pin.thread) {
      link = `https://t.me/${chatName}/${pin.thread}/${pin.message}`
    } else {
      link = `https://t.me/${chatName}/${pin.message}`
    }

    return link
  }

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} context
   */
  static async pinInfo(app, context) {
    if (await isAdmin(context)) {
      const chat = context.message.chat.id
      const id = parseInt(context.match[1])

      if (id && !isNaN(id)) {
        const pin = await app.db.ChatPin.pinInfo(chat, id)
        let message = fmt`Заголовок: ${pin.title}`

        if (pin.message) {
          pin.link = this.getMessageLink(context, pin)
        }

        message = fmt`${message}\nСсылка: ${pin.link}\nКлючевые слова: ${pin.keywords.join(' ')}`
        message = fmt`${message}\nУдалить: ${code`/delpin_${pin.id}`}`

        await this.replyTo(context, message)
      }
    }
  }

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} context
   */
  static async delPin(app, context) {
    if (await isAdmin(context)) {
      const chat = context.message.chat.id
      const id = parseInt(context.match[1])

      if (id && !isNaN(id)) {
        await app.db.ChatPin.delPin(chat, id)

        await this.replyTo(context, 'Закрепление сообщения удалено')
      }
    }
  }

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} context
   * @param {string[]} words
   * @returns {Promise<import('../../database.js').ChatPin[]>}
   */
  static async search(app, context, words) {
    const chat = context.message.chat.id
    const pins = (await app.db.PinKeyword.findPins(chat, words))
      .slice(0, this.displayLimit)

    for (const pin of pins) {
      if (pin.message) {
        pin.link = this.getMessageLink(context, pin)
      }
    }

    return pins
  }

  async execute() {
    if (isAnyChat(this.context)) {
      this.words = this.text
        .trim().split(/[\s_]+/)
        .filter(s => s.length > 1)

      let message = ''
      const pins = await PinsEngine.search(this.app, this.context, this.words)

      if (!pins.length) {
        await this.replyTo('Не удалось ничего найти')

        return
      }

      for (const pin of pins) {
        message += `${pin.title}\n${pin.link}\n\n`
      }

      await this.replyTo(message.trim())


      await this.writeStatistic()
    }
  }

  async writeStatistic() {
    await PinsEngine.writeStatistic(this.app, this.context)
  }

}


const searchName = 'Ornalogy Pin Search API'
const searchWordsFilter = /^[а-яё]+$|^\w+$/i
/** @type {Array<import('./search.js').SearchContext>} */
const searchStages = [
  {
    name: 'all',
    default: true
  },
  {
    name: 'all by keywords',
    keywords: /pin|пин|закреп/i
  }
]


/**
 * @param {import('../engine/search.js').SearchArgs} args
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function search({ engine, words }) {
  const results = []

  if (isAnyChat(engine.context)) {
    const pins = await PinsEngine.search(engine.app, engine.context, words)

    for (const pin of pins) {
      results.push({
        message: pin.title,
        urls: [pin.link],
        writeStatistic: false
      })
    }
  }

  return results
}


export {
  searchName,
  searchWordsFilter,
  searchStages,
  search
}

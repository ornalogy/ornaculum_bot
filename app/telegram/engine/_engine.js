import { replyToSimple } from '../utils.js'
/* global RegExpExecArray */

const engineCreate = Symbol('Engine#create')
const engineFinalize = Symbol('Engine#finalize')

export class Engine {

  static #busy = false
  static #timeout = null
  /** @type {Array<Engine>} */
  static #queue = []

  static #tick() {
    if (Engine.#busy && !Engine.#timeout) {
      Engine.#busy = false
    }
    if (!Engine.#busy && Engine.#queue.length) {
      Engine.#busy = true
      Engine.#execute()
        .then(engine => {
          Engine.#timeout = setTimeout(() => {
            Engine.#timeout = null
            Engine.#busy = false
            Engine.#tick() // @ts-ignore
          }, engine.constructor.executeTimeout)
        })
        .catch(error => {
          Engine.#timeout = setTimeout(() => {
            Engine.#timeout = null
            console.error(error)
            Engine.#busy = false
            Engine.#tick()
          }, Engine.executeTimeout)
        })
        .finally(() => {
          if (!Engine.#timeout) {
            Engine.#busy = false
            Engine.#tick()
          }
        })
    }
  }

  /**
   * @param {Engine} engine
   */
  static async #logOfUsage(engine) {
    // console.log(engine.context)
  }

  static async #execute() {
    const engine = Engine.#queue.shift()

    try {
      await engine.execute()
      await this.#logOfUsage(engine)
    } catch (error) {
      console.error(error)
    }
    await engine[engineFinalize]()

    return engine
  }

  /** @type {RegExp|RegExp[]} */
  static hears = null
  /** @type {RegExp} */
  static callbacks = null
  static executeTimeout = 5000
  static queueLimit = 100
  static waitingLimit = 5

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context  & { match: RegExpExecArray }} context
   * @param {() => Promise<void>} next
   */
  static attach(app, context, next) {
    const [, command, text, botName] = context.match
    const msgValid = command && typeof text === 'string'

    if (msgValid && (!botName || botName === `@${context.me}`)) {
      if (Engine.#queue.length > this.queueLimit) {
        replyToSimple(context, 'Извините... Орнакул не может Вас выслушать, ' +
          'в мастерской столпилось очень много людей. Попробуйте зайти попозже.\n' +
          `Количество человек перед Вами: ${Engine.#queue.length}`)
        Engine.#tick()
      } else {
        const engine = new this(app, context, next, command, text)

        engine[engineCreate]()
        Engine.#queue.push(engine)
        Engine.#tick()
      }
    } else {
      next()
    }
  }

  /**
   * @param {import('telegraf').Context} context
   * @param {string | import('telegraf').Format.FmtString} text
   * @param {import('telegraf').Types.ExtraReplyMessage} [extra]
   * @returns {Promise<import('telegraf/types').Message.TextMessage|void>}
   */
  static async replyTo(context, text, extra) {
    return await replyToSimple(context, text, extra)
  }

  /** @type {Promise<import('telegraf/types').Message.TextMessage|void>} */
  #stateMessage = null

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context} context
   * @param {() => Promise<void>} next
   * @param {string} command
   * @param {string} text
   */
  constructor(app, context, next, command, text) {
    /** @type {import('../../../app.js').MyApp} */
    this.app = app
    /** @type {import('telegraf').Context} */
    this.context = context
    /** @type {() => Promise<void>} */
    this.next = next
    /** @type {string} */
    this.command = command
    /** @type {string} */
    this.text = text
  }

  [engineCreate]() { // @ts-ignore
    if (Engine.#queue.length > this.constructor.waitingLimit) {
      this.#stateMessage = this.replyTo('Ожидайте... Ваш запрос важен для нас!' +
        `\nКоличество человек перед Вами: ${Engine.#queue.length}` + '\n⏳')
    }
  }

  async [engineFinalize]() {
    const stateMessage = await this.#stateMessage

    if (stateMessage) {
      await this.context.telegram.deleteMessage(
        stateMessage.chat.id,
        stateMessage.message_id
      )
    }
  }

  async execute() {
    await this.replyTo('<Engine not implemented>')
  }

  /**
   * @param {string | import('telegraf').Format.FmtString} text
   * @param {import('telegraf').Types.ExtraReplyMessage} [extra]
   * @returns {Promise<import('telegraf/types').Message.TextMessage|void>}
   */
  async replyTo(text, extra) {
    return await replyToSimple(this.context, text, extra)
  }

}

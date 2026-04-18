import { Markup } from 'telegraf'
import { Engine } from './_engine.js'
import { getWeekMonday } from './../../utils.js'
import { getCities, addMapMarker } from './../../api/cartography.js'

/**
 * @typedef Location
 * @property {number} latitude
 * @property {number} longitude
 */

export class CartographyEngine extends Engine {

  static hears = /^(\/map)+\s*([\s\S]*)/
  static callbacks = /^(map:callback):(.*)/
  static locationRE = /^(\d+\.\d+)[, ]+(\d+\.\d+)\s*([\s\S]*)$/
  static executeTimeout = 1
  static buttons = {
    dungeon: 'Обычное подземелье',
    fort: 'Крепость гоблинов',
    mystic_cave: 'Таинственная пещера',
    beast_den: 'Звериное логово',
    dragon_roost: 'Гнездовье драконов',
    underworld_portal: 'Портал в преисподнюю',
    chaos_portal: 'Портал хаоса',
    battlegrounds: 'Поля боя',
    valley_of_gods: 'Долина богов',
    coliseum: 'Колизей',
    prometheus: 'Башня Прометея',
    oceanus: 'Башня Океануса',
    themis: 'Башня Темис',
    eos: 'Башня Эос',
    selene: 'Башня Селены',
    demeter: 'Монумент Деметры',
    ithra: 'Монумент Итры',
    thor: 'Монумент Тора',
    vulcan: 'Монумент Вулкана'
  }

  /**
   * @param {string} status
   * @returns {Markup.Markup}
   */
  static getButtons(status) {
    switch (status) {
      case 'type': return Markup.inlineKeyboard([
        [
          Markup.button.callback('Башня', 'map:callback:tower'),
          Markup.button.callback('Монумент', 'map:callback:monument')
        ],
        [
          Markup.button.callback('Подземелье', 'map:callback:dungeon'),
          Markup.button.callback('Колизей', 'map:callback:coliseum:null')
        ]
      ])
      case 'dungeon': return Markup.inlineKeyboard([
        [
          Markup.button.callback(this.buttons.fort, 'map:callback:dungeon:fort'),
          Markup.button.callback(this.buttons.mystic_cave, 'map:callback:dungeon:mystic_cave')
        ],
        [Markup.button.callback(this.buttons.dungeon, 'map:callback:dungeon:dungeon')],
        [
          Markup.button.callback(this.buttons.beast_den, 'map:callback:dungeon:beast_den'),
          Markup.button.callback(this.buttons.dragon_roost, 'map:callback:dungeon:dragon_roost')
        ],
        [
          Markup.button.callback(this.buttons.underworld_portal, 'map:callback:dungeon:underworld_portal'),
          Markup.button.callback(this.buttons.chaos_portal, 'map:callback:dungeon:chaos_portal')
        ],
        [
          Markup.button.callback(this.buttons.battlegrounds, 'map:callback:dungeon:battlegrounds'),
          Markup.button.callback(this.buttons.valley_of_gods, 'map:callback:dungeon:valley_of_gods')
        ],
        [Markup.button.callback('Назад', 'map:callback:type')]
      ])
      case 'tower': return Markup.inlineKeyboard([
        [
          Markup.button.callback(this.buttons.prometheus, 'map:callback:tower:prometheus'),
          Markup.button.callback(this.buttons.oceanus, 'map:callback:tower:oceanus')
        ],
        [
          Markup.button.callback(this.buttons.themis, 'map:callback:tower:themis'),
          Markup.button.callback(this.buttons.eos, 'map:callback:tower:eos'),
          Markup.button.callback(this.buttons.selene, 'map:callback:tower:selene')
        ],
        [Markup.button.callback('Назад', 'map:callback:type')]
      ])
      case 'monument': return Markup.inlineKeyboard([
        [
          Markup.button.callback(this.buttons.demeter, 'map:callback:monument:demeter'),
          Markup.button.callback(this.buttons.ithra, 'map:callback:monument:ithra')
        ],
        [
          Markup.button.callback(this.buttons.thor, 'map:callback:monument:thor'),
          Markup.button.callback(this.buttons.vulcan, 'map:callback:monument:vulcan')
        ],
        [Markup.button.callback('Назад', 'map:callback:type')]
      ])
    }
  }

  async executeCommand() {
    if (!this.text) {
      if (this.context.chat.type === 'private') {
        await this.replyTo('Карты \nhttps://ornalogy.ru/maps/')
      } else {
        const chatID = this.context.chat.id
        const botID = this.context.botInfo.id
        const botAccess = await this.app.bot.telegram.getChatMember(chatID, botID)
        const chat = await this.app.db.Chat.findOrCreateFromTelegram(this.context.chat)
        const user = await this.app.db.User.findOrCreateFromTelegram(this.context.from)

        if (!user) {
          return await this.replyTo('Данный функционал недоступен для ботов, анонимов и пользователей без @username')
        }

        if (botAccess.status !== 'administrator') {
          chat.setBotAccess(false)

          return await this.replyTo('Для работы с картами назначьте бота администратором чата')
        }

        chat.setBotAccess(true)
        await this.app.db.MapAccess.findOrCreate({ where: { user: user.id, chat: chat.id }, defaults: { allowed: true } })
        await this.replyTo(`Карта чата\nhttps://ornalogy.ru/maps/?chat=${chat.uuid}`)
      }
    }
  }

  async executeMessage() {
    /** @type {Location} */
    let location
    /** @type {string} */
    let locationLabel
    /** @type {string} */
    let week

    if ('reply_to_message' in this.context.message) {
      const reply = this.context.message.reply_to_message

      if ('location' in reply) {
        week = getWeekMonday(new Date(reply.date * 1000))
        location = reply.location
        locationLabel = this.text || ''
      }
    }
    if (!location && CartographyEngine.locationRE.test(this.text)) {
      const [, latitude, longitude, message] = CartographyEngine.locationRE.exec(this.text)

      week = getWeekMonday(new Date(this.context.message.date * 1000))
      location = { latitude: Number.parseFloat(latitude), longitude: Number.parseFloat(longitude) }
      locationLabel = message || ''
    }
    if (!location) {
      return this.executeCommand()
    } else {
      const user = await this.app.db.User.findOrCreateFromTelegram(this.context.from)

      if (!user) {
        return await this.replyTo('Данный функционал недоступен для ботов, анонимов и пользователей без @username')
      }
    }

    if (!week) {
      week = getWeekMonday()
    }

    const { latitude: lat, longitude: lon } = location
    let msg = `Укажите вид объекта\nweek: ${week}\nlat,lon: ${lat},${lon}`

    if (locationLabel) msg += `\nlabel: ${locationLabel}`

    await this.replyTo(msg, CartographyEngine.getButtons('type'))
  }

  async executeCallback() {
    const [status, view] = this.text.split(':')

    if (!view) {
      return await this.context.editMessageReplyMarkup(CartographyEngine.getButtons(status).reply_markup)
    }

    if ('text' in this.context.callbackQuery.message) {
      const message = this.context.callbackQuery.message.text
      const [, week] = (/week: (\d\d\d\d-\d\d-\d\d)/).exec(message)
      const [, lat, lon] = (/lat,lon: (\d+\.\d+),+(\d+\.\d+)/).exec(message)
      const [, label] = (/label: ([\s\S]*)/).exec(message) || []
      const latitude = Number.parseFloat(lat)
      const longitude = Number.parseFloat(lon)

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return false

      const chat = this.context.chat.type !== 'private'
        ? (await this.app.db.Chat.findOrCreateFromTelegram(this.context.chat)).id
        : null
      const user = (await this.app.db.User.findOrCreateFromTelegram(this.context.callbackQuery.from))?.id
      /** @type {keyof import('../../database.js').MapMarkerTypes} */// @ts-ignore
      const type = status
      /** @type {keyof import('../../database.js').MapMarkerSubtypes} */// @ts-ignore
      const subtype = view === 'null' ? null : view
      const reply = this.context.callbackQuery.message.reply_to_message
      const ornuuid = `tgmsg:${reply.chat.id}:${reply.message_id}`
      const cities = await getCities(this.app, { latitude, longitude })
      const lName = CartographyEngine.buttons[subtype] || CartographyEngine.buttons[type]

      if (!user) {
        return await this.replyTo('Данный функционал недоступен для ботов, анонимов и пользователей без @username')
      }

      await this.context.deleteMessage()
      if (chat) {
        await this.app.db.MapAccess.findOrCreate({ where: { user, chat }, defaults: { allowed: true } })
      }
      await addMapMarker(this.app, cities, { ornuuid, user: chat ? null : user, chat, week, type, subtype, latitude, longitude, label })
      await this.replyTo(`Метка добавлена!\n${lName}, ${week}`)
    }
  }

  async execute() {
    if (this.context.callbackQuery) {
      await this.context.answerCbQuery()
      await this.executeCallback()
    } else if (this.context.message) {
      await this.executeMessage()
    }
  }

}

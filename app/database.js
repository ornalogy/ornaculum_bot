import { randomBytes } from 'node:crypto'
import { fastifyPlugin } from 'fastify-plugin'
import { Clasyquelize, ClasyModel, DataTypes, Op } from '@nodutilus/clasyquelize'
import { getWeekMonday } from './utils.js'


class Entity extends ClasyModel {

  static id = this.attribute({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true })
  static uuid = this.attribute({ type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false }).index({ unique: true })

  /**
   * @param {string} uuid
   * @returns {Promise<any>}
   */
  static async findByUUID(uuid) {
    const entity = await this.findOne({ where: { uuid } })

    return entity
  }

  /** @type {boolean} */
  #debounceSaver
  debounceSave() {
    if (!this.#debounceSaver) {
      this.#debounceSaver = !!setTimeout(() => {
        this.save()
        this.#debounceSaver = null
      }, 1000)
    }
  }

}


class Chat extends Entity {

  static telegramid = this.attribute({ type: DataTypes.BIGINT }).index({ unique: true })
  static username = this.attribute({ type: DataTypes.STRING }).index({ unique: true })
  static title = DataTypes.STRING
  static botIsAdmin = DataTypes.BOOLEAN
  static settings = this.attribute({ type: DataTypes.JSON, defaultValue: {} })

  /**
   * @param {{id?:number,username?:string}} rawChat
   * @returns {Promise<Chat>}
   */
  static async findFromTelegram(rawChat) {
    const fltr = rawChat.id ? { telegramid: rawChat.id } : { username: rawChat.username }
    const chat = await this.findOne({ where: fltr })

    return chat
  }

  /**
   * @param {{id:number,username?:string,title?:string}} rawChat
   * @returns {Promise<Chat>}
   */
  static async findOrCreateFromTelegram(rawChat) {
    let chat = await this.findFromTelegram(rawChat)

    if (chat) {
      chat.username = rawChat.username
      chat.title = rawChat.title
      await chat.save()
    } else {
      chat = await this.create({
        telegramid: rawChat.id,
        username: rawChat.username,
        title: rawChat.title
      })
    }

    return chat
  }

  /**
   * @param {boolean} isAdmin
   */
  setBotAccess(isAdmin) {
    this.botIsAdmin = isAdmin
    this.debounceSave()
  }

  /**
   * @returns {number[]}
   */
  getBinds() {
    return this.settings.binds || []
  }

  /**
   * @param {number[]} binds
   */
  setBinds(binds) {
    this.settings.binds = binds
    this.changed('settings', true)
    this.debounceSave()
  }

}


class User extends Entity {

  static telegramid = this.attribute({ type: DataTypes.BIGINT }).index({ unique: true })
  static username = this.attribute({ type: DataTypes.STRING, allowNull: false }).index({ unique: true })
  static firstname = DataTypes.STRING
  static lastname = DataTypes.STRING
  static settings = this.attribute({ type: DataTypes.JSON, defaultValue: {} })

  /**
   * @param {{id?:number,username?:string}} rawUser
   * @returns {Promise<User>}
   */
  static async findFromTelegram(rawUser) {
    const fltr = rawUser.id ? { telegramid: rawUser.id } : { username: rawUser.username }
    const user = await this.findOne({ where: fltr })

    return user
  }

  /**
   * @param {{id:number,is_bot?:boolean,username?:string,first_name?:string,last_name?:string}} rawUser
   * @returns {Promise<User>}
   */
  static async findOrCreateFromTelegram(rawUser) {
    let user = await this.findFromTelegram(rawUser)

    if (user) {
      user.username = rawUser.username || user.username
      user.firstname = rawUser.first_name
      user.lastname = rawUser.last_name
      await user.save()
    } else if (!rawUser.is_bot && rawUser.username) {
      user = await this.create({
        telegramid: rawUser.id,
        username: rawUser.username,
        firstname: rawUser.first_name,
        lastname: rawUser.last_name
      })
    }

    return user
  }

  /**
   * @param {string} scopeName
   * @param {string} feature
   * @returns {boolean}
   */
  grantAccess(scopeName, feature) {
    const scope = this.grantedFeatures(scopeName)
    let result = false

    if (!scope.includes(feature)) {
      scope.push(feature)
      this.changed('settings', true)
      this.debounceSave()
      result = true
    }

    return result
  }

  /**
   * @param {string} scopeName
   * @returns {string[]}
   */
  grantedFeatures(scopeName) {
    /** @type {{[scopeName:string]:string[]}} */
    const access = this.settings.access || (this.settings.access = {})
    const scope = access[scopeName] || (access[scopeName] = [])

    return scope
  }

  /**
   * @param {string} scopeName
   * @param {string} feature
   * @returns {boolean}
   */
  hasGrantedFeature(scopeName, feature) {
    const scope = this.grantedFeatures(scopeName)

    return scope.includes(feature)
  }

  /**
   * @param {string} scopeName
   * @param {string} feature
   * @returns {boolean}
   */
  revokeAccess(scopeName, feature) {
    const scope = new Set(this.grantedFeatures(scopeName))
    let result = false

    if (scope.has(feature)) {
      scope.delete(feature)
      this.settings.access[scopeName] = Array.from(scope)
      this.changed('settings', true)
      this.debounceSave()
      result = true
    }

    return result
  }

}


class Session extends Entity {

  static user = User

  static token = this.attribute({ type: DataTypes.STRING }).index({ unique: true })
  static userAgent = this.attribute({ type: DataTypes.STRING })

  static debugMode = true

  /**
   * @param {User} user
   * @returns {Promise<Session>}
   */
  static async findOrCreateByUser(user) {
    let session = await this.findOne({
      where: {
        user: user.id,
        userAgent: null
      }
    })

    if (!session) {
      session = await this.create()
    }

    return session
  }

  async createToken() {
    let token = randomBytes(3).toString('hex').toUpperCase()

    while (await Session.findOne({ where: { token } })) {
      token = randomBytes(3).toString('hex').toUpperCase()
    }

    this.token = token
    this.debounceSave()
  }

  /**
   * @param {string} token
   * @returns {Promise<any>}
   */
  static async findByToken(token) {
    const session = await this.findOne({ where: { token } })

    return session
  }

  static async clearNotUpdated() {
    const notUpdated = await this.findAll({
      where: {
        user: { [Op.is]: null },
        updatedAt: { // 10 дней,  60 * 60 * 24 * 10 * 1000
          [Op.lt]: new Date(new Date().getTime() - 864000000)
        }
      },
      order: [['updatedAt', 'ASC']],
      limit: 10
    })

    notUpdated.forEach(s => s.destroy({ force: true }))
  }

  removeToken() {
    this.token = null
    this.debounceSave()
  }

  /**
   * @param {string} userAgent
   */
  setUserAgent(userAgent) {
    this.userAgent = userAgent
    this.debounceSave()
  }

  /**
   * @param {User} user
   */
  setUser(user) {
    this.user = user.id
    this.debounceSave()
  }

  prolong() {
    this.updatedAt = new Date()
    this.changed('updatedAt', true)
    this.debounceSave()
  }

}


class SearchHistory extends Entity {

  static message = this.attribute({ type: DataTypes.TEXT }).index({ unique: true })
  static urls = this.attribute({ type: DataTypes.JSON, defaultValue: [] })

  /**
   * @param {import('./telegram/engine/search.js').SearchResult[]} results
   * @returns {Promise<SearchHistory[]>}
   */
  static async writeHistory(results) {
    const history = []

    for (const result of results) {
      if (result.urls && result.writeStatistic !== false) {
        history.push(await this.#writeHistory(result))
      }
    }

    return history
  }

  /**
   * @param {import('./telegram/engine/search.js').SearchResult} result
   * @returns {Promise<SearchHistory>}
   */
  static async #writeHistory(result) {
    const history = await this.findOne({ where: { message: result.message } })

    if (history) {
      if (history.urls.join('') !== result.urls.join('')) {
        history.urls = result.urls
        history.debounceSave()
      }

      return history
    } else {
      return await this.create({ message: result.message, urls: result.urls })
    }
  }

}


class SearchStatistic extends Entity {

  static chat = Chat
  static user = User
  static history = SearchHistory

  static month = this.attribute({ type: DataTypes.BIGINT }).index()
  static counter = DataTypes.BIGINT

  /**
   * @param {number} chat
   * @param {number} user
   * @param {number[]} historyResults
   */
  static async writeStatistics(chat, user, historyResults) {
    const dt = new Date()
    const month = dt.getUTCFullYear() * 12 + dt.getUTCMonth()

    await this.#writeStatistic({ user, month })
    if (chat) {
      await this.#writeStatistic({ chat, month })
      await this.#writeStatistic({ chat, user, month })
    }

    for (const history of historyResults) {
      await this.#writeStatistic({ history, month })
    }
  }

  /**
   * @param {{month:number,chat?:number,user?:number,history?:number}} where
   */
  static async #writeStatistic(where) {
    const stat = await this.findOne({ where })

    if (stat) {
      stat.counter++
      stat.debounceSave()
    } else {
      await this.create({ ...where, counter: 1 })
    }
  }

  /**
   * @param {number} limit
   * @returns {Promise<Array<import('./telegram/engine/search.js').SearchResult & {counter:number}>>}
   */
  static async topHistory(limit) {
    const dt = new Date()
    const month = dt.getUTCFullYear() * 12 + dt.getUTCMonth()
    const statistic = await this.findAll({
      where: { month, history: { [Op.not]: null } },
      order: [['counter', 'DESC']],
      limit,
      include: [SearchStatistic.history]
    })
    const result = statistic.map(history => {
      return {
        message: history.$history.message,
        urls: history.$history.urls,
        counter: history.counter
      }
    })

    return result
  }

}


class ChatPin extends Entity {

  static chat = this.attribute({ type: DataTypes.BIGINT })
  static thread = this.attribute({ type: DataTypes.BIGINT })
  static message = this.attribute({ type: DataTypes.BIGINT })
  static link = this.attribute({ type: DataTypes.STRING })
  static title = this.attribute({ type: DataTypes.STRING })

  static uMessage = this.index({ fields: ['chat', 'thread', 'message'], unique: true })
  static uLink = this.index({ fields: ['chat', 'link'], unique: true })

  /**
   * @param {{chat:number,thread:number,message:number,link:string,title:string,keywords:string[]}} pin
   * @returns {Promise<ChatPin>}
   */
  static async createOrUpdate({ chat, thread, message, link, title, keywords }) {
    let pin = message
      ? await this.findOne({ where: { chat, thread, message } })
      : await this.findOne({ where: { chat, link } })

    if (pin) {
      pin.title = title
      pin.debounceSave()
    } else {
      pin = await this.create({ chat, thread, message, link, title })
    }

    keywords = keywords || []
    keywords.push(title)
    pin.keywords = await PinKeyword.createOrUpdateWords(chat, pin.id, keywords)

    return pin
  }

  /**
   * @param {number} chat
   * @param {number} last
   * @param {number} limit
   * @returns {Promise<ChatPin[]>}
   */
  static async pinList(chat, last, limit) {
    return await this.findAll({
      where: { chat, id: { [Op.gt]: last } },
      order: [['id', 'ASC']],
      limit
    })
  }

  /**
   * @param {number} chat
   * @param {number} id
   * @returns {Promise<ChatPin>}
   */
  static async pinInfo(chat, id) {
    const pin = await this.findOne({ where: { chat, id } })
    /** @type {string[]} */
    const keywords = (await PinKeyword.findAll({ where: { chat, pin: id } }))
      .map(k => k.word)

    pin.keywords = keywords

    return pin
  }

  /**
   * @param {number} chat
   * @param {number} id
   */
  static async delPin(chat, id) {
    const pin = await this.findOne({ where: { chat, id } })

    if (pin) {
      await PinKeyword.destroy({
        where: { chat, pin: id },
        force: true
      })
      await pin.destroy({ force: true })
    }
  }

}


class PinKeyword extends Entity {

  static pin = ChatPin

  static chat = this.attribute({ type: DataTypes.BIGINT })
  static word = this.attribute({ type: DataTypes.STRING }).index()

  static iChatPin = this.index({ fields: ['chat', 'pin'] })
  static uPinWord = this.index({ fields: ['chat', 'pin', 'word'], unique: true })

  /**
   * @param {number} chat
   * @param {number} pin
   * @param {string[]} keywords
   * @returns {Promise<PinKeyword[]>}
   */
  static async createOrUpdateWords(chat, pin, keywords) {
    const newWords = new Set(keywords.map(k => k.toLowerCase()))
    const curWords = await this.findAll({ where: { chat, pin } })
    const updWords = []

    for (const item of curWords) {
      if (newWords.has(item.word)) {
        updWords.push(item.word)
        updWords.push(item)
        newWords.delete(item.word)
      } else {
        await item.destroy({ force: true })
      }
    }

    for (const word of newWords) {
      updWords.push(await this.create({ chat, pin, word }))
    }

    return updWords
  }

  /**
   * @param {number} chat
   * @param {string[]} keywords
   * @returns {Promise<ChatPin[]>}
   */
  static async findPins(chat, keywords) {
    const uPins = new Set()
    const pins = []
    const matched = {}
    let words = await this.findAll({
      where: { chat, word: { [Op.in]: keywords } },
      include: [PinKeyword.pin]
    })

    if (!words.length && keywords.length === 1) {
      words = await this.findAll({
        where: { chat, word: { [Op.substring]: keywords[0] } },
        include: [PinKeyword.pin]
      })
    }

    for (const { $pin } of words) {
      if (uPins.has($pin.id)) {
        matched[$pin.id]++
      } else {
        pins.push($pin)
        uPins.add($pin.id)
        matched[$pin.id] = 1
      }
    }

    pins.sort((a, b) => matched[b.id] - matched[a.id])

    return pins
  }

}


/**
 * @typedef MapCityItem
 * @property {number} osmid
 * @property {string} nameEN
 * @property {string} nameRU
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} minLatitude
 * @property {number} maxLatitude
 * @property {number} minLongitude
 * @property {number} maxLongitude
 * @property {{latitude:number,longitude:number}[][]} coordinates
 */
class MapCity extends Entity {

  static osmid = this.attribute({ type: DataTypes.INTEGER }).index({ unique: true })
  static nameEN = this.attribute({ type: DataTypes.STRING }).index({ unique: true })
  static nameRU = this.attribute({ type: DataTypes.STRING })
  static latitude = this.attribute({ type: DataTypes.FLOAT })
  static longitude = this.attribute({ type: DataTypes.FLOAT })
  static minLatitude = this.attribute({ type: DataTypes.FLOAT })
  static maxLatitude = this.attribute({ type: DataTypes.FLOAT })
  static minLongitude = this.attribute({ type: DataTypes.FLOAT })
  static maxLongitude = this.attribute({ type: DataTypes.FLOAT })
  static coordinates = this.attribute({ type: DataTypes.JSON, defaultValue: [] })

  static iBoundingBox = this.index({ fields: ['minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude'] })

  /**
   * @param {MapCityItem} cityItem
   * @returns {Promise<MapCity>}
   */
  static async addCity(cityItem) {
    let city = await this.findOne({ where: { osmid: cityItem.osmid } })

    if (city) {
      city.nameEN = cityItem.nameEN
      city.nameRU = cityItem.nameRU
      city.latitude = cityItem.latitude
      city.longitude = cityItem.longitude
      city.minLatitude = cityItem.minLatitude
      city.maxLatitude = cityItem.maxLatitude
      city.minLongitude = cityItem.minLongitude
      city.maxLongitude = cityItem.maxLongitude
      city.coordinates = cityItem.coordinates
      await city.save()
    } else {
      city = await this.create(cityItem)
    }

    return city
  }

  /**
   * @param {{latitude:number,longitude:number}} location
   * @returns {Promise<MapCity[]>}
   */
  static async findCities({ latitude, longitude }) {
    const cities = await this.findAll({
      where: {
        minLatitude: { [Op.lte]: latitude },
        maxLatitude: { [Op.gte]: latitude },
        minLongitude: { [Op.lte]: longitude },
        maxLongitude: { [Op.gte]: longitude }
      }
    })

    return cities
  }

}


/**
 * @typedef MapMarkerTypes
 * @property {number} dungeon
 * @property {number} coliseum
 * @property {number} tower
 * @property {number} monument
 */
/**
 * @typedef MapMarkerSubtypes
 * @property {number} dungeon
 * @property {number} fort
 * @property {number} mystic_cave
 * @property {number} beast_den
 * @property {number} dragon_roost
 * @property {number} underworld_portal
 * @property {number} chaos_portal
 * @property {number} battlegrounds
 * @property {number} valley_of_gods
 * @property {number} prometheus
 * @property {number} oceanus
 * @property {number} themis
 * @property {number} eos
 * @property {number} selene
 * @property {number} demeter
 * @property {number} ithra
 * @property {number} thor
 * @property {number} vulcan
 */
/**
 * @typedef MapMarkerItem
 * @property {number} [id]
 * @property {string} [ornuuid]
 * @property {string} week
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {keyof MapMarkerTypes} type
 * @property {keyof MapMarkerSubtypes} subtype
 * @property {string} [label]
 * @property {number} [user]
 * @property {number} [chat]
 * @property {number} [city]
 */
/**
 * @typedef UpdateMarker
 * @property {string} uuid
 * @property {string} ornuuid
 * @property {string} week
 * @property {keyof MapMarkerTypes} type
 * @property {keyof MapMarkerSubtypes} subtype
 * @property {string} [label]
 */
/**
 * @typedef RemoveMarker
 * @property {string} uuid
 * @property {string} ornuuid
 */
class MapMarker extends Entity {

  static ornuuid = this.attribute({ type: DataTypes.STRING }).index()
  static week = this.attribute({ type: DataTypes.DATEONLY }).index()
  static latitude = this.attribute({ type: DataTypes.FLOAT })
  static longitude = this.attribute({ type: DataTypes.FLOAT })
  static type = this.attribute({ type: DataTypes.INTEGER })
  static subtype = this.attribute({ type: DataTypes.INTEGER })
  static label = this.attribute({ type: DataTypes.STRING })

  static iMovableMarker = this.index({ fields: ['ornuuid', 'week'], where: { week: { [Op.not]: null } } })
  static iStaticMarker = this.index({ fields: ['ornuuid'], where: { week: { [Op.is]: null } } })

  /** @type {MapMarkerTypes} */
  static types = {
    dungeon: 1,
    coliseum: 2,
    tower: 3,
    monument: 4
  }

  static rTypes = Object.entries(this.types).reduce((r, [key, val]) => (r[val] = key) && r, {})

  static view = {
    dungeon: 'dynamicsubtype',
    coliseum: 'static',
    tower: 'movable',
    monument: 'movable'
  }

  /** @type {MapMarkerSubtypes} */
  static subtypes = {
    dungeon: 101,
    fort: 102,
    mystic_cave: 103,
    beast_den: 104,
    dragon_roost: 105,
    underworld_portal: 106,
    chaos_portal: 107,
    battlegrounds: 108,
    valley_of_gods: 109,
    prometheus: 301,
    oceanus: 302,
    themis: 303,
    eos: 304,
    selene: 305,
    demeter: 401,
    ithra: 402,
    thor: 403,
    vulcan: 404
  }

  static rSubtypes = Object.entries(this.subtypes).reduce((r, [key, val]) => (r[val] = key) && r, {})

  /**
   * @param {MapMarkerItem} marker
   * @returns {Promise<boolean>}
   */
  static async addMarker(marker) {
    if (!(marker.type in this.types)) return false
    if (marker.subtype && !(marker.subtype in this.subtypes)) return false

    const { user, chat, city, week, ornuuid, latitude, longitude, label } = marker
    const type = this.types[marker.type]
    const view = this.view[marker.type]
    const subtype = this.subtypes[marker.subtype]

    if (view === 'static' || view === 'dynamicsubtype') {
      let markerItem = ornuuid
        ? await this.findOne({ where: { ornuuid, week: { [Op.is]: null } } })
        : null

      if (markerItem) {
        await markerItem.update({ latitude, longitude, type, label })
      } else {
        markerItem = await this.create({ ornuuid, latitude, longitude, type, label })
      }

      await MapAccess.findOrCreate({ where: { user, chat, city } })
      await MapMarkerAccess.findOrCreate({ where: { user, chat, city, marker: markerItem.id } })
    }
    if (view === 'dynamicsubtype' || view === 'movable') {
      let markerItem = ornuuid
        ? await this.findOne({ where: { ornuuid, week } })
        : null

      if (markerItem) {
        if (markerItem.subtype !== this.subtypes.dungeon && subtype === this.subtypes.dungeon) {
          await markerItem.update({ latitude, longitude, type, label })
        } else {
          await markerItem.update({ latitude, longitude, type, subtype, label })
        }
      } else {
        markerItem = await this.create({ ornuuid, week, latitude, longitude, type, subtype, label })
      }

      if (view === 'movable') {
        await MapAccess.findOrCreate({ where: { user, chat, city } })
        await MapMarkerAccess.findOrCreate({ where: { user, chat, city, week, marker: markerItem.id } })
      }
    }
  }

  /**
   * @param {UpdateMarker} marker
   * @returns {Promise<boolean>}
   */
  async updateMarker(marker) {
    if (!(marker.type in MapMarker.types)) return false
    if (marker.subtype && !(marker.subtype in MapMarker.subtypes)) return false

    const { ornuuid, week, label } = marker
    const type = MapMarker.types[marker.type]
    const view = MapMarker.view[marker.type]
    const subtype = MapMarker.subtypes[marker.subtype]

    if (view === 'static' || view === 'dynamicsubtype') {
      await this.update({ type, label })
    }
    if (view === 'movable') {
      await this.update({ type, subtype, label })
    }
    if (view === 'dynamicsubtype') {
      const markerItem = ornuuid
        ? await MapMarker.findOne({ where: { ornuuid, week } })
        : null

      if (markerItem) {
        await markerItem.update({ type, subtype, label })
      } else if (view === 'dynamicsubtype') {
        await MapMarker.create({ ornuuid, week, latitude: this.latitude, longitude: this.longitude, type, subtype, label })
      }
    }

    return true
  }

  /**
   * @returns {Promise<boolean>}
   */
  async removeMarker() {
    const { id, ornuuid } = this

    await MapMarkerAccess.destroy({
      where: { marker: id },
      force: true
    })
    await this.destroy({ force: true })
    if (ornuuid) {
      await MapMarker.destroy({
        where: { ornuuid },
        force: true
      })
    }

    return true
  }

}


class MapAccess extends ClasyModel {

  static user = User
  static chat = Chat
  static city = MapCity

  static allowed = this.attribute({ type: DataTypes.BOOLEAN, defaultValue: true })

  static iUserChat = this.index({ fields: ['user', 'chat'] })

  /**
   * @param {number} user
   * @param {number} chat
   * @returns {Promise<boolean>}
   */
  static async isAllowedMap(user, chat) {
    const mapAccess = await this.findOne({ where: { user, chat, city: { [Op.is]: null } } })

    return mapAccess?.allowed
  }

  /**
   * @param {number} user
   * @param {number} city
   * @returns {Promise<boolean>}
   */
  static async isAllowedCity(user, city) {
    const mapAccess = await this.findOne({ where: { user, city, chat: { [Op.is]: null } } })

    return mapAccess?.allowed
  }

  /**
   * @typedef MapCityListItem
   * @property {string} uuid
   * @property {string} nameEN
   * @property {string} nameRU
   */
  /**
   * @param {number} chat
   * @returns {Promise<MapCityListItem[]>}
   */
  static async findCitiesByChat(chat) {
    const mapAccess = await this.findAll({
      where: { chat, user: { [Op.is]: null }, allowed: true },
      include: [MapAccess.city],
      order: Clasyquelize.col('$city.nameRU')
    })
    const cities = mapAccess.map(({ $city: { uuid, nameEN, nameRU } }) => ({ uuid, nameEN, nameRU }))

    return cities
  }

  /**
   * @typedef UserMaps
   * @property {MapCityListItem[]} private
   * @property {{[uuid:string]:{title:string,cities:MapCityListItem[]}}} chats
   */
  /**
   * @param {number} user
   * @returns {Promise<UserMaps>}
   */
  static async findMapsByUser(user) {
    const maps = { private: [], chats: {} }
    /** @type {[{chat:string,title:string,uuid:string,nameEN:string,nameRU:string}[]]} */// @ts-ignore
    const [mapAccess] = await this.sequelize.query(`
      SELECT
        cm."chat", cm."title",
        mc."uuid", mc."nameEN", mc."nameRU"
      FROM (
        SELECT c."uuid" "chat", c."title",
          COALESCE(um."city", cm."city") "city"
        FROM "MapAccesses" um
        LEFT JOIN "Chats" c
          ON um."chat" = c."id"
        LEFT JOIN "MapAccesses" cm
          ON um."chat" = cm."chat" AND cm."user" IS NULL
        WHERE um."user" = $user
      ) AS cm
      LEFT JOIN "MapCities" mc
        ON cm."city" = mc."id"
      ORDER BY cm."title" NULLS FIRST, mc."nameRU"
    `, {
      bind: { user }
    })

    for (const { chat, title, uuid, nameEN, nameRU } of mapAccess) {
      if (chat) {
        if (chat in maps.chats) {
          maps.chats[chat].cities.push({ uuid, nameEN, nameRU })
        } else {
          maps.chats[chat] = { title, cities: uuid ? [{ uuid, nameEN, nameRU }] : [] }
        }
      } else {
        maps.private.push({ uuid, nameEN, nameRU })
      }
    }

    return maps
  }

  /**
   * @param {number} user
   * @param {number} chat
   * @returns {Promise<boolean>}
   */
  static async hideMap(user, chat) {
    await this.destroy({
      where: { user, chat, city: { [Op.is]: null } },
      force: true
    })

    return true
  }

  /**
   * @param {number} user
   * @param {number} chat
   * @param {number} city
   * @returns {Promise<boolean>}
   */
  static async removeMapCity(user, chat, city) {
    if (user && chat && city) {
      if (await this.isAllowedMap(user, chat)) {
        await this.destroy({
          where: { chat, city, user: { [Op.is]: null } },
          force: true
        })
        await MapMarkerAccess.clearMap(city, { chat })

        return true
      }
    } else if (user && city) {
      await this.destroy({
        where: { user, city, chat: { [Op.is]: null } },
        force: true
      })
      await MapMarkerAccess.clearMap(city, { user })

      return true
    }

    return false
  }

}


class MapMarkerAccess extends ClasyModel {

  static user = User
  static chat = Chat
  static city = MapCity
  static marker = MapMarker

  static week = this.attribute({ type: DataTypes.DATEONLY }).index()

  static iUserWeekCity = this.index({ fields: ['user', 'week', 'city'] })
  static iChatWeekCity = this.index({ fields: ['chat', 'week', 'city'] })
  static iMarker = this.index({ fields: ['marker'] })

  /**
   * @typedef MapMarkerListItem
   * @property {string} uuid
   * @property {string} ornuuid
   * @property {string} week
   * @property {number} latitude
   * @property {number} longitude
   * @property {string} type
   * @property {string} subtype
   * @property {string} label
   */
  /**
   * @param {number} city
   * @param {{user?:number,chat?:number,week?:string}} filter
   * @returns {Promise<MapMarkerListItem[]>}
   */
  static async findCityMarkers(city, { user, chat, week }) {
    const filter = chat ? 'AND mma."chat" = $chat' : 'AND mma."user" = $user'
    /** @type {[MapMarkerListItem[]]} */// @ts-ignore
    const [markers] = await this.sequelize.query(`
      SELECT
        mm."uuid", mm."ornuuid", mm."week", mm."latitude", mm."longitude",
        mm."type", mm."subtype", mm."label"
      FROM "MapMarkerAccesses" mma
      JOIN "MapMarkers" mm ON mma."marker" = mm."id"
        AND mma."city" = $city AND mma."week" = $week
        ${filter}
      UNION
      SELECT
        mm."uuid", mm."ornuuid", COALESCE(mmst."week", mm."week") "week", mm."latitude", mm."longitude",
        mm."type", mmst."subtype", COALESCE(mmst."label", mm."label") "label"
      FROM "MapMarkerAccesses" mma
      JOIN "MapMarkers" mm ON mma."marker" = mm."id"
        AND mma."city" = $city AND mma."week" IS NULL
        ${filter}
      LEFT JOIN "MapMarkers" mmst ON mm."ornuuid" = mmst."ornuuid"
        AND mmst."week" = $week
    `, {
      bind: { city, user, chat, week: week || getWeekMonday() }
    })

    return markers.map(marker => {
      marker.type = MapMarker.rTypes[marker.type]
      marker.subtype = MapMarker.rSubtypes[marker.subtype]

      return marker
    })
  }

  /**
   * @param {number} city
   * @param {{user?:number,chat?:number}} filter
   * @returns {Promise<string[]>}
   */
  static async findCityWeeks(city, { user, chat }) {
    const filter = chat ? 'AND mma."chat" = $chat' : 'AND mma."user" = $user'
    const week = getWeekMonday()
    /** @type {[{week:string}[]]} */// @ts-ignore
    const [items] = await this.sequelize.query(`
      SELECT DISTINCT mma."week"
      FROM "MapMarkerAccesses" mma
      WHERE mma."city" = $city
        AND mma."week" IS NOT NULL
        ${filter}
      ORDER BY mma."week" DESC
    `, {
      bind: { city, user, chat }
    })
    const weeks = items.map(i => i.week)

    if (!weeks.includes(week)) {
      weeks.unshift(week)
    }

    return weeks
  }

  /**
   * @param {number} user
   * @param {number} marker
   * @returns {Promise<boolean>}
   */
  static async userAccess(user, marker) {
    const [[item]] = await this.sequelize.query(`
      SELECT mma."id"
      FROM "MapMarkerAccesses" mma
      WHERE mma."marker" = $marker
        AND mma."user" = $user
      UNION
      SELECT mma."id"
      FROM "MapMarkerAccesses" mma
      JOIN "MapAccesses" ma
        ON mma."chat" = ma."chat"
          AND ma."user" = $user
          AND mma."marker" = $marker
      LIMIT 1
    `, {
      bind: { user, marker }
    })

    return !!item
  }

  /**
   * @param {number} city
   * @param {{user?:number,chat?:number}} filter
   * @returns {Promise<void>}
   */
  static async clearMap(city, { user, chat }) {
    /** @type {(MapMarkerAccess & {$marker?:MapMarker})[]} */
    let markers

    if (chat) {
      markers = await this.findAll({
        where: { city, chat, user: { [Op.is]: null } },
        include: [MapMarkerAccess.marker]
      })
    } else {
      markers = await this.findAll({
        where: { city, user, chat: { [Op.is]: null } },
        include: [MapMarkerAccess.marker]
      })
    }

    if (markers && markers.length) {
      for (const { $marker } of markers) {
        await $marker.removeMarker()
      }
    }
  }

}


/**
 * @typedef DB
 * @property {typeof Chat} Chat
 * @property {typeof User} User
 * @property {typeof Session} Session
 * @property {typeof SearchHistory} SearchHistory
 * @property {typeof SearchStatistic} SearchStatistic
 * @property {typeof ChatPin} ChatPin
 * @property {typeof PinKeyword} PinKeyword
 * @property {typeof MapCity}  MapCity
 * @property {typeof MapMarker} MapMarker
 * @property {typeof MapAccess} MapAccess
 * @property {typeof MapMarkerAccess} MapMarkerAccess
 */
export default fastifyPlugin(
  /**
   * @param {import('../app.js').MyApp} app
   */
  async function routes(app) {
    const sequelize = new Clasyquelize(app.env.dataBase, { logging: app.env.debugMode ? console.log : false })
    /** @type {DB} */
    const db = { Chat, User, Session, SearchHistory, SearchStatistic, ChatPin, PinKeyword, MapCity, MapMarker, MapAccess, MapMarkerAccess }

    Session.debugMode = app.env.debugMode

    sequelize.attachModel(Chat, User, Session, SearchHistory, SearchStatistic, ChatPin, PinKeyword, MapCity, MapMarker, MapAccess, MapMarkerAccess)
    app.decorate('db', db)

    if (app.env.syncDataBase) {
      await sequelize.sync({ alter: { drop: false } })
      console.log('Database synchronization is complete!')
      process.exit(0)
    } else {
      await sequelize.sync()
    }
  }
)
export { Chat, User, Session, SearchHistory, SearchStatistic, ChatPin, PinKeyword, MapCity, MapMarker, MapAccess, MapMarkerAccess }

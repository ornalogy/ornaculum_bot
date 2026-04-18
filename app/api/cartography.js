import { isPointInPolygon } from 'geolib'
import { httpRequest, resolveBody } from '../utils.js'

/**
 * @typedef MarkerItem
 * @property {number} city
 * @property {string} week
 * @property {string} ornuuid
 * @property {string} type
 * @property {string} subtype
 * @property {Location} location
 * @property {Location} position
 */
/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function addMapMarkers(app, req, res) {
  /** @type {MarkerItem[]} */ // @ts-ignore
  const markerList = resolveBody(req.body, [])

  if (req.auth.user) {
    const user = req.auth.user.id
    const chat = null

    for (const rawMarker of markerList) {
      const { ornuuid, week, position, location } = rawMarker
      const { latitude, longitude } = location
      /** @type {{type:keyof import('../database.js').MapMarkerTypes}} */// @ts-ignore
      const { type } = rawMarker
      /** @type {{subtype:keyof import('../database.js').MapMarkerSubtypes}} */// @ts-ignore
      const { subtype } = rawMarker
      /** @type {import('../database.js').MapMarkerItem} */
      const marker = { user, chat, ornuuid, week, type, subtype, latitude, longitude }
      const cities = await getCities(app, position, location)

      await addMapMarker(app, cities, marker)
    }

    return { success: true }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function updateMapMarker(app, req, res) {
  if (req.auth.user) {
    /** @type {import('../database.js').UpdateMarker} */// @ts-ignore
    const markerRaw = resolveBody(req.body, {})
    /** @type {import('../database.js').MapMarker & import('../database.js').MapMarkerItem} */
    const marker = await app.db.MapMarker.findByUUID(markerRaw.uuid)

    if (await app.db.MapMarkerAccess.userAccess(req.auth.user.id, marker.id)) {
      const success = await marker.updateMarker(markerRaw)

      return { success }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function removeMapMarker(app, req, res) {
  if (req.auth.user) {
    /** @type {import('../database.js').RemoveMarker} */// @ts-ignore
    const markerRaw = resolveBody(req.body, {})
    /** @type {import('../database.js').MapMarker & import('../database.js').MapMarkerItem} */
    const marker = await app.db.MapMarker.findByUUID(markerRaw.uuid)

    if (await app.db.MapMarkerAccess.userAccess(req.auth.user.id, marker.id)) {
      const success = await marker.removeMarker()

      return { success }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function removeMapCity(app, req, res) {
  if (req.auth.user) {
    /** @type {{chat:string, city:string}} */// @ts-ignore
    const { chat: chatUUID, city: cityUUID } = resolveBody(req.body, {})
    const chat = chatUUID ? await app.db.Chat.findByUUID(chatUUID) : null
    const city = await app.db.MapCity.findByUUID(cityUUID)

    if (chat && city && await isAllowedMap(app, req.auth.user, chat)) {
      return { success: await app.db.MapAccess.removeMapCity(req.auth.user.id, chat.id, city.id) }
    } else if (!chat && city && await isAllowedCity(app, req.auth.user, city)) {
      return { success: await app.db.MapAccess.removeMapCity(req.auth.user.id, null, city.id) }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}

/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function hideMap(app, req, res) {
  if (req.auth.user) {
    /** @type {{chat:string}} */// @ts-ignore
    const { chat: chatUUID } = resolveBody(req.body, {})
    const chat = await app.db.Chat.findByUUID(chatUUID)

    if (chat) {
      return { success: await app.db.MapAccess.hideMap(req.auth.user.id, chat.id) }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}

/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../database.js').User} user
 * @param {import('../database.js').Chat} chat
 * @returns {Promise<boolean>}
 */
async function isAllowedMap(app, user, chat) {
  let allowed = await app.db.MapAccess.isAllowedMap(user.id, chat.id)

  if (typeof chat.botIsAdmin !== 'boolean') {
    const botID = app.bot.botInfo.id
    let botAccess

    try {
      botAccess = await app.bot.telegram.getChatMember(chat.telegramid, botID)
    } catch (_) { }

    chat.setBotAccess(botAccess?.status === 'administrator')
  }

  if (typeof allowed === 'undefined' && chat.botIsAdmin) {
    const chatMember = await app.bot.telegram.getChatMember(chat.telegramid, user.telegramid)

    allowed = ['creator', 'administrator', 'member'].includes(chatMember.status) ||
      (chatMember.status === 'restricted' && chatMember.is_member)
    await app.db.MapAccess.create({ user: user.id, chat: chat.id, allowed })
  }

  return allowed
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../database.js').User} user
 * @param {import('../database.js').MapCity} city
 * @returns {Promise<boolean>}
 */
async function isAllowedCity(app, user, city) {
  const allowed = await app.db.MapAccess.isAllowedCity(user.id, city.id)

  return allowed
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function loadMaps(app, req, res) {
  if (req.auth.user) {
    const maps = await app.db.MapAccess.findMapsByUser(req.auth.user.id)

    return { success: true, maps }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function mapLoadCities(app, req, res) {
  if (req.auth.user) {
    /** @type {{chat:string}} */// @ts-ignore
    const { chat: chatUUID } = resolveBody(req.body, {})
    const chat = await app.db.Chat.findByUUID(chatUUID)

    if (chat && await isAllowedMap(app, req.auth.user, chat)) {
      const cities = await app.db.MapAccess.findCitiesByChat(chat.id)

      return { success: true, title: chat.title, cities }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function mapLoadMarkers(app, req, res) {
  if (req.auth.user) {
    /** @type {{chat:string}} */// @ts-ignore
    const { chat: chatUUID, city: cityUUID, week } = resolveBody(req.body, {})
    const chat = chatUUID ? await app.db.Chat.findByUUID(chatUUID) : null
    const city = await app.db.MapCity.findByUUID(cityUUID)

    if (city) {
      const { osmid, nameEN, nameRU, latitude, longitude, coordinates } = city

      if (chat && await isAllowedMap(app, req.auth.user, chat)) {
        const markers = await app.db.MapMarkerAccess.findCityMarkers(city.id, { chat: chat.id, week })

        return {
          success: true,
          chat: chat.title,
          city: { osmid, nameEN, nameRU, latitude, longitude, coordinates },
          markers
        }
      } else if (!chat && city && await isAllowedCity(app, req.auth.user, city)) {
        const markers = await app.db.MapMarkerAccess.findCityMarkers(city.id, { user: req.auth.user.id, week })

        return {
          success: true,
          chat: null,
          city: { osmid, nameEN, nameRU, latitude, longitude, coordinates },
          markers
        }
      } else {
        return { success: false }
      }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function mapLoadWeeks(app, req, res) {
  if (req.auth.user) {
    /** @type {{chat:string}} */// @ts-ignore
    const { chat: chatUUID, city: cityUUID } = resolveBody(req.body, {})
    const chat = chatUUID ? await app.db.Chat.findByUUID(chatUUID) : null
    const city = await app.db.MapCity.findByUUID(cityUUID)

    if (city) {
      if (chat && await isAllowedMap(app, req.auth.user, chat)) {
        const weeks = await app.db.MapMarkerAccess.findCityWeeks(city.id, { chat: chat.id })

        return { success: true, weeks }
      } else if (!chat && city && await isAllowedCity(app, req.auth.user, city)) {
        const weeks = await app.db.MapMarkerAccess.findCityWeeks(city.id, { user: req.auth.user.id })

        return { success: true, weeks }
      } else {
        return { success: false }
      }
    } else {
      return { success: false }
    }
  } else {
    return { success: false }
  }
}


/**
 * @typedef Location
 * @property {number} latitude
 * @property {number} longitude
 */
/**
 * @typedef GeoPolygon
 * @property {'Polygon'} type
 * @property {[longitude:number,latitude:number][][]} coordinates
 */
/**
 * @typedef GeoMultiPolygon
 * @property {'MultiPolygon'} type
 * @property {[longitude:number,latitude:number][][][]} coordinates
 */
/**
 * @typedef CityGEO
 * @property {[minLatitude:string,maxLatitude:string,minLongitude:string,maxLongitude:string]} boundingbox
 * @property {GeoPolygon|GeoMultiPolygon} geojson
 * @property {string} lat
 * @property {string} lon
 * @property {string} name
 * @property {{name:string,'name:ru':string,'name:en':string}} namedetails
 * @property {number} osm_id
 */
/**
 * @param {import('../../app.js').MyApp} app
 * @param {Location} location
 * @returns {Promise<import('../database.js').MapCityItem>}
 */
async function getCityGEO(app, { latitude, longitude }) {
  const params = '&zoom=10&addressdetails=0&namedetails=1&polygon_geojson=1&format=jsonv2'
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}${params}`
  const uAgent = `${app.env.name}/${app.env.version} (${app.env.description}) Node.js/${process.version}`
  /** @type {CityGEO} */
  const cityGEO = JSON.parse(await httpRequest(url, {
    method: 'GET',
    headers: {
      'Referer': 'https://ornalogy.ru/',
      'User-Agent': uAgent,
      'Accept-Language': 'en'
    }
  }))
  const [minLatitude, maxLatitude, minLongitude, maxLongitude] = cityGEO.boundingbox
  /** @type {import('../database.js').MapCityItem} */
  const cityItem = {
    osmid: cityGEO.osm_id,
    nameEN: cityGEO.namedetails['name:en'],
    nameRU: cityGEO.namedetails['name:ru'] || cityGEO.namedetails.name || cityGEO.name,
    latitude: Number.parseFloat(cityGEO.lat),
    longitude: Number.parseFloat(cityGEO.lon),
    minLatitude: Number.parseFloat(minLatitude),
    maxLatitude: Number.parseFloat(maxLatitude),
    minLongitude: Number.parseFloat(minLongitude),
    maxLongitude: Number.parseFloat(maxLongitude),
    coordinates: []
  }

  if (cityGEO.geojson.type === 'Polygon') {
    for (const polygonRaw of cityGEO.geojson.coordinates) {
      const polygon = []

      for (const [longitude, latitude] of polygonRaw) {
        polygon.push({ latitude, longitude })
      }

      cityItem.coordinates.push(polygon)
    }
  } else if (cityGEO.geojson.type === 'MultiPolygon') {
    for (const mPolygon of cityGEO.geojson.coordinates) {
      for (const polygonRaw of mPolygon) {
        const polygon = []

        for (const [longitude, latitude] of polygonRaw) {
          polygon.push({ latitude, longitude })
        }

        cityItem.coordinates.push(polygon)
      }
    }
  }

  return cityItem
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {...Location} locations
 * @returns {Promise<import('../database.js').MapCity[]>}
 */
async function getCities(app, ...locations) {
  const citiesIDs = []
  const cities = []

  for (const location of locations) {
    let lCities = await app.db.MapCity.findCities(location)

    if (lCities.length) { // @ts-ignore
      lCities = lCities.filter((/** @type {import('../database.js').MapCityItem} */city) => {
        for (const polygon of city.coordinates) {
          if (isPointInPolygon(location, polygon)) {
            return true
          }
        }

        return false
      })
    }

    if (!lCities.length) {
      const cityItem = await getCityGEO(app, location)
      const city = await app.db.MapCity.addCity(cityItem)

      lCities = [city]
    }

    for (const city of lCities) {
      if (!citiesIDs.includes(city.osmid)) {
        cities.push(city)
        citiesIDs.push(city.osmid)
      }
    }
  }

  return cities
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('../database.js').MapCity[]} cities
 * @param {import('../database.js').MapMarkerItem} marker
 */
async function addMapMarker(app, cities, marker) {
  for (const city of cities) {
    marker.city = city.id
    await app.db.MapMarker.addMarker(marker)
  }
}


export {
  addMapMarkers,
  updateMapMarker,
  removeMapMarker,
  removeMapCity,
  hideMap,
  loadMaps,
  mapLoadCities,
  mapLoadMarkers,
  mapLoadWeeks,
  addMapMarker,
  getCities
}

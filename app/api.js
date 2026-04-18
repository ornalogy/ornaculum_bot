import { fastifyPlugin } from 'fastify-plugin'
import { resolveBody } from './utils.js'
import { applySession, loadSession, updateSession } from './auth.js'
import { addMapMarkers, updateMapMarker, removeMapMarker, removeMapCity, hideMap, loadMaps, mapLoadCities, mapLoadMarkers, mapLoadWeeks } from './api/cartography.js'

const apiHandlers = {
  'check-login': checkLogin,
  'add-map-markers': addMapMarkers,
  'update-map-marker': updateMapMarker,
  'remove-map-marker': removeMapMarker,
  'remove-map-city': removeMapCity,
  'hide-map': hideMap,
  'load-maps': loadMaps,
  'map-load-cities': mapLoadCities,
  'map-load-markers': mapLoadMarkers,
  'map-load-weeks': mapLoadWeeks
}


/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function checkLogin(app, req, res) {
  // @ts-ignore
  const { token } = resolveBody(req.body, {})

  if (token) {
    /** @type {import('./database.js').Session} */
    const session = await app.db.Session.findByToken(token)

    if (session && session.user) {
      session.removeToken()
      applySession(app, req, res, session)
      await loadSession(app, req, session)
    }
  } else if (req.auth.user) {
    // 1 день, 60 * 60 * 24 * 1000
    if (new Date().getTime() - req.auth.session.updatedAt.getTime() > 86400000) {
      updateSession(app, req, res, req.auth.session)
    }
  }

  return {
    login: !!req.auth.user,
    token: req.auth.session.token,
    user: {
      username: req.auth.user?.username,
      firstname: req.auth.user?.firstname,
      lastname: req.auth.user?.lastname
    }
  }
}


/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @returns {Promise<any>}
 */
async function postHandler(app, req, res) {
  // @ts-ignore
  const { api } = req.params

  if (api in apiHandlers) {
    try {
      return await apiHandlers[api](app, req, res)
    } catch (error) {
      app.log.error(error)
      res.code(500)
      res.send('Internal Server Error')
    }
  } else {
    res.code(404)
    res.send('Not Found')
  }

  return res
}


export default fastifyPlugin(
  /**
   * @param {import('../app.js').MyApp} app
   * @param {*} _
   * @param {()=>void} done
   */
  function routes(app, _, done) {
    app.post('/api/:api', (req, res) => // @ts-ignore
      postHandler(app, req, res))

    done()
  }
)

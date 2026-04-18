import { fastifyPlugin } from 'fastify-plugin'
import fastifyCookie from '@fastify/cookie'


/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @param {import('./database.js').Session} session
 */
function applySession(app, req, res, session) {
  session.setUserAgent(req.headers['user-agent'])
  // 365 дней, 60 * 60 * 24 * 365
  res.setCookie('sid', session.uuid, { httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge: 31536000 })
}

/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 * @param {import('./database.js').Session} session
 */
function updateSession(app, req, res, session) {
  session.setUserAgent(req.headers['user-agent'])
  session.prolong()
  // 365 дней, 60 * 60 * 24 * 365
  res.setCookie('sid', session.uuid, { httpOnly: true, sameSite: 'none', secure: true, path: '/', maxAge: 31536000 })
}

/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('./database.js').Session} session
 */
async function loadSession(app, req, session) {
  if (req.auth) await req.auth.session.destroy()
  req.auth = { session }

  if (session.user) {
    req.auth.user = await app.db.User.findByPk(session.user)
  }
}


/**
 * @typedef Auth
 * @property {import('./database.js').Session} session
 * @property {import('./database.js').User} [user]
 */
/**
 * @param {import('../app.js').MyApp} app
 * @param {import('../app.js').MyRequest} req
 * @param {import('fastify').FastifyReply} res
 */
async function verifySession(app, req, res) {
  const { cookies: { sid } } = req
  /** @type {import('./database.js').Session} */
  let session

  if (req.url.startsWith('/telegraf/') || req.url.startsWith('/app/')) {
    return
  }

  if (sid) {
    session = await app.db.Session.findByUUID(sid)
  }
  if (!session) {
    session = await app.db.Session.create()
    applySession(app, req, res, session)
    app.db.Session.clearNotUpdated()
  }
  if (!session.user && !session.token) {
    await session.createToken()
  }

  await loadSession(app, req, session)
}


export default fastifyPlugin(
  /**
   * @param {import('../app.js').MyApp} app
   * @param {*} _
   * @param {()=>void} done
   */
  function routes(app, _, done) {
    app.register(fastifyCookie)
    app.addHook('preHandler', (req, res) => // @ts-ignore
      verifySession(app, req, res))
    done()
  }
)
export { applySession, loadSession, updateSession }

import { fastify } from 'fastify'
import { env } from './app/env.js'

/**
 * @typedef AppDecorations
 * @property {import('./app/env.js').Env} env
 * @property {import('telegraf').Telegraf} bot
 * @property {import('./app/database.js').DB} db
 */
/**
 * @typedef {import('fastify').FastifyInstance & AppDecorations} MyApp
 */
/**
 * @typedef RequestDecorations
 * @property {import('./app/auth.js').Auth} auth
 */
/**
 * @typedef {import('fastify').FastifyRequest & RequestDecorations} MyRequest
 */
const loggerEnv = {
  debug: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: { ignore: 'pid,hostname,reqId,req.remoteAddress,req.remotePort,req.hostname' }
    }
  },
  info: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { ignore: 'pid,hostname,reqId,req.remoteAddress,req.remotePort,req.hostname' }
    }
  },
  error: { level: 'error' }
}
/** @type {MyApp} */// @ts-ignore
const app = fastify({
  logger: env.debugMode ? loggerEnv.debug : (env.production ? loggerEnv.error : loggerEnv.info)
})

app.register(import('./app/env.js'))
app.register(import('./app/database.js'))
app.register(import('./app/auth.js'))
app.register(import('./app/telegram.js'))
app.register(import('./app/api.js'))

app.ready(async err => {
  if (err) {
    console.error(err)
    process.exit(1)
  } else {
    try {
      await app.listen({ host: '0.0.0.0', port: app.env.port })
      app.log.info(`App listening at http://localhost:${app.env.port}`)
    } catch (err) {
      console.error(err)
      process.exit(1)
    }
  }
})

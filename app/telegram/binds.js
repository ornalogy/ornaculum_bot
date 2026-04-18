import { isTopicMessage, isAdmin, replyToSimple } from './utils.js'

/** @type {{[telegramid:number]:number[]}} */
const binds = {}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 * @returns {Promise<number[]>}
 */
async function resolveBinds(app, ctx) {
  if (!(ctx.chat.id in binds)) {
    const chat = await app.db.Chat.findOrCreateFromTelegram(ctx.chat)

    binds[ctx.chat.id] = chat.getBinds()
  }

  return binds[ctx.chat.id]
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 * @param {()=>Promise<void>} next
 * @returns {Promise<void>}
 */
async function validateBindsTopic(app, ctx, next) {
  if (isTopicMessage(ctx)) {
    const cBinds = await resolveBinds(app, ctx)
    const thread = ctx.message.message_thread_id

    if (!cBinds.length || cBinds.includes(thread) || ['/bind', '/unbindall'].includes(ctx.text)) {
      await next()
    }
  } else {
    await next()
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 */
async function bindTopic(app, ctx) {
  if (isTopicMessage(ctx) && await isAdmin(ctx)) {
    const cBinds = binds[ctx.chat.id]
    const thread = ctx.message.message_thread_id

    if (!cBinds.includes(thread)) {
      const chat = await app.db.Chat.findOrCreateFromTelegram(ctx.chat)

      cBinds.push(thread)
      chat.setBinds(cBinds)
      await replyToSimple(ctx, 'Бот привязан к топику')
    }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 */
async function unbindTopic(app, ctx) {
  if (isTopicMessage(ctx) && await isAdmin(ctx)) {
    const cBinds = binds[ctx.chat.id]
    const thread = ctx.message.message_thread_id

    if (cBinds.includes(thread)) {
      const chat = await app.db.Chat.findOrCreateFromTelegram(ctx.chat)
      const sBinds = new Set(cBinds)

      sBinds.delete(thread)
      binds[ctx.chat.id] = Array.from(sBinds)
      chat.setBinds(binds[ctx.chat.id])
      await replyToSimple(ctx, 'Бот отвязан от топика')
    }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 */
async function unbindAll(app, ctx) {
  if (isTopicMessage(ctx) && await isAdmin(ctx)) {
    const cBinds = binds[ctx.chat.id]

    if (cBinds.length) {
      const chat = await app.db.Chat.findOrCreateFromTelegram(ctx.chat)

      binds[ctx.chat.id] = []
      chat.setBinds(binds[ctx.chat.id])
      await replyToSimple(ctx, 'Бот отвязан от всех топиков')
    }
  }
}


export {
  validateBindsTopic,
  bindTopic,
  unbindTopic,
  unbindAll
}

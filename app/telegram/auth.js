import { isPrivateUser, replyToSimple } from './utils.js'

/* global RegExpExecArray */


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & { match: RegExpExecArray }} ctx
 */
async function applyLoginToken(app, ctx) {
  if (isPrivateUser(ctx)) {
    const [, token] = ctx.match
    /** @type {import('../database.js').Session} */
    const session = await app.db.Session.findByToken(token)

    if (session && session.userAgent) {
      const user = await app.db.User.findOrCreateFromTelegram(ctx.from)

      session.removeToken()
      session.setUser(user)
      await replyToSimple(ctx, 'Вы успешно авторизовались!')
    } else {
      await replyToSimple(ctx, 'Неверный код подтверждения!')
    }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context} ctx
 */
async function getLoginToken(app, ctx) {
  if (isPrivateUser(ctx)) {
    const user = await app.db.User.findOrCreateFromTelegram(ctx.from)
    const session = await app.db.Session.findOrCreateByUser(user)
    let msg = 'Ссылка для входа на сайт:\n'

    session.setUser(user)
    await session.createToken()
    if (app.env.production) {
      msg += `https://ornalogy.ru/login/?token=${session.token}\n`
    } else {
      msg += `http://ornalogy.localhost:8080/login/?token=${session.token}\n` +
        `https://ornalogy.loca.lt/login/?token=${session.token}\n`
    }

    msg += 'ВАЖНО! Никому не сообщайте свою ссылку и не используйте чужую, ' +
      'иначе злоумышленники могут получить доступ к вашим данным.'

    await replyToSimple(ctx, msg)
  }
}


export {
  applyLoginToken,
  getLoginToken
}

import { readdir } from 'node:fs/promises'
import { fmt, italic, bold, code, pre } from 'telegraf/format'
import { isPrivateUser, replyToSimple } from './utils.js'
import { env } from '../env.js'

/* global RegExpExecArray */


/**
 * @param {import('telegraf').Context} ctx
 * @returns {boolean}
 */
function isAdmin(ctx) {
  return isPrivateUser(ctx) && env.botAdmins.includes(ctx.from.username)
}


/**
 * @param {import('telegraf').Context} ctx
 */
async function adminHelp(ctx) {
  if (isAdmin(ctx)) {
    await replyToSimple(ctx, fmt`
${bold`Служебная данные`}
  - список чатов ${code`/chatlist`}
  - список пользователей ${code`/userlist`}
  - пользователь ${code`/userinfo @username`}
${bold`Права`}
  - доступные права ${code`/grant scope list`}
  - выдать  ${code`/grant scope feature @username`}
  - забрать ${code`/revoke scope feature @username`}
  , где
    - ${code`scope`} - имя области действия ${code`app`}, ${code`site`}, ${code`telegram`}
    - ${code`feature`} - имя фичи (имя js файла с реализацией)
    - ${code`@username`} - юзернейм из telegram
  `)
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} ctx
 */
async function chatList(app, ctx) {
  if (isAdmin(ctx)) {
    let last = parseInt(ctx.payload)

    if (isNaN(last) && ctx.match) last = parseInt(ctx.match[1])
    if (isNaN(last)) last = 0

    const chats = await app.db.Chat.findAll({
      order: [['updatedAt', 'DESC']],
      offset: last * 25,
      limit: 25
    })
    /** @type {string|import('telegraf').Format.FmtString} */
    let msg = ''

    for (const chat of chats) {
      if (chat.username) {
        msg = fmt`${msg}${chat.updatedAt.toLocaleString('ru')}: ${chat.title} (@${chat.username}) \n`
      } else {
        msg = fmt`${msg}${chat.updatedAt.toLocaleString('ru')}: ${chat.title} ${italic`(private)`}\n`
      }
    }
    if (msg) {
      msg = fmt`${msg}еще: /chatlist_${last + 1}`
    }

    await replyToSimple(ctx, msg || 'Чаты не найдены')
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & {payload?: string, match?: RegExpExecArray}} ctx
 */
async function userList(app, ctx) {
  if (isAdmin(ctx)) {
    let last = parseInt(ctx.payload)

    if (isNaN(last) && ctx.match) last = parseInt(ctx.match[1])
    if (isNaN(last)) last = 0

    const users = await app.db.User.findAll({
      order: [['updatedAt', 'DESC']],
      offset: last * 25,
      limit: 25
    })
    let msg = ''

    for (const user of users) {
      msg += `${user.updatedAt.toLocaleString('ru')}: @${user.username} /userinfo_${user.username}`
      msg += '\n'
    }
    if (msg) {
      msg += `еще: /userlist_${last + 1}`
    }

    await replyToSimple(ctx, msg || 'Пользователи не найдены')
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & { match: RegExpExecArray }} ctx
 */
async function userInfo(app, ctx) {
  if (isAdmin(ctx)) {
    const [, username] = ctx.match
    const user = await app.db.User.findFromTelegram({ username })

    if (user) {
      await replyToSimple(ctx, pre('JSON')`${JSON.stringify(user, null, '  ')}`)
    } else {
      await replyToSimple(ctx, 'Пользователь не зарегистрирован')
    }
  }
}


/**
 * @param {string} scope
 * @returns {Promise<string[]>}
 */
async function readFeatures(scope) {
  try {
    return await readdir(`./feature/${scope}/config`)
  } catch (error) {
    console.error(error)

    return []
  }
}


/**
 * @param {string} scope
 * @param {string} feature
 * @returns {Promise<boolean>}
 */
async function isValidFeature(scope, feature) {
  switch (scope) {
    case 'app':
    case 'site':
    case 'telegram':
      return (await readFeatures(scope)).includes(`${feature}.js`)
    default:
      return false
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & { match: RegExpExecArray }} ctx
 */
async function grantList(app, ctx) {
  const [, scope] = ctx.match
  /** @type {string[]} */
  let list = []

  switch (scope) {
    case 'app':
    case 'site':
    case 'telegram':
      list = await readFeatures(scope)
      break
  }

  if (list.length) {
    /** @type {string|import('telegraf').Format.FmtString} */
    let msg = ''

    list = list.map(i => i.replaceAll('.js', ''))
    for (const item of list) {
      msg = fmt`${msg}${msg ? ', ' : ''}${code(item)}`
    }
    await replyToSimple(ctx, msg)
  } else {
    await replyToSimple(ctx, 'Список прав пустой')
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & { match: RegExpExecArray }} ctx
 */
async function grantAccess(app, ctx) {
  const [, scope, feature, username] = ctx.match

  if (isAdmin(ctx)) {
    if (await isValidFeature(scope, feature)) {
      const user = await app.db.User.findFromTelegram({ username })

      if (user) {
        if (user.grantAccess(scope, feature)) {
          await replyToSimple(ctx, 'Права предоставлены')
        } else {
          await replyToSimple(ctx, 'Права уже предоставлены ранее')
        }
      } else {
        await replyToSimple(ctx, 'Пользователь не зарегистрирован')
      }
    } else {
      await replyToSimple(ctx, 'Указаны несуществующие права')
    }
  }
}


/**
 * @param {import('../../app.js').MyApp} app
 * @param {import('telegraf').Context & { match: RegExpExecArray }} ctx
 */
async function revokeAccess(app, ctx) {
  if (isAdmin(ctx)) {
    const [, scope, feature, username] = ctx.match
    const user = await app.db.User.findFromTelegram({ username })

    if (user) {
      if (user.revokeAccess(scope, feature)) {
        await replyToSimple(ctx, 'Права отозваны')
      } else {
        await replyToSimple(ctx, 'Права не были предоставлены')
      }
    } else {
      await replyToSimple(ctx, 'Пользователь не зарегистрирован')
    }
  }
}


export {
  adminHelp,
  chatList,
  userList,
  userInfo,
  grantList,
  grantAccess,
  revokeAccess
}

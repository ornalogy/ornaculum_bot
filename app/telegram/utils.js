/**
 * @param {import('telegraf').Context} ctx
 * @param {()=>Promise<void>} next
 * @returns {Promise<void>}
 */
async function validateMessageType(ctx, next) {
  const noBot = !ctx.from?.is_bot || ctx.from?.username === 'GroupAnonymousBot'

  if (ctx.from && noBot && ctx.message?.date &&
    (new Date().getTime() / 1000 - ctx.message.date) < 60) {
    await next()
  }
  if (ctx.callbackQuery && 'reply_to_message' in ctx.callbackQuery.message) {
    if (ctx.callbackQuery.from.id === ctx.callbackQuery.message.reply_to_message.from.id) {
      await next()
    } else {
      await ctx.answerCbQuery('403 Forbidden\nYou are not request owner')
    }
  }
}


/**
 * @param {import('telegraf').Context} ctx
 * @returns {boolean}
 */
function isPrivateUser(ctx) {
  return ctx.from && ctx.from.username &&
    ctx.chat && ctx.chat.type === 'private' &&
    ctx.chat.username === ctx.from.username
}


/**
 * @param {import('telegraf').Context} ctx
 * @returns {boolean}
 */
function isAnyChat(ctx) {
  return ctx.chat && ['group', 'supergroup'].includes(ctx.chat.type)
}


/**
 * @param {import('telegraf').Context} ctx
 * @returns {boolean}
 */
function isTopicMessage(ctx) {
  return ctx.chat.type === 'supergroup' && ctx.chat.is_forum && ctx.message.is_topic_message
}


/**
 * @param {import('telegraf').Context} ctx
 * @returns {Promise<boolean>}
 */
async function isAdmin(ctx) {
  const user = await ctx.getChatMember(ctx.message.from.id)
  const hasRole = ['creator', 'administrator'].includes(user.status)

  return isAnyChat(ctx) && (hasRole || ctx.message.from.username === 'GroupAnonymousBot')
}


/**
 * @param {import('telegraf').Context} context
 * @param {string | import('telegraf').Format.FmtString} text
 * @param {import('telegraf').Types.ExtraReplyMessage} [extra]
 * @returns {Promise<import('telegraf/types').Message.TextMessage|void>}
 */
async function replyToSimple(context, text, extra = {}) {
  const replyID = context.callbackQuery && 'text' in context.callbackQuery.message
    ? context.callbackQuery.message.reply_to_message.message_id
    : context.message.message_id
  /** @type {import('telegraf/types').Message.TextMessage|void} */// @ts-ignore
  const message = await context
    .reply(text, Object.assign({ disable_web_page_preview: true, reply_to_message_id: replyID }, extra))
    .catch(error => {
      switch (error.message) {
        case '400: Bad Request: TOPIC_DELETED':
        case '400: Bad Request: message to be replied not found':
        case '400: Bad Request: not enough rights to send text messages to the chat':
          break
        default:
          console.error(error)
      }

      return false
    })

  return message
}


export {
  validateMessageType,
  isPrivateUser,
  isAnyChat,
  isTopicMessage,
  isAdmin,
  replyToSimple
}

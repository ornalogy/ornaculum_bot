import { randomUUID } from 'node:crypto'
import { fastifyPlugin } from 'fastify-plugin'
import { Telegraf } from 'telegraf'
import { validateMessageType } from './telegram/utils.js'
import { validateBindsTopic, bindTopic, unbindTopic, unbindAll } from './telegram/binds.js'
import { sendMessage } from './telegram/messages.js'
import { CarlEngine } from './telegram/engine/carl.js'
import { SearchEngine } from './telegram/engine/search.js'
import { PinsEngine } from './telegram/engine/pins.js'
import { CartographyEngine } from './telegram/engine/cartography.js'
import { applyLoginToken, getLoginToken } from './telegram/auth.js'
import {
  adminHelp, chatList, userList, userInfo,
  grantList, grantAccess, revokeAccess
} from './telegram/admin.js'


export default fastifyPlugin(
  /**
   * @param {import('../app.js').MyApp} app
   */
  async function routes(app) {
    if (app.env.botToken) {
      const bot = new Telegraf(app.env.botToken)
      const botSecretPath = randomUUID()

      app.decorate('bot', bot)

      // https://github.com/telegraf/telegraf/blob/v4/release-notes/4.16.0.md#working-with-reactions
      // https://core.telegram.org/bots/api#messagereactionupdated
      // allowedUpdates: ['message_reaction'] в setWebhook и launch
      // bot.on('message_reaction', async (ctx) => {
      //   debugger
      // })

      // Не работаем с ботами и теми у кого не заполен логин в Telegram
      bot.use((ctx, next) => validateMessageType(ctx, next))
      // Проверка привязки бота к топикам
      bot.use((ctx, next) => validateBindsTopic(app, ctx, next))

      // Привязка бота к топикам
      bot.command('bind', ctx => bindTopic(app, ctx))
      bot.command('unbind', ctx => unbindTopic(app, ctx))
      bot.command('unbindall', ctx => unbindAll(app, ctx))

      // Справочные команды
      bot.command('start', ctx => sendMessage(ctx, 'help'))
      bot.command('help', ctx => sendMessage(ctx, 'help'))
      bot.command('search', ctx => sendMessage(ctx, 'search'))
      bot.command('pins', ctx => sendMessage(ctx, 'pins'))
      bot.command('maps', ctx => sendMessage(ctx, 'maps'))

      // Команды Карла
      bot.hears(CarlEngine.hears, (ctx, next) => CarlEngine.attach(app, ctx, next))

      // Поисковый бот
      bot.hears(SearchEngine.hears, (ctx, next) => SearchEngine.attach(app, ctx, next))
      bot.command('top10search', ctx => SearchEngine.top(app, ctx, 10))

      // Закрепленные сообщения
      bot.hears(PinsEngine.hears, (ctx, next) => PinsEngine.attach(app, ctx, next))
      bot.command('pin', ctx => PinsEngine.addPin(app, ctx))
      bot.hears(/\/pin_(\d+)/, ctx => PinsEngine.pinInfo(app, ctx))
      bot.command('pinlist', ctx => PinsEngine.pinList(app, ctx))
      bot.hears(/\/pinlist_(\d+)/, ctx => PinsEngine.pinList(app, ctx))
      bot.hears(/\/delpin_(\d+)/, ctx => PinsEngine.delPin(app, ctx))

      // Картография
      bot.hears(CartographyEngine.hears, (ctx, next) => CartographyEngine.attach(app, ctx, next))
      bot.action(CartographyEngine.callbacks, (ctx, next) => CartographyEngine.attach(app, ctx, next))

      // Вход на ornalogy.ru
      bot.hears(/\/login (\w+)/, ctx => applyLoginToken(app, ctx))
      bot.command('login', ctx => getLoginToken(app, ctx))

      // Администрирование
      bot.command('admin', ctx => adminHelp(ctx))
      bot.command('chatlist', ctx => chatList(app, ctx))
      bot.hears(/\/chatlist_(\d+)/, ctx => chatList(app, ctx))
      bot.command('userlist', ctx => userList(app, ctx))
      bot.hears(/\/userlist_(\d+)/, ctx => userList(app, ctx))
      bot.hears(/\/userinfo @(\w+)/, ctx => userInfo(app, ctx))
      bot.hears(/\/userinfo_(\w+)/, ctx => userInfo(app, ctx))
      // TODO: Настройка прав для бота и сайта с картой
      bot.hears(/\/grant (\w+) list/, ctx => grantList(app, ctx))
      bot.hears(/\/grant (\w+) (\w+) @(\w+)/, ctx => grantAccess(app, ctx))
      bot.hears(/\/revoke (\w+) (\w+) @(\w+)/, ctx => revokeAccess(app, ctx))

      // tests
      // bot.command('replay', ctx => {
      //   if (ctx.payload) {
      //     ctx.sendMessage(ctx.payload)
      //   }
      // })
      // bot.command('repair', ctx => {
      //   ctx.sendMessage("I'm alive!")
      //   global.ctx = ctx
      // })

      // @ts-ignore
      app.post(`/telegraf/${botSecretPath}`, (req, rep) => { // @ts-ignore
        bot.handleUpdate(req.body, rep.raw)
      })
      if (app.env.production && app.env.botHost) {
        bot.telegram.setWebhook(`https://${app.env.botHost}/telegraf/${botSecretPath}`)
      } else if (process.env.LOCAL_TUNNEL === 'true') {
        app.log.info('Connecting to localtunnel...')

        const localtunnel = (await import('localtunnel')).default
        const tunnel = await localtunnel({ port: app.env.port })

        app.log.info(`Telegraf: ${tunnel.url}/telegraf/${botSecretPath}`)
        bot.telegram.setWebhook(`${tunnel.url}/telegraf/${botSecretPath}`)
      } else {
        app.log.info('bot launch...')
        bot.launch()
      }
    }
  }
)

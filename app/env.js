import { existsSync, readFileSync } from 'node:fs'
import { fastifyPlugin } from 'fastify-plugin'

const localEnvFile = './.local-env.json'
/**
 * @typedef Env
 * @property {string} name Имя приложения
 * @property {string} version Версия приложения
 * @property {string} description Описание приложения
 * @property {boolean} production Режим для продакшена
 * @property {string} botHost Домен на котором работает бот в production режиме
 * @property {string[]} botAdmins Список админов бота, username из ТГ
 * @property {string} botToken Токен доступа Телеграм бота
 * @property {boolean} debugMode Режим отладочного логирования
 * @property {number} port Порт запуска сервиса, по умолчанию 3000
 * @property {string} dataBase URI подключения к БД
 * @property {boolean} syncDataBase Определяет необходимость синхронизации структуры данных БД
 */
/**
 * Настройки приложения, могут быть переопределены в .local-env.json
 * @type {Env}
 */
const env = {
  // Параметры для User-Agent из package.json для openstreetmap.org
  name: 'app',
  version: '0.0',
  description: '',
  // Параметры запуска
  production: process.env.NODE_ENV === 'production',
  debugMode: process.env.DEBUG_MODE === 'true',
  port: 'PORT' in process.env ? Number(process.env.PORT) : 8082,
  // Параметры подключения бота ТГ
  botHost: 'app.ornalogy.ru',
  botToken: '',
  botAdmins: [],
  // Параметры подключения к БД
  dataBase: process.env.DATA_BASE || 'sqlite:app.ornalogy.ru.sqlite',
  syncDataBase: process.env.SYNC_DATA_BASE === 'true'
}

if (existsSync(localEnvFile)) {
  const localEnv = JSON.parse(readFileSync(localEnvFile, 'utf-8'))

  Object.assign(env, localEnv)
}
if (existsSync('./package.json')) {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

  env.name = pkg.name
  env.version = pkg.version
  env.description = pkg.description

  if (env.debugMode) {
    env.version += '-debug'
  } else if (!env.production) {
    env.version += '-test'
  }
}


export { env }
export default fastifyPlugin(
  /**
   * @param {import('../app.js').MyApp} app
   * @param {*} _
   * @param {()=>void} done
   */
  function routes(app, _, done) {
    app.decorate('env', env)
    done()
  }
)

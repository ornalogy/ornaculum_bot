import { fmt, bold } from 'telegraf/format'
import { Engine } from './_engine.js'
import * as ornalogyPins from './pins.js'
import * as ornaGuide from '../integrate/orna.guide.js'
import * as playOrna from '../integrate/playorna.com.js'
// Не работает, выдает "403 Forbidden"
// import * as ornaLegends from '../integrate/ornalegends.com.js'
import * as ornarium from '../integrate/ornarium.ru.js'

/**
 * @typedef SearchContext
 * @property {string} name
 * @property {boolean} [default]
 * @property {boolean} [ifPreviousEmpty]
 * @property {boolean} [showAllResult]
 * @property {RegExp} [keywords]
 * @property {object} [props]
 */
/**
 * @typedef SearchResult
 * @property {string} message
 * @property {string|import('telegraf').Format.FmtString} [description]
 * @property {Array<string>} urls
 * @property {Array<string>} [haveMore]
 * @property {boolean} [writeStatistic]
 */
/**
 * @typedef SearchArgs
 * @property {SearchEngine} engine
 * @property {SearchContext} context
 * @property {string[]} words
 */
/**
 * @typedef SearchService
 * @property {string} searchName
 * @property {RegExp} [searchWordsFilter]
 * @property {Array<SearchContext>} searchStages
 * @property {(args:SearchArgs) => Promise<Array<SearchResult>>} search
 */

export class SearchEngine extends Engine {

  static hears = [
    /^\/(search)_([^@]+)(@.+)?/i,
    /^(\?)+ *(.*)/,
    /^(карл[^ ]*)+ *(.*)/i,
    /^(carl[^ ]*)+ *(.*)/i
  ]

  static resultsLimit = 3
  static displayLimit = 7

  /**
   * @param {import('../../../app.js').MyApp} app
   * @param {import('telegraf').Context} context
   * @param {number} limit
   */
  static async top(app, context, limit) {
    const results = await app.db.SearchStatistic.topHistory(limit)
    let msg = ''

    for (const result of results) {
      msg += `\n${result.message} (${result.counter})\n${Array.from(new Set(result.urls)).join('\n')}\n`
    }

    if (msg) {
      await this.replyTo(context, msg.trim())
    } else {
      await this.replyTo(context, 'Не удалось ничего найти')
    }
  }

  /** @type {string[]} */
  words = null
  /** @type {Array<SearchService>} */
  services = [ornalogyPins, playOrna, ornaGuide, /* ornaLegends, */ ornarium]
  /** @type {Set<RegExp>} */
  keywords = [
    ...ornalogyPins.searchStages,
    ...playOrna.searchStages,
    ...ornaGuide.searchStages,
    // ...ornaLegends.searchStages,
    ...ornarium.searchStages
  ].reduce((prev, stage) => stage.keywords ? prev.add(stage.keywords) : prev, new Set())

  /** @type {Array<SearchResult>} */
  results = []
  /** @type {number} */
  limit = null
  /** @type {number} */
  display = null

  async execute({ withoutKeywords } = { withoutKeywords: false }) {
    this.limit = SearchEngine.resultsLimit
    this.display = SearchEngine.displayLimit
    this.words = this.text
      .trim().split(/[\s_]+/)
      .filter(s => s.length > 1)

    if (!this.words.length) {
      return
    }

    let isKeywords = false

    if (this.words.length && !withoutKeywords) {
      for (const keywords of this.keywords) {
        if (keywords.test(this.words[0])) {
          isKeywords = true
          break
        }
      }
    }

    let previousEmpty = false

    for (const service of this.services) {
      let serviceAvailable = true
      const wordsSet = new Set(this.words)
      let useKeywords = false
      let searchStages = withoutKeywords
        ? []
        : service.searchStages
          .reduce((prev, stage) => {
            for (const word of wordsSet) {
              if (stage.keywords && stage.keywords.test(word)) {
                wordsSet.delete(word)
                prev.push(stage)
                useKeywords = true
                break
              }
            }

            return prev
          }, [])
      let words = Array.from(wordsSet)

      if (isKeywords && !useKeywords) {
        continue
      }

      if (!searchStages.length) {
        searchStages = service.searchStages
          .reduce((prev, stage) => {
            if (stage.default && (!stage.ifPreviousEmpty || previousEmpty)) prev.push(stage)

            return prev
          }, [])
      }

      if (service.searchWordsFilter) {
        words = words.filter(w => {
          return service.searchWordsFilter.test(w)
        })
        if (!words.length && !useKeywords) continue
      }

      for (const stage of searchStages) {
        try {
          const results = await service.search({ engine: this, context: stage, words })

          this.results.push(...results)
        } catch (error) {
          console.warn(`SearchEngine Error: the search failed on '${service.searchName}'`)
          console.warn('* Stage:', stage)
          console.warn('* Words:', words)
          console.warn(error.message)
          serviceAvailable = false
          await this.replyTo(`${service.searchName}[${stage.name}]: ${error.message}`)
        }
        if (stage.showAllResult) this.display = null
        if (!serviceAvailable) break
        if (this.results.length >= this.limit) break
      }

      previousEmpty = !this.results.length

      if (this.results.length >= this.limit) break
    }

    if (!this.results.length) {
      if (isKeywords) {
        return await this.execute({ withoutKeywords: true })
      }
      await this.replyTo('Не удалось ничего найти')
    } else {
      const msgMap = {}
      const message = (this.display ? this.results.slice(0, this.display) : this.results)
        .reduce((pre, cur) => {
          if (cur.message in msgMap && msgMap[cur.message].urls) {
            if (cur.urls) {
              msgMap[cur.message].urls.push(...cur.urls)
              msgMap[cur.message].urls.sort()
            }
          } else {
            msgMap[cur.message] = cur
            pre.push(cur)
          }

          return pre
        }, [])
        .reduce((pre, cur) => {
          let msg = pre ? fmt`\n${bold(cur.message)}` : bold(cur.message)

          if (cur.description) {
            msg = fmt`${msg}\n${cur.description}`
          }

          if (cur.urls) {
            msg = fmt`${msg}\n${Array.from(new Set(cur.urls)).join('\n')}`
          }

          if (cur.haveMore && cur.haveMore.length > 0) {
            msg = fmt`${msg}\nещё: ${cur.haveMore.join(', ')}`
          }

          return fmt`${pre}\n${msg}`
        }, '')

      this.results = []
      for (const key in msgMap) {
        this.results.push(msgMap[key])
      }

      await this.replyTo(message)
    }

    await this.writeStatistic()
  }

  async writeStatistic() {
    const history = await this.app.db.SearchHistory.writeHistory(this.results)
    const user = await this.app.db.User.findOrCreateFromTelegram(this.context.from)
    /** @type {import('../../database.js').Chat} */
    let chat

    if (this.context.from.id !== this.context.chat.id) {
      chat = await this.app.db.Chat.findOrCreateFromTelegram(this.context.chat)
    }
    if (user) {
      await this.app.db.SearchStatistic.writeStatistics(chat?.id, user.id, history.map(i => i.id))
    }
  }

}

import { fmt, underline } from 'telegraf/format'
import { Parser } from 'htmlparser2'
import { httpRequest } from '../../utils.js'

/**
 * @typedef PlayornaEntry
 * @property { string } href
 * @property { string } tier
 * @property { string } name
 */
class PlayornaParser extends Parser {

  /** @type {boolean} */
  codexEntry
  /** @type {PlayornaEntry} */
  entry
  /** @type {PlayornaEntry[]} */
  entries

}

/**
 * @typedef PlayornaEventEntry
 * @property { string } title
 * @property { string } description
 * @property { string } period
 */
class PlayornaEventParser extends Parser {

  /** @type {boolean} */
  inEventDetails
  /** @type {boolean} */
  inTitle
  /** @type {number} */
  divCount
  /** @type {string} */
  lastDivText
  /** @type {PlayornaEventEntry} */
  entry
  /** @type {PlayornaEventEntry[]} */
  entries

}

const apiURL = 'https://playorna.com/codex'
const eventsURL = 'https://playorna.com/calendar/'
const searchName = 'PlayOrna Search API'
const searchWordsFilter = /^[а-яё]+$|^\w+$/i
/** @type {Array<import('../engine/search.js').SearchContext>} */
const searchStages = [
  {
    name: 'all',
    default: true,
    props: { uri: '/search/' }
  },
  {
    name: 'item',
    keywords: /^item|^thing|^итем|^айтем|^предмет|^вещ/i,
    props: { uri: '/items/' }
  },
  {
    name: 'monster',
    keywords: /^mob|^monster|^моб|^монстр/i,
    props: { uri: '/monsters/' }
  },
  {
    name: 'boss',
    keywords: /^boss|^босс/i,
    props: { uri: '/bosses/' }
  },
  {
    name: 'raid',
    keywords: /^raid|^rb|^рейд|^рб/i,
    props: { uri: '/raids/' }
  },
  {
    name: 'pet',
    keywords: /^pet|^follow|^пет|^питом/i,
    props: { uri: '/followers/' }
  },
  {
    name: 'skill',
    keywords: /^skill|^spell|^скил|^спел|^навык|^умени|^закл/i,
    props: { uri: '/spells/' }
  },
  {
    name: 'class',
    keywords: /^class|^класс/i,
    props: { uri: '/classes/' }
  },
  {
    name: 'events',
    showAllResult: true,
    keywords: /^event|^calendar|^ивент|^евент|^эвент|^событи/i,
    props: { custom: 'events' }
  }
]
const parser = new PlayornaParser({
  onreset() {
    parser.entries = []
    parser.codexEntry = false
  },
  onopentag(name, attributes) {
    if (name === 'a' && attributes.class === 'codex-entries-entry') {
      parser.codexEntry = true
      parser.entry = { href: attributes.href, tier: '', name: '' }
    }
  },
  ontext(text) {
    if (parser.codexEntry) {
      text = text.trim()
      if (text) {
        if (!parser.entry.name) {
          parser.entry.name = text
        } else if (!isNaN(Number(text))) {
          parser.entry.tier = text
        }
      }
    }
  },
  onclosetag(tagname) {
    if (tagname === 'a' && parser.codexEntry) {
      parser.codexEntry = false
      parser.entries.push(parser.entry)
    }
  },
  onend() {
    parser.entries = null
  }
})
const eventParser = new PlayornaEventParser({
  onreset() {
    eventParser.entries = []
    eventParser.inEventDetails = false
    eventParser.inTitle = false
    eventParser.divCount = 0
  },
  onopentag(name, attributes) {
    if (name === 'div' && attributes.class && attributes.class.includes('world-event-details')) {
      eventParser.inEventDetails = true
    } else if (eventParser.inEventDetails && name === 'h3') {
      eventParser.inTitle = true
    } else if (eventParser.inEventDetails && name === 'div') {
      eventParser.divCount++
    }
  },
  ontext(text) {
    if (eventParser.inEventDetails && eventParser.inTitle) {
      eventParser.entry = { title: text.trim() || 'Без названия', description: '', period: '' }
    } else if (eventParser.inEventDetails && eventParser.divCount === 1 && !eventParser.entry.description) {
      eventParser.entry.description = text.trim()
    } else if (eventParser.inEventDetails && eventParser.divCount === 1) {
      eventParser.lastDivText = text.trim()
    }
  },
  onclosetag(name) {
    if (name === 'h3' && eventParser.inEventDetails && eventParser.inTitle) {
      eventParser.inTitle = false
    } else if (eventParser.inEventDetails && name === 'div') {
      eventParser.divCount--
      if (eventParser.divCount < 0) {
        eventParser.entry.period = eventParser.lastDivText
        eventParser.entries.push(eventParser.entry)
        eventParser.inEventDetails = false
        eventParser.divCount = 0
      }
    }
  },
  onend() {
    eventParser.entries = null
  }
})


/**
 * @param {string} raw
 * @returns {PlayornaEntry[]}
 */
function pareseEntries(raw) {
  parser.reset()
  parser.write(raw)

  const { entries } = parser

  parser.end()

  return entries
}


/**
 * @param {string} raw
 * @returns {PlayornaEventEntry[]}
 */
function pareseEventEntries(raw) {
  eventParser.reset()
  eventParser.write(raw)

  const { entries } = eventParser

  eventParser.end()

  return entries
}


/**
 * @param {import('../engine/search.js').SearchContext} sctx
 * @param {string} params
 * @param {string} lang
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function withOrnaLang(sctx, params, lang) {
  const url = `${apiURL}${sctx.props.uri}?q=${params}`
  const response = pareseEntries(await httpRequest(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'text/html',
      'Cookie': `ornalang=${lang}`
    }
  }))
  /** @type {Array<import('../engine/search.js').SearchResult>} */
  const results = []

  for (const raw of response) {
    const name = raw.name.replace('\u0301', '')
    const urls = [`https://playorna.com${raw.href}`]
    let haveMore

    if (lang !== 'en') {
      const uriName = raw.href
        .replace(/\/codex\/\w+\/(.*)\//, '$1')
        .replace(/-/g, '_')

      haveMore = [`/search_${uriName}`]
    }

    results.push({ message: `★${raw.tier} ${name}`, urls, haveMore })
  }

  return results
}


/**
 * @param {import('../engine/search.js').SearchArgs} args
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function searchEvents({ engine, words }) {
  const lang = (/^[а-яё ]+$/i).test(engine.text) ? 'ru' : 'en'
  const response = await httpRequest(eventsURL, {
    method: 'GET',
    headers: {
      'Content-Type': 'text/html',
      'Cookie': `ornalang=${lang}`
    }
  })
  const events = pareseEventEntries(response)
  /** @type {Array<import('../engine/search.js').SearchResult>} */
  const results = []

  for (const event of events) {
    let mathed = !words.length

    for (const word of words) {
      const lWord = word.toLocaleLowerCase()
      const lText = event.title.toLocaleLowerCase() + event.description.toLocaleLowerCase()

      if (lText.includes(lWord)) {
        mathed = true
        break
      }
    }

    if (mathed) {
      results.push({
        message: event.title,
        description: fmt`${event.description}\n${underline(event.period)}`,
        urls: null
      })
    }
  }

  if (!results.length) {
    results.push({ message: 'События не найды', urls: null })
  }

  results.push({
    message: lang === 'ru' ? 'Календарь событий' : 'Event Calendar',
    urls: [eventsURL]
  })

  return results
}


/**
 * @param {import('../engine/search.js').SearchArgs} args
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function search({ engine, words, context }) {
  const results = []

  if (context.props.custom === 'events') {
    return await searchEvents({ engine, words, context })
  } else {
    const ruWords = words.filter(w => {
      return (/^[а-яё]+$/i).test(w)
    })
    const enWords = words.filter(w => {
      return (/^\w+$/i).test(w)
    })

    if (ruWords.length) {
      results.push(...(await withOrnaLang(context, ruWords.join('+'), 'ru')))
    }
    if (enWords.length) {
      results.push(...(await withOrnaLang(context, enWords.join('+'), 'en')))
    }
  }

  return results
}


export {
  searchName,
  searchWordsFilter,
  searchStages,
  search
}

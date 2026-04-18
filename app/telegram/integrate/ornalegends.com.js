import { Parser } from 'htmlparser2'
import { httpRequest } from '../../utils.js'

/**
 * @typedef OrnalegendsEntry
 * @property { string } href
 * @property { string } title
 */
class OrnalegendsParser extends Parser {

  /** @type {boolean} */
  inSearchList
  /** @type {boolean} */
  inLink
  /** @type {OrnalegendsEntry} */
  entry
  /** @type {OrnalegendsEntry[]} */
  entries

}

const apiURL = 'https://www.ornalegends.com'
const searchName = 'ornaLegends Search API'
const searchWordsFilter = /^\w+$/i
/** @type {Array<import('../engine/search.js').SearchContext>} */
const searchStages = [
  {
    name: 'all',
    default: true,
    ifPreviousEmpty: true
  },
  {
    name: 'guide',
    keywords: /^guide|^manual|^гайд|^справ/i
  }
]
const parser = new OrnalegendsParser({
  onreset() {
    parser.entries = []
    parser.inSearchList = false
  },
  onopentag(name, attributes) {
    if (name === 'ol' && attributes.id === 'wsite-search-list') {
      parser.inSearchList = true
    } else if (parser.inSearchList && name === 'a') {
      parser.inLink = true
      parser.entry = { href: attributes.href, title: '' }
    }
  },
  ontext(text) {
    if (parser.inSearchList && parser.inLink) {
      text = text.trim()
      parser.entry.title += text
    }
  },
  onclosetag(name) {
    if (name === 'ol' && parser.inSearchList) {
      parser.inSearchList = false
    } else if (name === 'a' && parser.inLink) {
      parser.entries.push(parser.entry)
      parser.inLink = false
    }
  },
  onend() {
    parser.entries = null
  }
})


/**
 * @param {string} raw
 * @returns {OrnalegendsEntry[]}
 */
function pareseEntries(raw) {
  parser.reset()
  parser.write(raw)

  const { entries } = parser

  parser.end()

  return entries
}


/**
 * @param {import('../engine/search.js').SearchArgs} args
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function search({ words }) {
  const url = `${apiURL}/apps/search?q=${words.join('+')}`
  const response = pareseEntries(await httpRequest(url, {
    method: 'GET',
    headers: { 'Content-Type': 'text/html' }
  }))
  /** @type {Array<import('../engine/search.js').SearchResult>} */
  const results = []

  for (const raw of response) {
    const url = raw.href.startsWith('/') ? `${apiURL}${raw.href}` : raw.href

    results.push({ message: raw.title, urls: [url] })
  }

  return results
}


export {
  searchName,
  searchWordsFilter,
  searchStages,
  search
}

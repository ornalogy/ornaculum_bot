import { Parser } from 'htmlparser2'
import { httpRequest } from '../../utils.js'

/**
 * @typedef OrnariumEntry
 * @property { string } href
 * @property { string } title
 */
class OrnariumParser extends Parser {

  /** @type {boolean} */
  inArticle
  /** @type {boolean} */
  inTitle
  /** @type {OrnariumEntry} */
  entry
  /** @type {OrnariumEntry[]} */
  entries

}

const apiURL = 'https://ornarium.ru/'
const searchName = 'Орнариум Search API'
const searchWordsFilter = /^[а-яё]+$|^\w+$/i
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
const parser = new OrnariumParser({
  onreset() {
    parser.entries = []
    parser.inArticle = false
    parser.inTitle = false
  },
  onopentag(name, attributes) {
    if (name === 'article' && attributes.class.includes('post')) {
      parser.inArticle = true
    } else if (parser.inArticle && name === 'h2' && attributes.class.includes('entry-title')) {
      parser.inTitle = true
    } else if (parser.inArticle && parser.inTitle && name === 'a') {
      parser.entry = { href: attributes.href, title: '' }
    }
  },
  ontext(text) {
    if (parser.inArticle && parser.inTitle) {
      text = text.trim()
      if (text) {
        parser.entry.title = text
      }
    }
  },
  onclosetag(name) {
    if (name === 'article' && parser.inArticle) {
      parser.inArticle = false
      parser.entries.push(parser.entry)
    } else if (name === 'h2' && parser.inTitle) {
      parser.inTitle = false
    }
  },
  onend() {
    parser.entries = null
  }
})


/**
 * @param {string} raw
 * @returns {OrnariumEntry[]}
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
  const url = `${apiURL}?s=${words.join('+')}`
  const response = pareseEntries(await httpRequest(url, {
    method: 'GET',
    headers: { 'Content-Type': 'text/html' }
  }))
  /** @type {Array<import('../engine/search.js').SearchResult>} */
  const results = []

  for (const raw of response) {
    results.push({ message: raw.title, urls: [raw.href] })
  }

  return results
}


export {
  searchName,
  searchWordsFilter,
  searchStages,
  search
}

import { Buffer } from 'node:buffer'
import { httpRequest } from '../../utils.js'

const apiURL = 'https://orna.guide/api/v1/'
const searchName = 'Orna.Guide Search API'
const searchWordsFilter = /^\w+$/i
/** @type {Array<import('../engine/search.js').SearchContext>} */
const searchStages = [
  {
    name: 'item',
    default: true,
    keywords: /^item|^thing/i,
    props: { api: 'item', uri: 'items' }
  },
  {
    name: 'monster',
    default: true,
    keywords: /^mob|^monster/i,
    props: { api: 'monster', uri: 'monsters' }
  },
  {
    name: 'boss',
    keywords: /^boss/i,
    props: { api: 'monster', uri: 'monsters', filter: { boss: true } }
  },
  {
    name: 'raid',
    keywords: /^raid|^rb/i,
    props: { api: 'monster', uri: 'monsters', filter: { spawn: 'Raid' } }
  },
  {
    name: 'pet',
    default: true,
    keywords: /^pet|^follow/i,
    props: { api: 'pet', uri: 'pets' }
  },
  {
    name: 'skill',
    default: true,
    keywords: /^skill|^spell/i,
    props: { api: 'skill', uri: 'skills' }
  },
  {
    name: 'class',
    keywords: /^class/i,
    props: { api: 'class', uri: 'classes' }
  },
  {
    name: 'specialization',
    keywords: /^spec|^specialization/i,
    props: { api: 'specialization', uri: 'specializations' }
  },
  {
    name: 'npc',
    keywords: /^npc/i,
    props: { api: 'npc', uri: 'npcs' }
  },
  {
    name: 'quest',
    keywords: /^quest/i,
    props: { api: 'quest', uri: 'quests' }
  },
  {
    name: 'achievement',
    keywords: /^achi/i,
    props: { api: 'achievement', uri: 'achievements' }
  }
]

/**
 * @param {import('../engine/search.js').SearchArgs} args
 * @returns {Promise<Array<import('../engine/search.js').SearchResult>>}
 */
async function search({ words, context }) {
  if (!words.length) return []

  const params = {
    icontains: words.map(i => Object.assign({ name: i }, context.props.filter || {})),
    order: ['-tier', 'name']
  }
  const data = JSON.stringify(params)
  const response = JSON.parse(await httpRequest(apiURL + context.props.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data))
  /** @type {Array<import('../engine/search.js').SearchResult>} */
  const results = []

  for (const raw of response) {
    const urls = [`https://orna.guide/${context.props.uri}?show=${raw.id}`]

    if (raw.codex) {
      urls.push(`https://playorna.com${raw.codex}`)
    }

    results.push({
      message: `★${raw.tier} ${raw.name}`,
      urls
    })
  }

  return results
}


export {
  searchName,
  searchWordsFilter,
  searchStages,
  search
}

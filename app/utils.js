import { request } from 'node:https'


/**
 * @param {string | URL} url
 * @param {import('node:https').RequestOptions} options
 * @param {string} [data]
 * @returns {Promise<string>}
 */
async function httpRequest(url, options, data) {
  return await new Promise((resolve, reject) => {
    const req = request(url, options, res => {
      const { statusCode, statusMessage } = res
      let result = ''

      res.setEncoding('utf8')
      res.on('data', chunk => {
        result += chunk
      })
      res.on('end', () => {
        if (statusCode !== 200) {
          console.error(result)

          return reject(new Error(`Request Failed.\nStatus: ${statusCode} ${statusMessage}`))
        } else {
          resolve(result)
        }
      })
    })

    req.on('error', error => {
      reject(error)
    })
    if (data) req.write(data)
    req.end()
  })
}


/**
 * @param {Date} [date]
 * @returns {string}
 */
function getWeekMonday(date = new Date()) {
  const dt = new Date(date)

  return dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() || 7) + 1) && dt.toJSON().slice(0, 10)
}


/**
 * @param {string|object|null} body
 * @param {object} defaultValue
 * @returns {object}
 */
function resolveBody(body, defaultValue) {
  if (typeof body === 'string') {
    body = JSON.parse(body)
  }

  return body || defaultValue
}


export {
  httpRequest,
  getWeekMonday,
  resolveBody
}

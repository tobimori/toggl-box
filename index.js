require('dotenv').config()
const { Octokit } = require('@octokit/rest')
const axios = require('axios')
const eaw = require('eastasianwidth')

const {
  GIST_ID: gistId,
  GH_TOKEN: githubToken,
  TOGGL_API_TOKEN: togglToken,
  TOGGL_WORKSPACE_ID: workspaceId,
  FILTER_BY_TAG: filterTag,
  FILTER_BY_BILLABLE: filterBillable,
  FILTER_BY_USER: filterUser
} = process.env

const octokit = new Octokit({
  auth: `token ${githubToken}`
})

const baseUrl = 'https://toggl.com/reports/api/v2' // Toggl reports API: https://github.com/toggl/toggl_api_docs/blob/master/reports.md

async function main () {
  if (!gistId || !githubToken || !togglToken || !workspaceId) {
    throw new Error('Please check your environment secrets.')
  }

  if (typeof filterTag === 'undefined' || typeof filterUser === 'undefined' || (filterBillable !== 'both' && filterBillable !== 'on' && filterBillable !== 'off')) {
    throw new Error('Please check your filter options.')
  }

  const filterQuery = [`billable=${filterBillable}`]
  filterTag !== 'false' && filterQuery.push(`tag_ids=${filterTag}`)
  filterUser !== 'false' && filterQuery.push(`user_ids=${filterUser}`)

  const apiEndpoint = `/weekly/?user_agent=tobimori%2Ftoggl-box&workspace_id=${workspaceId}&order_field=week_total&&order_desc=on&${filterQuery.join('&')}` // weekly endpoint

  const togglRequest = await axios({
    method: 'get',
    url: `${baseUrl}${apiEndpoint}`,
    auth: {
      username: togglToken,
      password: 'api_token'
    }
  }).catch((error) => {
    console.error(`toggl-box ran into an issue getting your Gist:\n${error}`)
  })

  console.log(`GET ${apiEndpoint}`)
  const { data } = await togglRequest

  let gist
  try {
    gist = await octokit.gists.get({
      gist_id: gistId
    })
  } catch (error) {
    console.error(`toggl-box ran into an issue getting your Gist:\n${error}`)
  }

  const lines = []
  for (let i = 0; i < data.data.length; i++) {
    const time = data.data[i].totals[7]
    let name = data.data[i].title.project

    if (!name) name = 'Without Project'

    // trim off long widechars
    for (let i = 24; i >= 0; i--) {
      if (eaw.length(name) <= 26) break
      name = name.substring(0, i)
    }
    // pad short strings
    name = name.padEnd(26 + name.length - eaw.length(name))

    lines.push([
      name,
      generateBarChart(time * 100 / data.total_grand, 17),
      `${timeConversion(time)}`.padStart(7)
    ].join(' '))
  }

  try {
    // Get original filename to update that same file
    const filename = Object.keys(gist.data.files)[0]
    await octokit.gists.update({
      gist_id: gistId,
      files: {
        [filename]: {
          filename: '⏱️ Weekly time tracking breakdown',
          content: lines.join('\n')
        }
      }
    })
  } catch (error) {
    console.error(`Unable to update gist\n${error}`)
  }
}

function generateBarChart (percent, size) {
  const syms = '░▏▎▍▌▋▊▉█'

  const frac = Math.floor((size * 8 * percent) / 100)
  const barsFull = Math.floor(frac / 8)
  if (barsFull >= size) {
    return syms.substring(8, 9).repeat(size)
  }
  const semi = frac % 8

  return [
    syms.substring(8, 9).repeat(barsFull),
    syms.substring(semi, semi + 1)
  ].join('').padEnd(size, syms.substring(0, 1))
}

function timeConversion (duration) {
  const portions = []

  const msInHour = 1000 * 60 * 60
  const hours = Math.trunc(duration / msInHour)
  if (hours > 0) {
    portions.push(hours + 'h')
    duration = duration - (hours * msInHour)
  }

  const msInMinute = 1000 * 60
  const minutes = Math.trunc(duration / msInMinute)
  if (minutes > 0) {
    portions.push(minutes + 'm')
    duration = duration - (minutes * msInMinute)
  }

  return portions.join(' ')
}

(async () => {
  await main()
})()

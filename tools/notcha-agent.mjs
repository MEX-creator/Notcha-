#!/usr/bin/env node
/**
 * Talk to the Agent tab in the Notcha island from this terminal: read what the
 * user types there and answer, with no API key involved.
 *
 *   node tools/notcha-agent.mjs --listen            # print messages as they arrive
 *   node tools/notcha-agent.mjs --reply "On it."    # answer in the notch
 *   node tools/notcha-agent.mjs --pending           # what is waiting right now
 *   node tools/notcha-agent.mjs --reply - < note.txt
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const argv = process.argv.slice(2)

function values(flag) {
  const out = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) out.push(argv[index + 1])
  }
  return out
}

function has(flag) {
  return argv.includes(flag)
}

const replyArg = values('--reply')[0]

if (has('--help') || has('-h') || (!has('--listen') && !has('--pending') && replyArg === undefined)) {
  console.log(`notcha-agent — talk to the Notcha Agent tab from the terminal

  --listen             stream messages the user sends from the notch (long poll)
  --pending            print anything already waiting, then exit
  --reply <text>       answer in the notch; use "-" to read stdin
  --json               print raw JSON instead of pretty lines
  --bridge <path>      override the bridge file location

The Agent tab uses this channel automatically while no API key is set in Settings.
Exits 2 when Notcha is not running.`)
  process.exit(has('--help') || has('-h') ? 0 : 0)
}

const bridgeFile =
  process.env.NOTCH_BRIDGE ||
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Notcha', 'agent-bridge.json')

let bridge
try {
  bridge = JSON.parse(await readFile(bridgeFile, 'utf8'))
} catch {
  console.error(`notcha-agent: Notcha does not look like it is running (no bridge file at ${bridgeFile})`)
  process.exit(2)
}

const base = `http://127.0.0.1:${bridge.port}`

async function call(route, options = {}) {
  try {
    return await fetch(`${base}${route}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-notch-token': bridge.token }
    })
  } catch (error) {
    console.error(`notcha-agent: could not reach Notcha on port ${bridge.port} (${error.message})`)
    process.exit(2)
  }
}

function stamp(at) {
  return new Date(at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function sendReply(text) {
  const value = text.trim()
  if (!value) {
    console.error('notcha-agent: --reply needs some text')
    process.exit(1)
  }
  const response = await call('/agent/reply', { method: 'POST', body: JSON.stringify({ text: value }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error(`notcha-agent: ${result.error || `reply failed (${response.status})`}`)
    process.exit(2)
  }
  console.log('REPLIED')
}

if (replyArg !== undefined) {
  const text = replyArg === '-' ? await readFile(0, 'utf8') : replyArg
  await sendReply(text)
  process.exit(0)
}

let last = 0
const once = has('--pending')
const json = has('--json')

if (once) {
  const response = await call('/agent/inbox?after=0&wait=0')
  const batch = await response.json().catch(() => ({ messages: [], last: 0 }))
  if (json) console.log(JSON.stringify(batch, null, 2))
  else if (batch.messages.length === 0) console.log('No messages waiting.')
  else for (const message of batch.messages) console.log(`USER [${stamp(message.at)}] ${message.text}`)
  process.exit(0)
}

console.log('Notcha agent channel listening — messages from the island show up below.')
console.log('Answer with: node tools/notcha-agent.mjs --reply "your reply"')

for (;;) {
  const response = await call(`/agent/inbox?after=${last}`)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`notcha-agent: inbox failed (${response.status}) ${body.slice(0, 120)}`)
    process.exit(2)
  }
  const batch = await response.json().catch(() => null)
  if (!batch) continue
  last = Number(batch.last) || last
  for (const message of batch.messages ?? []) {
    if (json) console.log(JSON.stringify(message))
    else {
      console.log(`USER [${stamp(message.at)}] ${message.text}`)
      console.log(`  └ reply: node tools/notcha-agent.mjs --reply "…"`)
    }
  }
}

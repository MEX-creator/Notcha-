#!/usr/bin/env node
/**
 * Send a notification to the running Notcha app and, when it has buttons, wait
 * for the answer.
 *
 *   node tools/notcha-notify.mjs --title "Build finished"
 *   node tools/notcha-notify.mjs --kind permission --title "Run the installer?" \
 *     --detail "This writes to Program Files." --action "Allow:primary" --action "Not now"
 *   node tools/notcha-notify.mjs --kind question --title "Ship it?" \
 *     --action "Yes" --action "No" --json
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

function value(flag, fallback = undefined) {
  return values(flag)[0] ?? fallback
}

function has(flag) {
  return argv.includes(flag)
}

if (has('--help') || has('-h')) {
  console.log(`notcha-notify — send a notification to Notcha

  --title <text>        required, the headline
  --detail <text>       one supporting line
  --kind <kind>         info | success | warning | timer | agent | question | permission
  --action <label>      up to four buttons; add ":primary" or ":danger" for style
  --source <text>       small label in the corner (defaults to "agent")
  --timeout <ms>        auto-dismiss; 0 keeps it until answered (default 0 with buttons)
  --no-wait             fire and forget
  --json                print the raw response
  --bridge <path>       override the bridge file location

Exits 0 with the chosen action, 1 if dismissed or timed out, 2 if Notcha is not running.`)
  process.exit(0)
}

const title = String(value('--title', '')).trim()
if (!title) {
  console.error('notcha-notify: --title is required')
  process.exit(2)
}

const actions = values('--action').map((raw, index) => {
  const [label, style] = String(raw).split(':')
  return {
    id: `action-${index + 1}`,
    label: String(label).trim(),
    style: style === 'primary' || style === 'danger' ? style : 'default'
  }
})

const bridgeFile =
  value('--bridge') ||
  process.env.NOTCH_BRIDGE ||
  path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Notcha', 'agent-bridge.json')

let bridge
try {
  bridge = JSON.parse(await readFile(bridgeFile, 'utf8'))
} catch {
  console.error(`notcha-notify: Notcha does not look like it is running (no bridge file at ${bridgeFile})`)
  process.exit(2)
}

const payload = {
  title,
  detail: value('--detail', null),
  kind: value('--kind', 'agent'),
  source: value('--source', 'agent'),
  actions,
  wait: !has('--no-wait'),
  ...(value('--timeout') ? { timeoutMs: Number(value('--timeout')) } : {})
}

let response
try {
  response = await fetch(`http://127.0.0.1:${bridge.port}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-notch-token': bridge.token },
    body: JSON.stringify(payload)
  })
} catch (error) {
  console.error(`notcha-notify: could not reach Notcha on port ${bridge.port} (${error.message})`)
  process.exit(2)
}

const result = await response.json().catch(() => ({}))
if (!response.ok) {
  console.error(`notcha-notify: ${result.error || `request failed (${response.status})`}`)
  process.exit(2)
}

if (has('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else if (actions.length === 0 || has('--no-wait')) {
  console.log(result.id ? `SENT ${result.id}` : 'SENT')
} else if (result.actionId) {
  const chosen = actions.find((action) => action.id === result.actionId)
  console.log(chosen ? chosen.label : result.actionId)
} else {
  console.log('DISMISSED')
}

process.exit(actions.length > 0 && !has('--no-wait') && result.actionId ? 0 : actions.length > 0 && !has('--no-wait') ? 1 : 0)

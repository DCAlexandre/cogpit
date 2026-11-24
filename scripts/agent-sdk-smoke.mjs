// Smoke test: does the Claude Agent SDK actually drive a turn here?
// Runs a trivial prompt (no tools → no permission prompts) and prints the
// message types it streams back. node scripts/agent-sdk-smoke.mjs
import { query } from '@anthropic-ai/claude-agent-sdk'

const q = query({ prompt: 'Réponds uniquement par le mot OK, sans rien d’autre.', options: {} })

let sawAssistant = false
let sawResult = false
const timer = setTimeout(() => {
  console.log('TIMEOUT (no result within 90s)')
  process.exit(sawAssistant ? 0 : 1)
}, 90000)

try {
  for await (const msg of q) {
    const t = msg.type
    if (t === 'assistant') {
      sawAssistant = true
      const blocks = msg.message?.content ?? []
      const text = Array.isArray(blocks)
        ? blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ')
        : ''
      console.log('assistant:', JSON.stringify(text).slice(0, 80))
    } else if (t === 'result') {
      sawResult = true
      console.log('result:', JSON.stringify(msg.result ?? msg.subtype ?? '').slice(0, 80))
      break
    } else {
      console.log('msg:', t)
    }
  }
} catch (e) {
  console.log('ERROR:', e?.message ?? String(e))
  clearTimeout(timer)
  process.exit(1)
}
clearTimeout(timer)
console.log(`\nassistant=${sawAssistant} result=${sawResult}`)
process.exit(sawAssistant ? 0 : 1)

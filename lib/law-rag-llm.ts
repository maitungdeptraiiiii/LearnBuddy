import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LAW_RAG_ROOT = process.env.LAW_RAG_ROOT || 'C:\\Users\\Admin\\Desktop\\Law-RAG'

export interface LawRagRuntime {
  provider: 'openai' | 'local'
  model: string
  baseUrl: string
  apiKey: string
}

export function getLawRagRuntime(): LawRagRuntime | null {
  const env = loadLawRagEnv()
  const mode = value(env, 'RAG_MODE', 'openai').toLowerCase()
  const provider = value(env, 'LLM_PROVIDER', mode === 'local' ? 'local' : 'openai').toLowerCase()

  if (provider === 'local') {
    return {
      provider: 'local',
      model: value(env, 'CHAT_MODEL', value(env, 'LOCAL_CHAT_MODEL', 'qwen2.5:7b-instruct')),
      baseUrl: value(env, 'LOCAL_LLM_BASE_URL', 'http://127.0.0.1:11434/v1'),
      apiKey: value(env, 'LOCAL_LLM_API_KEY', 'local')
    }
  }

  const apiKey = value(env, 'OPENAI_API_KEY', process.env.OPENAI_API_KEY || '')
  if (!apiKey) return null

  return {
    provider: 'openai',
    model: value(env, 'CHAT_MODEL', value(env, 'OPENAI_CHAT_MODEL', 'gpt-4.1-mini')),
    baseUrl: value(env, 'OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    apiKey
  }
}

export async function lawRagChatText(messages: Array<{ role: string; content: string }>, temperature = 0.25) {
  const runtime = getLawRagRuntime()
  if (!runtime) return null

  const payload = await chatCompletions(runtime, {
    model: runtime.model,
    temperature,
    messages,
    extra_body: runtime.provider === 'local' ? { keep_alive: process.env.OLLAMA_KEEP_ALIVE || '2h' } : undefined
  })

  return payload.choices?.[0]?.message?.content || null
}

export async function lawRagChatJson(messages: Array<{ role: string; content: string }>, temperature = 0.3) {
  const runtime = getLawRagRuntime()
  if (!runtime) return null

  const requestBody = {
    model: runtime.model,
    temperature,
    response_format: { type: 'json_object' },
    messages,
    extra_body: runtime.provider === 'local' ? { keep_alive: process.env.OLLAMA_KEEP_ALIVE || '2h' } : undefined
  }

  try {
    const payload = await chatCompletions(runtime, requestBody)
    return parseJsonObject(payload.choices?.[0]?.message?.content || '{}')
  } catch (error) {
    if (!String(error).includes('response_format')) throw error
    const payload = await chatCompletions(runtime, {
      ...requestBody,
      response_format: undefined,
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'Chỉ trả về một JSON object hợp lệ, không thêm markdown hay giải thích.'
        }
      ]
    })
    return parseJsonObject(payload.choices?.[0]?.message?.content || '{}')
  }
}

async function chatCompletions(runtime: LawRagRuntime, body: Record<string, unknown>) {
  const response = await fetch(`${runtime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${runtime.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Law-RAG LLM request failed: ${response.status} ${text}`)
  }

  return response.json()
}

function loadLawRagEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  try {
    const content = readFileSync(join(LAW_RAG_ROOT, '.env'), 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator === -1) continue
      const key = trimmed.slice(0, separator).trim()
      const rawValue = trimmed.slice(separator + 1).trim()
      env[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
  } catch {
    return env
  }
  return env
}

function value(env: Record<string, string | undefined>, key: string, fallback: string) {
  const found = env[key]
  return found && found.trim() ? found.trim() : fallback
}

function parseJsonObject(content: string) {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

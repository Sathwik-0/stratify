import OpenAI from 'openai'
import { repairJSON, classifyError, nowISO } from '@/lib/intelligence'
import { logTelemetry, estimatePromptTokens } from '@/lib/quality-gate'

export const groq = new OpenAI({
  apiKey:  process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1',
})

export const MODEL    = 'llama-3.1-8b-instant'
export const PROVIDER = 'groq'

export const PROMPT_VERSIONS = {
  classify:   'classify-v2',
  cluster:    'cluster-v2',
  analysis:   'analysis-v4-evidence',
  ceo:        'ceo-v1-constrained',
  delta:      'delta-v1-deterministic',
  investment: 'investment-v1-investor',
} as const

export const TEMPERATURES = {
  classify:   0.1,
  cluster:    0.2,
  analysis:   0.3,
  ceo:        0.25,
  delta:      0.1,
  investment: 0.2,
} as const

export const TOKEN_BUDGETS = {
  pass1_classify:  1800,
  pass2_cluster:   2400,
  pass3_analysis:  4500,
  ceo_playbook:    2400,
  delta_analysis:  1800,
  investment:      2600,
} as const
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function isLikelyTruncated(raw: string, finishReason?: string | null): boolean {
  const trimmed = raw.trim()
  if (finishReason === 'length') return true
  if (!trimmed) return false

  const openCurly  = (trimmed.match(/{/g) ?? []).length
  const closeCurly = (trimmed.match(/}/g) ?? []).length
  const openSquare = (trimmed.match(/\[/g) ?? []).length
  const closeSquare = (trimmed.match(/]/g) ?? []).length

  return openCurly !== closeCurly || openSquare !== closeSquare
}

export async function callGroq(
  systemPrompt: string,
  userPrompt:   string,
  temperature:  number,
  maxTokens:    number,
  passName:     string,
  retries = 3
): Promise<unknown> {
  const start = Date.now()

  for (let i = 0; i < retries; i++) {
    try {
      const res = await groq.chat.completions.create({
        model:       MODEL,
        messages:    [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: i === 0
              ? userPrompt
              : `${userPrompt}\n\nPrevious attempt failed validation. Return complete, valid JSON only. Do not truncate. Keep text fields compact.`,
          },
        ],
        temperature: i > 0 ? Math.max(temperature - 0.1, 0.05) : temperature,
        max_tokens:  maxTokens,
      })

      const choice = res.choices[0]
      const raw = choice.message.content || ''
      if (isLikelyTruncated(raw, choice.finish_reason)) {
        throw new Error(`truncated_json: model stopped before complete JSON (${choice.finish_reason ?? 'unknown'})`)
      }

      const { parsed, repaired, error } = repairJSON(raw)

      if (repaired) logTelemetry({ eventType: 'json_repaired', passName, latencyMs: Date.now() - start, timestamp: nowISO() })
      if (!parsed)  throw new Error(`JSON parse failed: ${error ?? 'unknown'}. Raw: ${raw.slice(0, 120)}`)

      logTelemetry({ eventType: 'pass_complete', passName, latencyMs: Date.now() - start, tokenEstimate: estimatePromptTokens([{ systemPrompt, userPrompt }]), timestamp: nowISO() })
      return parsed

    } catch (e: any) {
      const { retryClass, reason } = classifyError(e)
      if (retryClass === 'non_retryable') {
        logTelemetry({ eventType: 'pass_failed', passName, latencyMs: Date.now() - start, error: reason, timestamp: nowISO() })
        throw e
      }
      if (i < retries - 1) {
        const waitMs = reason === 'rate_limit' ? 25000 : reason === 'timeout' ? 5000 : 1500
        console.log(`[${passName}] retry ${i + 1}/${retries} in ${waitMs}ms: ${e.message}`)
        await sleep(waitMs)
        continue
      }
      logTelemetry({ eventType: 'pass_failed', passName, latencyMs: Date.now() - start, error: e.message, timestamp: nowISO() })
      throw e
    }
  }
  throw new Error(`${passName}: max retries exceeded`)
}

export function budgetClusters(clusters: any[], budget: number): any[] {
  const sorted = [...clusters].sort((a, b) => (a.cluster_name ?? '').localeCompare(b.cluster_name ?? ''))
  let tokenCount = 0
  const result: any[] = []
  for (const c of sorted) {
    const tokens = estimatePromptTokens([c])
    if (tokenCount + tokens > budget) break
    result.push(c)
    tokenCount += tokens
  }
  return result.length > 0 ? result
    : [...clusters].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)).slice(0, 4)
}

export function makeAttribution(pass: keyof typeof PROMPT_VERSIONS, temperature: number) {
  return { model: MODEL, provider: PROVIDER, temperature, promptVersion: PROMPT_VERSIONS[pass] }
}

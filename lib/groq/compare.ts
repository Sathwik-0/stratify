// lib/groq/compare.ts
// Compare two companies for investor due diligence.
// Fixed: Zod validation on output (was completely absent before).
import { callGroq, TEMPERATURES, TOKEN_BUDGETS } from './client'
import { safeParseWithFallback, CompareOutputSchema, COMPARE_FALLBACK, type CompareOutput } from '../intelligence/schemas'

export async function compareCompanies(
  companyA: string, analysisA: Record<string, unknown>,
  companyB: string, analysisB: Record<string, unknown>
): Promise<{ result: CompareOutput; valid: boolean; errors: string[] }> {

  const systemPrompt = `You are an expert investor comparing two businesses for due diligence.
Return ONLY valid JSON matching this exact structure — no markdown, no preamble:
{
  "winner": "company name",
  "verdict": "one sharp sentence why (≥15 words)",
  "key_differences": ["diff 1", "diff 2", "diff 3"],
  "strategic_insight": "what an investor should learn from this comparison (≥15 words)",
  "moat_comparison": "whose moat is stronger and why (≥15 words)",
  "risk_comparison": "who is more at risk and why (≥15 words)",
  "confidence": 0-100
}`

  const userPrompt = `Compare these two companies:

${companyA}:
- Summary: ${String(analysisA.one_line_insight ?? 'Unknown')}
- Moat: ${String((analysisA.moat_analysis as Record<string,unknown> | undefined)?.headline ?? 'Unknown')}
- Failure risk: ${String((analysisA.failure_surface as Record<string,unknown> | undefined)?.headline ?? 'Unknown')}
- Confidence: ${String(analysisA.confidence_score ?? '?')}

${companyB}:
- Summary: ${String(analysisB.one_line_insight ?? 'Unknown')}
- Moat: ${String((analysisB.moat_analysis as Record<string,unknown> | undefined)?.headline ?? 'Unknown')}
- Failure risk: ${String((analysisB.failure_surface as Record<string,unknown> | undefined)?.headline ?? 'Unknown')}
- Confidence: ${String(analysisB.confidence_score ?? '?')}

Return the JSON comparison now.`

  const raw = await callGroq(
    systemPrompt,
    userPrompt,
    TEMPERATURES.analysis,
    TOKEN_BUDGETS.pass3_analysis,
    'compare'
  )

  return safeParseWithFallback(CompareOutputSchema, raw, 'compare', COMPARE_FALLBACK)
}

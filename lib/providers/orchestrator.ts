// lib/providers/orchestrator.ts
// Retrieval orchestration layer.
// Runs providers, normalizes results, detects failures, returns unified evidence set.
// Intelligence engine reads ONLY NormalizedEvidence — never touches provider internals.

import { getProvider }             from './registry'
import type { ProviderId, ProviderQuery, ProviderResult, NormalizedEvidence, PipelineError, PipelineErrorCode } from './types'

export interface OrchestratorResult {
  evidence:       NormalizedEvidence[]
  providerResults: ProviderResult[]
  totalFetched:   number
  errors:         PipelineError[]
  durationMs:     number
  correlationId:  string
}

export async function fetchEvidence(
  providerIds:   ProviderId[],
  query:         Omit<ProviderQuery, 'correlationId'>,
  correlationId: string
): Promise<OrchestratorResult> {
  const start   = Date.now()
  const results: ProviderResult[] = []
  const errors:  PipelineError[]  = []

  await Promise.allSettled(
    providerIds.map(async (id) => {
      const provider = getProvider(id)
      if (!provider) {
        errors.push(makePipelineError('unknown', `Provider ${id} not found in registry`, 'scraping', correlationId, id, false))
        return
      }
      if (!provider.isAvailable()) {
        errors.push(makePipelineError('unknown', `Provider ${id} is not available`, 'scraping', correlationId, id, false))
        return
      }

      try {
        const result = await provider.fetch({ ...query, correlationId })
        results.push(result)

        if (result.errorCode) {
          errors.push(makePipelineError(
            mapProviderError(result.errorCode),
            result.error ?? `Provider ${id} returned error: ${result.errorCode}`,
            'scraping',
            correlationId,
            id,
            result.errorCode === 'rate_limited' || result.errorCode === 'scraper_timeout'
          ))
        }
      } catch (err: any) {
        errors.push(makePipelineError('scraper_internal_error', err.message, 'scraping', correlationId, id, true))
      }
    })
  )

  const evidence = results.flatMap(r => r.evidence)

  return {
    evidence,
    providerResults: results,
    totalFetched:    evidence.length,
    errors,
    durationMs:      Date.now() - start,
    correlationId,
  }
}

function mapProviderError(code: string): PipelineErrorCode {
  const map: Record<string, PipelineErrorCode> = {
    app_not_found:          'app_not_found',
    no_reviews_found:       'no_reviews_found',
    rate_limited:           'rate_limited',
    scraper_timeout:        'scraper_timeout',
    scraper_internal_error: 'scraper_internal_error',
    network_error:          'scraper_internal_error',
  }
  return map[code] ?? 'unknown'
}

function makePipelineError(
  code:      PipelineErrorCode,
  message:   string,
  stage:     'scraping',
  corrId:    string,
  provider?: ProviderId,
  retryable = false
): PipelineError {
  return {
    code, message, stage,
    correlationId: corrId,
    providerId:    provider,
    timestamp:     new Date().toISOString(),
    retryable,
  }
}

// lib/providers/types.ts
// Provider abstraction layer — normalized evidence schema.
// Supports current: google-play-scraper
// Future: Reddit, HN, App Store, X, Glassdoor, News APIs, GitHub, etc.
// Add a new provider by implementing ProviderAdapter — zero changes to intelligence engine.

export type ProviderId =
  | 'google_play'
  | 'app_store'
  | 'reddit'
  | 'hacker_news'
  | 'product_hunt'
  | 'twitter_x'
  | 'github'
  | 'glassdoor'
  | 'news_api'
  | 'youtube'
  | 'sec_filings'
  | 'linkedin'
  | 'web_crawl'

export type EvidenceType = 'review' | 'post' | 'comment' | 'article' | 'filing' | 'signal'

// Normalized evidence unit — same shape regardless of source
export interface NormalizedEvidence {
  id:           string
  providerId:   ProviderId
  sourceUrl?:   string
  evidenceType: EvidenceType
  text:         string
  rating?:      number | null
  sentiment?:   'positive' | 'negative' | 'neutral' | null
  authorId?:    string
  publishedAt?: string
  retrievedAt:  string
  metadata?:    Record<string, unknown>
}

// Result from a provider fetch
export interface ProviderResult {
  providerId:   ProviderId
  appId:        string
  evidence:     NormalizedEvidence[]
  totalFetched: number
  durationMs:   number
  error?:       string
  errorCode?:   ProviderErrorCode
}

export type ProviderErrorCode =
  | 'app_not_found'
  | 'no_reviews_found'
  | 'rate_limited'
  | 'scraper_timeout'
  | 'scraper_internal_error'
  | 'network_error'
  | 'auth_failed'
  | 'quota_exceeded'

// Contract every provider adapter must implement
export interface ProviderAdapter {
  id:          ProviderId
  displayName: string
  fetch(query: ProviderQuery): Promise<ProviderResult>
  isAvailable(): boolean
}

export interface ProviderQuery {
  appId?:        string
  companyName:   string
  maxItems?:     number
  country?:      string
  lang?:         string
  correlationId: string
}

// Structured pipeline error — always persisted to DB
export interface PipelineError {
  code:          PipelineErrorCode
  message:       string
  stage:         PipelineStage
  correlationId: string
  providerId?:   ProviderId
  timestamp:     string
  retryable:     boolean
  metadata?:     Record<string, unknown>
}

export type PipelineErrorCode =
  | 'app_not_found'
  | 'no_reviews_found'
  | 'scraper_timeout'
  | 'rate_limited'
  | 'scraper_internal_error'
  | 'classification_failed'
  | 'clustering_failed'
  | 'analysis_generation_failed'
  | 'persistence_failed'
  | 'unknown'

export type PipelineStage =
  | 'search'
  | 'scraping'
  | 'classification'
  | 'clustering'
  | 'synthesis'
  | 'persistence'
  | 'retrieval'

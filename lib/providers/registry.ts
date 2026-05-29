// lib/providers/registry.ts
// Central registry for all data providers.
// To add a new provider: implement ProviderAdapter and register here.

import { googlePlayProvider }   from './google-play'
import type { ProviderAdapter, ProviderId } from './types'

const registry = new Map<ProviderId, ProviderAdapter>([
  ['google_play', googlePlayProvider],
  // Future providers registered here:
  // ['reddit',       redditProvider],
  // ['hacker_news',  hnProvider],
  // ['app_store',    appStoreProvider],
  // ['news_api',     newsProvider],
])

export function getProvider(id: ProviderId): ProviderAdapter | null {
  return registry.get(id) ?? null
}

export function getAvailableProviders(): ProviderAdapter[] {
  return Array.from(registry.values()).filter(p => p.isAvailable())
}

export function getDefaultProviders(): ProviderId[] {
  return ['google_play']
}

import { Suspense } from 'react'
import LoadingContent from './LoadingContent'

export default function LoadingAnalysisPage() {
  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <Suspense fallback={
        <div>
          <nav style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 32px', borderBottom: '1px solid rgba(8,3,3,0.08)',
            background: 'rgba(250,237,217,0.95)', position: 'sticky', top: 0, zIndex: 100,
          }}>
            <span style={{ fontFamily: 'Fraunces', fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px', color: '#080303' }}>
              Stratify
            </span>
          </nav>
          <div style={{ maxWidth: 620, margin: '80px auto', padding: '0 32px' }}>
            <div style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 900, letterSpacing: '-1px', color: '#080303' }}>
              Preparing analysis...
            </div>
          </div>
        </div>
      }>
        <LoadingContent />
      </Suspense>
    </main>
  )
}

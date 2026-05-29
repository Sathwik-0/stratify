import { Suspense } from 'react'
import CompareContent from './CompareContent'

export default function ComparePage() {
  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <Suspense fallback={
        <div>
          <nav style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 32px', borderBottom: '1px solid rgba(8,3,3,0.08)',
            background: 'rgba(250,237,217,0.95)', position: 'sticky', top: 0, zIndex: 100,
          }}>
            <span style={{ fontFamily: 'Fraunces', fontSize: 18, fontWeight: 900, color: '#080303' }}>Stratify</span>
          </nav>
          <div style={{ padding: '80px 32px', fontFamily: 'Fraunces', fontSize: 24, color: '#080303' }}>Loading...</div>
        </div>
      }>
        <CompareContent />
      </Suspense>
    </main>
  )
}

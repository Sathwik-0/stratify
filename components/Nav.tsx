'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const LINKS = [
  { label: 'Home',    href: '/' },
  { label: 'Explore', href: '/explore' },
  { label: 'Compare', href: '/compare' },
]

export default function Nav() {
  const router  = useRouter()
  const path    = usePathname()
  const [open, setOpen] = useState(false)

  const go = (href: string) => {
    router.push(href)
    setOpen(false)
  }

  return (
    <>
      <nav style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        padding:        '16px 24px',
        borderBottom:   '1px solid var(--border)',
        background:     'rgba(250,237,217,0.95)',
        backdropFilter: 'blur(8px)',
        position:       'sticky',
        top:            0,
        zIndex:         100,
      }}>
        {/* Logo */}
        <button
          onClick={() => go('/')}
          aria-label="Go to homepage"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{
            fontFamily:    'var(--font-fraunces, Fraunces, serif)',
            fontSize:      18,
            fontWeight:    900,
            letterSpacing: '-0.5px',
            color:         'var(--charcoal)',
          }}>
            Stratify
          </span>
        </button>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', gap: 4 }} className="mobile-hide">
          {LINKS.map(link => (
            <button
              key={link.href}
              onClick={() => go(link.href)}
              aria-current={path === link.href ? 'page' : undefined}
              style={{
                background:  path === link.href ? 'var(--charcoal)' : 'transparent',
                color:       path === link.href ? 'var(--cream)'    : 'var(--muted)',
                border:      '1px solid',
                borderColor: path === link.href ? 'var(--charcoal)' : 'transparent',
                padding:     '6px 16px',
                fontFamily:  'var(--font-dm-sans, DM Sans, sans-serif)',
                fontSize:    13,
                fontWeight:  500,
                cursor:      'pointer',
                borderRadius: 2,
                transition:  'all 0.15s',
              }}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Desktop CTA */}
        <button
          onClick={() => go('/explore')}
          className="mobile-hide"
          style={{
            background:  'var(--red)',
            color:       '#fff',
            border:      'none',
            padding:     '8px 20px',
            fontFamily:  'var(--font-dm-sans, DM Sans, sans-serif)',
            fontSize:    13,
            fontWeight:  600,
            cursor:      'pointer',
            borderRadius: 2,
          }}
        >
          Analyze →
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          style={{
            display:     'none',
            background:  'none',
            border:      '1px solid var(--border)',
            cursor:      'pointer',
            padding:     '6px 10px',
            borderRadius: 2,
            color:       'var(--charcoal)',
            fontSize:    18,
            lineHeight:  1,
          }}
          className="mobile-hamburger"
        >
          {open ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {open && (
        <div style={{
          position:   'fixed',
          top:        57,
          left:       0,
          right:      0,
          background: 'rgba(250,237,217,0.98)',
          borderBottom: '1px solid var(--border)',
          zIndex:     99,
          padding:    '12px 24px 20px',
          display:    'flex',
          flexDirection: 'column',
          gap:        8,
        }}>
          {LINKS.map(link => (
            <button
              key={link.href}
              onClick={() => go(link.href)}
              style={{
                background:  path === link.href ? 'var(--charcoal)' : 'transparent',
                color:       path === link.href ? 'var(--cream)'    : 'var(--charcoal)',
                border:      '1px solid var(--border)',
                padding:     '10px 16px',
                fontFamily:  'var(--font-dm-sans, DM Sans, sans-serif)',
                fontSize:    15,
                fontWeight:  500,
                cursor:      'pointer',
                borderRadius: 2,
                textAlign:   'left',
              }}
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => go('/explore')}
            style={{
              background:  'var(--red)',
              color:       '#fff',
              border:      'none',
              padding:     '12px 16px',
              fontFamily:  'var(--font-dm-sans, DM Sans, sans-serif)',
              fontSize:    15,
              fontWeight:  600,
              cursor:      'pointer',
              borderRadius: 2,
              marginTop:   4,
            }}
          >
            Analyze a Company →
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .mobile-hide      { display: none !important; }
          .mobile-hamburger { display: block !important; }
        }
      `}</style>
    </>
  )
}

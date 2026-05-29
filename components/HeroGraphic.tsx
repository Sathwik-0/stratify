'use client'

export default function HeroGraphic() {
  return (
    <div style={{ position: 'relative', width: 380, height: 380, animation: 'float 4s ease-in-out infinite' }}>
      <svg width="380" height="380" viewBox="0 0 380 380" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer orbit ring */}
        <circle cx="190" cy="190" r="150" stroke="rgba(8,3,3,0.08)" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="190" cy="190" r="100" stroke="rgba(8,3,3,0.06)" strokeWidth="1" />

        {/* Animated orbit path */}
        <circle cx="190" cy="190" r="150" stroke="rgba(232,68,31,0.15)" strokeWidth="1.5"
          strokeDasharray="20 10" style={{ animation: 'spin 12s linear infinite' }} />

        {/* Data flow lines */}
        <line x1="190" y1="40" x2="190" y2="130" stroke="rgba(232,68,31,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="330" y1="140" x2="255" y2="165" stroke="rgba(232,68,31,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="310" y1="290" x2="240" y2="220" stroke="rgba(232,68,31,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="70" y1="290" x2="140" y2="220" stroke="rgba(232,68,31,0.3)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="50" y1="140" x2="125" y2="165" stroke="rgba(232,68,31,0.3)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Central X-Ray cube */}
        <rect x="155" y="155" width="70" height="70" rx="4" fill="var(--red)" opacity="0.95" />
        <rect x="162" y="162" width="56" height="56" rx="2" fill="rgba(255,255,255,0.1)" />
        <text x="190" y="195" textAnchor="middle" fill="white" fontSize="11" fontFamily="DM Mono" fontWeight="500">X-RAY</text>
        <text x="190" y="210" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="DM Mono">ENGINE</text>

        {/* Node: Play Store */}
        <circle cx="190" cy="38" r="22" fill="var(--cream-dark, #F2E2C4)" stroke="rgba(8,3,3,0.12)" strokeWidth="1" />
        <text x="190" y="42" textAnchor="middle" fill="var(--charcoal)" fontSize="9" fontFamily="DM Mono">PLAY</text>
        <text x="190" y="53" textAnchor="middle" fill="var(--muted)" fontSize="7" fontFamily="DM Mono">STORE</text>

        {/* Node: Reddit */}
        <circle cx="338" cy="138" r="22" fill="var(--cream-dark, #F2E2C4)" stroke="rgba(8,3,3,0.12)" strokeWidth="1" />
        <text x="338" y="142" textAnchor="middle" fill="var(--charcoal)" fontSize="9" fontFamily="DM Mono">RED</text>
        <text x="338" y="153" textAnchor="middle" fill="var(--muted)" fontSize="7" fontFamily="DM Mono">DIT</text>

        {/* Node: News */}
        <circle cx="312" cy="296" r="22" fill="var(--cream-dark, #F2E2C4)" stroke="rgba(8,3,3,0.12)" strokeWidth="1" />
        <text x="312" y="300" textAnchor="middle" fill="var(--charcoal)" fontSize="9" fontFamily="DM Mono">NEWS</text>
        <text x="312" y="311" textAnchor="middle" fill="var(--muted)" fontSize="7" fontFamily="DM Mono">FEED</text>

        {/* Node: Signals */}
        <circle cx="68" cy="296" r="22" fill="rgba(232,68,31,0.1)" stroke="rgba(232,68,31,0.3)" strokeWidth="1" />
        <text x="68" y="300" textAnchor="middle" fill="var(--red)" fontSize="8" fontFamily="DM Mono">SIG</text>
        <text x="68" y="311" textAnchor="middle" fill="var(--red)" fontSize="7" fontFamily="DM Mono">NALS</text>

        {/* Node: AI */}
        <circle cx="42" cy="138" r="22" fill="rgba(232,68,31,0.1)" stroke="rgba(232,68,31,0.3)" strokeWidth="1" />
        <text x="42" y="142" textAnchor="middle" fill="var(--red)" fontSize="9" fontFamily="DM Mono">AI</text>
        <text x="42" y="153" textAnchor="middle" fill="var(--red)" fontSize="7" fontFamily="DM Mono">6-FORCE</text>

        {/* Pulse dots on lines */}
        <circle r="3" fill="var(--red)" opacity="0.8">
          <animateMotion dur="2s" repeatCount="indefinite" path="M190,40 L190,130" />
        </circle>
        <circle r="3" fill="var(--red)" opacity="0.8">
          <animateMotion dur="2.5s" repeatCount="indefinite" path="M330,140 L255,165" />
        </circle>
        <circle r="3" fill="var(--red)" opacity="0.8">
          <animateMotion dur="3s" repeatCount="indefinite" path="M50,140 L125,165" />
        </circle>
      </svg>

      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes spin { to { transform: rotate(360deg); transform-origin: 190px 190px; } }
      `}</style>
    </div>
  )
}

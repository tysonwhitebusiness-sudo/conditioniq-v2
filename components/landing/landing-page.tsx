'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Car, Layers, ArrowRight, ChevronDown, Menu, X, Check,
  DollarSign, ShieldCheck, Map, ClipboardCheck, Receipt, Send, FileText,
  Warehouse, Truck, Network,
} from 'lucide-react'

// ─── CSS ──────────────────────────────────────────────────────────────────
const CSS = `
  .fade-s {
    opacity: 0; transform: translateY(24px);
    transition: opacity .7s ease-out, transform .7s ease-out;
    will-change: transform, opacity;
  }
  .fade-s.vis { opacity: 1; transform: translateY(0); }

  .wf-node {
    opacity: 0; transform: translateY(16px);
    transition: opacity .5s ease-out, transform .5s ease-out;
    will-change: transform, opacity;
  }
  .wf-node.vis { opacity: 1; transform: translateY(0); }

  @keyframes bob {
    0%,100% { transform: translateY(0); }
    50%      { transform: translateY(-8px); }
  }
  .bob { animation: bob 4s ease-in-out infinite; will-change: transform; }

  @keyframes shimmer {
    0%   { background-position: -400% 0; }
    100% { background-position:  400% 0; }
  }
  .shimmer-bg {
    background: linear-gradient(90deg,#1B2D40 25%,#273e56 50%,#1B2D40 75%);
    background-size: 400% 100%;
    animation: shimmer 1.6s infinite;
  }

  @keyframes amberPulse {
    0%,100% { box-shadow: 0 0  0 0   rgba(244,166,42,.15); }
    50%     { box-shadow: 0 0 28px 6px rgba(244,166,42,.35); }
  }
  .amber-pulse { animation: amberPulse 3s ease-in-out infinite; }

  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
  .cursor { animation: blink 1s step-end infinite; }

  .nav-blur { background: rgba(13,27,42,.95) !important; backdrop-filter: blur(12px); }

  .cyan-glow:hover  { box-shadow: 0 0 20px rgba(0,180,216,.3); }
  .amber-glow:hover { box-shadow: 0 0 24px rgba(244,166,42,.4); }

  .card-lift { transition: transform .2s ease, box-shadow .2s ease; }
  .card-lift:hover { transform: translateY(-4px); }
`

// ─── Hooks ────────────────────────────────────────────────────────────────
function useFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add('vis'); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return ref
}

function FadeCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => el.classList.add('vis'), delay)
        obs.disconnect()
      }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [delay])
  return <div ref={ref} className="fade-s">{children}</div>
}

function useCounter(target: number, duration = 1400) {
  const [count, setCount] = useState(0)
  const [active, setActive] = useState(false)
  const activate = useCallback(() => setActive(true), [])
  useEffect(() => {
    if (!active) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    const id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [active, target, duration])
  return { count, activate, progress: target > 0 ? count / target : 0 }
}

const CYCLING_WORDS = ['Inspect.', 'Track.', 'Bill.', 'Dispatch.']

function useTyping(words: string[], typeMs = 80, delMs = 40, pauseMs = 1800) {
  const [text, setText] = useState('')
  const [wi, setWi] = useState(0)
  const [del, setDel] = useState(false)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const word = words[wi]
    if (paused) {
      const t = setTimeout(() => { setPaused(false); setDel(true) }, pauseMs)
      return () => clearTimeout(t)
    }
    if (del) {
      if (text.length === 0) { setDel(false); setWi(i => (i + 1) % words.length); return }
      const t = setTimeout(() => setText(s => s.slice(0, -1)), delMs)
      return () => clearTimeout(t)
    }
    if (text.length < word.length) {
      const t = setTimeout(() => setText(word.slice(0, text.length + 1)), typeMs)
      return () => clearTimeout(t)
    }
    setPaused(true)
  }, [text, wi, del, paused, words, typeMs, delMs, pauseMs])
  return text
}

// ─── Nav ──────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  const links = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing',  href: '#pricing'  },
    { label: 'FAQ',      href: '#faq'      },
    { label: "What's New", href: '/changelog' },
  ]
  return (
    <>
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'nav-blur' : 'bg-[#0D1B2A]'}`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Car size={17} className="text-[#00B4D8]" />
            <span className="font-bold text-white text-lg">Condition<span className="text-[#00B4D8]">IQ</span></span>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            {links.map(l => (
              <Link key={l.label} href={l.href} className="text-sm text-[#94A3B8] hover:text-white transition-colors">{l.label}</Link>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/auth/signin" className="text-sm text-[#F0F4F8] hover:text-white transition-colors px-3 py-1.5">Sign In</Link>
            <Link href="/auth/signup" className="text-sm font-bold bg-[#F4A62A] text-[#0D1B2A] px-4 py-2 rounded-xl hover:bg-amber-400 transition-all amber-glow">Get Started</Link>
          </div>
          <button className="md:hidden text-white p-1" onClick={() => setOpen(o => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 bg-[#0D1B2A] flex flex-col pt-20 px-6">
          <div className="flex flex-col gap-6 mt-4">
            {links.map(l => (
              <Link key={l.label} href={l.href} className="text-xl text-[#F0F4F8] font-medium" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
            <div className="border-t border-[#1B2D40] pt-6 flex flex-col gap-4">
              <Link href="/auth/signin" className="text-[#F0F4F8] text-lg" onClick={() => setOpen(false)}>Sign In</Link>
              <Link href="/auth/signup" className="bg-[#F4A62A] text-[#0D1B2A] font-bold text-lg text-center py-3 rounded-xl" onClick={() => setOpen(false)}>Get Started</Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────
function Hero() {
  const word = useTyping(CYCLING_WORDS)
  return (
    <section className="relative min-h-screen pt-16 bg-[#0D1B2A] overflow-hidden flex items-center">
      {/* Background mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle,rgba(0,180,216,.08) 0%,transparent 70%)', transform: 'translate(-35%,-35%)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle,rgba(244,166,42,.06) 0%,transparent 70%)', transform: 'translate(35%,35%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
      </div>
      <div className="relative max-w-6xl mx-auto px-5 py-20 w-full">
        <div className="grid md:grid-cols-2 gap-14 items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 border border-[#00B4D8]/30 text-[#00B4D8] text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <Layers size={12} />
              Vehicle Storage Management Platform
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
              Run a Tighter<br />Storage Operation.
            </h1>
            <div className="text-xl md:text-2xl font-bold text-[#00B4D8] mb-6 h-9 flex items-center gap-1.5">
              <span>—</span>
              <span>{word}</span>
              <span className="cursor text-[#00B4D8]">|</span>
            </div>
            <p className="text-[#94A3B8] text-base leading-relaxed mb-8 max-w-lg">
              Condition IQ gives storage yards, fleet operators, and tow companies the tools to document every vehicle, track every lot, and bill every storage day — without the enterprise price tag.
            </p>
            <div className="flex flex-wrap gap-3 mb-3">
              <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-[#F4A62A] text-[#0D1B2A] font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-400 transition-all amber-glow">
                Get Started <ArrowRight size={15} />
              </Link>
              <Link href="/demo" className="inline-flex items-center gap-2 border border-white/20 text-white px-6 py-3 rounded-xl text-sm hover:bg-white/5 transition-all">
                View Report Preview
              </Link>
            </div>
            <p className="text-[#94A3B8] text-xs mb-5">No credit card required · 10 free reports · 3 days full access</p>
            <div className="flex flex-wrap gap-5">
              {['Mobile-first', 'Instant PDF', 'No contracts'].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                  <Check size={12} className="text-[#00B4D8]" />{t}
                </div>
              ))}
            </div>
          </div>
          {/* Right — Dashboard mockup */}
          <div className="flex justify-center">
            <div className="bob w-full max-w-sm rounded-2xl border border-[#00B4D8]/20 overflow-hidden" style={{ backgroundColor: '#1B2D40', boxShadow: '0 0 40px rgba(0,180,216,.08),0 24px 48px rgba(0,0,0,.4)' }}>
              {/* Top bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Car size={13} className="text-[#00B4D8]" />
                  <span className="text-white text-xs font-bold">Condition<span className="text-[#00B4D8]">IQ</span></span>
                </div>
                <div className="w-7 h-7 rounded-full bg-[#0D1B2A] flex items-center justify-center">
                  <span className="text-[10px] text-[#94A3B8] font-bold">TW</span>
                </div>
              </div>
              {/* Stat chips */}
              <div className="grid grid-cols-3 gap-2 p-3">
                {[
                  { label: 'Queued',      val: '12',  color: '#94A3B8' },
                  { label: 'In Progress', val: '3',   color: '#00B4D8' },
                  { label: 'Completed',   val: '847', color: '#10B981' },
                ].map(s => (
                  <div key={s.label} className="bg-[#0D1B2A] rounded-lg p-2 text-center">
                    <div className="font-bold text-base" style={{ color: s.color }}>{s.val}</div>
                    <div className="text-[9px] text-[#94A3B8] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* CTA */}
              <div className="px-3 pb-3">
                <div className="bg-[#00B4D8] text-white text-xs font-bold text-center py-2 rounded-lg">+ Start New Inspection</div>
              </div>
              {/* Vehicle rows */}
              <div className="border-t border-white/5">
                {[
                  { vin: '1HGCM82633A004352', make: 'Honda Accord',   status: 'Queued',      sc: '#94A3B8', sb: 'rgba(148,163,184,.1)' },
                  { vin: '2T1BURHE0JC037609', make: 'Toyota Corolla', status: 'In Progress', sc: '#00B4D8', sb: 'rgba(0,180,216,.1)' },
                  { vin: '5NPE24AF8FH002145', make: 'Hyundai Sonata', status: 'Completed',   sc: '#10B981', sb: 'rgba(16,185,129,.1)' },
                ].map((v, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 last:border-0">
                    <div>
                      <div className="text-white text-[10px] font-mono">{v.vin.slice(0, 13)}…</div>
                      <div className="text-[#94A3B8] text-[9px]">{v.make}</div>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: v.sc, backgroundColor: v.sb }}>{v.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Audience pills */}
        <div className="mt-16 border-t border-white/5 pt-8 text-center">
          <p className="text-[#94A3B8] text-xs uppercase tracking-widest mb-5">Purpose-built for teams that move, store, and inspect vehicles</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: Warehouse,      label: 'Storage Yards'   },
              { icon: Truck,          label: 'Tow & Impound'   },
              { icon: Network,        label: 'Fleet Managers'  },
              { icon: ClipboardCheck, label: 'Field Inspectors'},
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-sm text-[#94A3B8]">
                <Icon size={13} />{label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Pain Points ──────────────────────────────────────────────────────────
function PainPoints() {
  const hdr = useFadeIn()
  const cards = [
    { icon: DollarSign, color: '#F4A62A', title: 'Missed billing days are lost revenue.', body: "Manual storage tracking means gaps. Condition IQ's bulk billing wizard and date resolution tools catch every day, every vehicle, every cycle." },
    { icon: ShieldCheck, color: '#00B4D8', title: 'Undocumented damage is your liability.', body: 'Every vehicle that arrives needs a defensible record — photos, condition grades, inspector signature, timestamp. Done in 12 minutes from any phone.' },
    { icon: Map, color: '#F4A62A', title: "You can't manage what you can't see.", body: 'A real-time lot map shows every spot, every vehicle status, and daily revenue accruing — from check-in to pickup.' },
  ]
  return (
    <section id="features" className="bg-[#F0F4F8] py-20 px-5">
      <div className="max-w-5xl mx-auto">
        <div ref={hdr} className="fade-s text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0D1B2A]">Three Problems. One Platform.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((c, i) => (
            <FadeCard key={i} delay={i * 100}>
              <div className="bg-white rounded-2xl p-6 h-full border border-transparent transition-all duration-300 cyan-glow hover:border-[#00B4D8]/30">
                <c.icon size={28} style={{ color: c.color }} className="mb-4" />
                <h3 className="font-bold text-[#0D1B2A] text-lg mb-3">{c.title}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed">{c.body}</p>
              </div>
            </FadeCard>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Platform Workflow ────────────────────────────────────────────────────
function PlatformWorkflow() {
  const ref = useRef<HTMLDivElement>(null)
  const [lineOn, setLineOn] = useState(false)
  const [nodesOn, setNodesOn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setLineOn(true)
        setTimeout(() => setNodesOn(true), 700)
        obs.disconnect()
      }
    }, { threshold: 0.25 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const nodes = [
    { icon: ClipboardCheck, label: 'Inspect',  desc: '9-step mobile workflow'    },
    { icon: Map,            label: 'Lot Map',  desc: 'Real-time vehicle status'  },
    { icon: Receipt,        label: 'Billing',  desc: 'Bulk storage billing'      },
    { icon: Send,           label: 'Dispatch', desc: 'Remote inspector links'    },
    { icon: FileText,       label: 'Report',   desc: '7-page signed PDF'         },
  ]
  return (
    <section className="bg-[#0D1B2A] py-20 px-5">
      <div className="max-w-5xl mx-auto">
        <FadeCard>
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-3">Everything Your Operation Needs — In One Place</h2>
            <p className="text-[#94A3B8] text-base max-w-xl mx-auto">From a single lot to a multi-location fleet network. One workflow, consistent results, professional output.</p>
          </div>
        </FadeCard>
        <div ref={ref} className="relative">
          {/* SVG connecting line */}
          <div className="hidden md:block absolute inset-x-0 top-[38px] pointer-events-none" style={{ zIndex: 1 }}>
            <svg width="100%" height="20" viewBox="0 0 1000 20" preserveAspectRatio="none">
              <path
                d="M 80,10 L 920,10"
                fill="none"
                stroke="#00B4D8"
                strokeWidth="2"
                strokeDasharray="8 5"
                strokeDashoffset={lineOn ? 0 : 1200}
                style={lineOn ? { transition: 'stroke-dashoffset 1.2s ease-in-out' } : {}}
              />
            </svg>
          </div>
          {/* Nodes */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4" style={{ position: 'relative', zIndex: 2 }}>
            {nodes.map((n, i) => (
              <div
                key={i}
                className={`wf-node text-center ${nodesOn ? 'vis' : ''}`}
                style={nodesOn ? { transitionDelay: `${i * 110}ms` } : {}}
              >
                <div className="bg-[#1B2D40] border border-[#00B4D8]/30 rounded-xl p-4 inline-flex items-center justify-center mb-3">
                  <n.icon size={22} className="text-[#00B4D8]" />
                </div>
                <div className="text-white font-bold text-sm mb-1">{n.label}</div>
                <div className="text-[#94A3B8] text-xs">{n.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Audience Cards ───────────────────────────────────────────────────────
function AudienceCards() {
  const cards = [
    {
      icon: Warehouse, iconColor: '#00B4D8', title: 'Storage Yard Operators', tag: 'Starter · Growth · Pro',
      features: ['Visual lot map with real-time vehicle status', 'Bulk billing across all vehicles in one run', 'Arrival and departure inspection records', '9-step condition report with photos and grades', 'Invoice PDF generation per vehicle or batch'],
    },
    {
      icon: Truck, iconColor: '#F4A62A', title: 'Tow & Impound Operators', tag: 'Growth · Pro',
      features: ['Mobile-first inspection from any smartphone', 'Dispatch remote inspectors via one-time link', 'Photos, damage items, BOL, keys — all in one report', 'Inspector signature captured on-screen', 'Timestamped, defensible condition record'],
    },
    {
      icon: Network, iconColor: '#00B4D8', title: 'Fleet Managers & Transporters', tag: 'Pro · Enterprise',
      features: ['Multi-location lot map across your network', 'White-labeled reports under your brand', 'FMC account structure for client management', 'Locations database for vehicle tracking', 'Unlimited team members and custom templates'],
    },
  ]
  return (
    <section className="bg-[#F0F4F8] py-20 px-5">
      <div className="max-w-5xl mx-auto">
        <FadeCard>
          <h2 className="text-3xl font-bold text-[#0D1B2A] text-center mb-12">Built for Your Operation</h2>
        </FadeCard>
        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((c, i) => (
            <FadeCard key={i} delay={i * 100}>
              <div className="bg-white rounded-2xl overflow-hidden h-full border border-transparent transition-all card-lift cyan-glow hover:border-[#00B4D8]/30 flex flex-col">
                <div className="bg-[#1B2D40] p-5 flex items-center gap-3">
                  <c.icon size={20} style={{ color: c.iconColor }} />
                  <span className="text-white font-bold">{c.title}</span>
                </div>
                <div className="p-5 flex flex-col gap-2.5 flex-1">
                  {c.features.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-2.5 text-sm text-[#0D1B2A]">
                      <Check size={13} className="text-[#00B4D8] flex-shrink-0 mt-0.5" />{f}
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5">
                  <span className="text-xs text-[#94A3B8] bg-[#F0F4F8] px-3 py-1 rounded-full">{c.tag}</span>
                </div>
              </div>
            </FadeCard>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Stats Strip ──────────────────────────────────────────────────────────
function StatsStrip() {
  const ref = useRef<HTMLDivElement>(null)
  const s9  = useCounter(9,  1000)
  const s12 = useCounter(12, 1200)
  const [started, setStarted] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { s9.activate(); s12.activate(); setStarted(true); obs.disconnect() }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const stats = [
    { display: s9.count.toString(),  label: 'Inspection steps per vehicle', pct: s9.progress  },
    { display: `${s12.count} min`,   label: 'Average completion time',      pct: s12.progress },
    { display: 'Instant',            label: 'PDF report generation',        pct: started ? 1 : 0 },
    { display: '100%',               label: 'Mobile-first, works anywhere', pct: started ? 1 : 0 },
  ]
  return (
    <section ref={ref} className="bg-[#0D1B2A] py-16 px-5">
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
        {stats.map((s, i) => (
          <div key={i} className={`fade-s text-center ${started ? 'vis' : ''}`} style={started ? { transitionDelay: `${i * 100}ms` } : {}}>
            <div className="text-4xl font-bold text-white mb-1">{s.display}</div>
            <div className="text-[#94A3B8] text-xs mb-3">{s.label}</div>
            <div className="h-0.5 bg-[#1B2D40] rounded-full overflow-hidden">
              <div className="h-full bg-[#00B4D8] rounded-full transition-all duration-1000" style={{ width: `${s.pct * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── The Report ───────────────────────────────────────────────────────────
function TheReport() {
  const [revealed, setRevealed] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = cardRef.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => setRevealed(true), 1200); obs.disconnect() }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const bullets = [
    'VIN-decoded vehicle identification (year, make, model, trim)',
    'Timestamped photos from each inspection step',
    'Condition grades for exterior, interior, engine, and mechanical',
    'BOL verification and key count documentation',
    'Vehicle function and documentation checks',
    'Inspector name and completion timestamp',
    'Overall condition score on a 100-point scale',
  ]
  return (
    <section className="bg-[#F0F4F8] py-20 px-5">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-start">
        <FadeCard>
          <div className="text-[#00B4D8] text-xs font-bold uppercase tracking-widest mb-3">The Report</div>
          <h2 className="text-3xl font-bold text-[#0D1B2A] mb-4">Every Inspection Produces a Defensible Record.</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed mb-6">The moment an inspection is submitted, a professional 7-page PDF is generated automatically — timestamped, signed, and ready to share or download.</p>
          <div className="flex flex-col gap-3">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-[#0D1B2A]">
                <Check size={13} className="text-[#00B4D8] flex-shrink-0 mt-0.5" />{b}
              </div>
            ))}
          </div>
        </FadeCard>
        <FadeCard delay={150}>
          <div ref={cardRef} className="rounded-2xl overflow-hidden border border-[#00B4D8]/20" style={{ backgroundColor: '#1B2D40', boxShadow: '0 0 30px rgba(0,180,216,.1)', minHeight: 260 }}>
            <div className={`transition-opacity duration-500 ${revealed ? 'opacity-0 pointer-events-none' : 'opacity-100'} absolute`} style={revealed ? { position: 'static' } : {}}>
              {!revealed && (
                <div className="p-6 space-y-3">
                  <div className="shimmer-bg h-7 rounded-lg w-3/4" />
                  <div className="shimmer-bg h-4 rounded w-full" />
                  <div className="shimmer-bg h-4 rounded w-5/6" />
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {[1,2,3,4].map(k => <div key={k} className="shimmer-bg h-16 rounded-xl" />)}
                  </div>
                  <div className="shimmer-bg h-10 rounded-xl mt-2 w-2/3 mx-auto" />
                </div>
              )}
            </div>
            {revealed && (
              <div className="p-5 animate-in fade-in duration-500">
                <div className="bg-[#0D1B2A] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
                  <Car size={13} className="text-[#00B4D8]" />
                  <div>
                    <div className="text-[#94A3B8] text-[9px] uppercase tracking-wide">Vehicle Condition Report</div>
                    <div className="text-white text-xs font-bold">Condition IQ</div>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-white font-bold text-sm">2024 Tesla Model 3</div>
                  <div className="text-[#94A3B8] text-[10px] font-mono">5YJ3E1EA4PF123456</div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { l: 'EXTERIOR', s: '84' }, { l: 'INTERIOR', s: '92' },
                    { l: 'ENGINE',   s: '96' }, { l: 'OVERALL',  s: '88' },
                  ].map(x => (
                    <div key={x.l} className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                      <div className="text-[#00B4D8] font-bold text-lg">{x.s}</div>
                      <div className="text-[#94A3B8] text-[9px] uppercase tracking-wide">{x.l}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-[#10B981]/10 border border-[#10B981]/30 rounded-xl px-4 py-2.5 text-center">
                  <div className="text-[#10B981] text-xs font-bold flex items-center justify-center gap-2">
                    <Check size={12} />Report Generated Successfully
                  </div>
                </div>
              </div>
            )}
          </div>
        </FadeCard>
      </div>
    </section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    { key: 'demo',       name: 'Demo',       price: 'Free', sub: '3 one-time · No overage', featured: false,
      features: ['3 one-time reports', '1 user', 'PDF report output', 'No credit card'], cta: 'Try for Free' },
    { key: 'starter',    name: 'Starter',    price: '$99',  sub: '30/mo · $3.50 overage',  featured: false,
      features: ['30 reports/mo', '3 users', 'Email support', 'Unlimited report history', 'Dispatch (add-on $29)', 'Lot Billing (add-on $49)'], cta: 'Get Started' },
    { key: 'growth',     name: 'Growth',     price: '$199', sub: '75/mo · $3.00 overage',  featured: true,
      features: ['75 reports/mo', '5 users', 'Email + chat support', 'Dispatch included', 'Lot Billing included', 'Lot Map (add-on $59)', 'White Label PDF (add-on $49)'], cta: 'Get Started' },
    { key: 'pro',        name: 'Pro',        price: '$399', sub: '300/mo · $2.00 overage', featured: false,
      features: ['300 reports/mo', 'Unlimited users', 'Priority support', 'Lot Map included', 'White Label PDF', 'Custom inspection templates', 'Export & reporting', 'Multi-location ready'], cta: 'Get Started' },
  ]
  return (
    <section id="pricing" className="bg-[#0D1B2A] py-20 px-5">
      <div className="max-w-5xl mx-auto">
        <FadeCard>
          <div className="text-center mb-12">
            <div className="text-[#00B4D8] text-xs font-bold uppercase tracking-widest mb-3">Pricing</div>
            <h2 className="text-3xl font-bold text-white mb-3">Pricing That Scales With Your Operation</h2>
            <p className="text-[#94A3B8] text-sm max-w-xl mx-auto">You're only charged for completed reports. Drafts and in-progress inspections are always free.</p>
          </div>
        </FadeCard>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {plans.map((p, i) => (
            <FadeCard key={p.key} delay={i * 80}>
              <div className={`relative rounded-2xl p-5 border h-full flex flex-col card-lift ${p.featured ? 'border-[#F4A62A] bg-[#1B2D40] amber-pulse' : 'border-[#1B2D40] bg-[#1B2D40] hover:border-[#00B4D8]/40 cyan-glow'}`}>
                {p.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F4A62A] text-[#0D1B2A] text-[10px] font-bold px-3 py-1 rounded-full whitespace-nowrap">Most Popular</div>
                )}
                <div className="mb-4">
                  <div className="text-white font-bold text-base mb-1">{p.name}</div>
                  <div className="text-3xl font-bold text-white">{p.price}<span className="text-sm font-normal text-[#94A3B8]">{p.key !== 'demo' ? '/mo' : ''}</span></div>
                  <div className="text-[#94A3B8] text-xs mt-1">{p.sub}</div>
                </div>
                <div className="flex flex-col gap-2 flex-1 mb-5">
                  {p.features.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                      <Check size={11} className="text-[#00B4D8] flex-shrink-0 mt-0.5" />{f}
                    </div>
                  ))}
                </div>
                <Link href="/auth/signup" className={`block text-center text-xs font-bold py-2.5 rounded-xl transition-all ${p.featured ? 'bg-[#F4A62A] text-[#0D1B2A] hover:bg-amber-400' : 'border border-[#94A3B8]/30 text-[#94A3B8] hover:text-white hover:border-white/30'}`}>
                  {p.cta}
                </Link>
              </div>
            </FadeCard>
          ))}
        </div>
        {/* Enterprise */}
        <FadeCard>
          <div className="border border-[#1B2D40] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1B2D40]/40 mb-5">
            <div>
              <div className="text-white font-bold text-lg mb-1">Enterprise</div>
              <div className="text-[#94A3B8] text-sm">Custom pricing · Unlimited reports · Unlimited users · Multi-location · FMC/Locations account · API + custom integrations · Dedicated account manager</div>
            </div>
            <a href="mailto:hello@conditioniq.app" className="flex-shrink-0 bg-white/5 border border-white/10 text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-white/10 transition-all">Contact Sales</a>
          </div>
        </FadeCard>
        {/* Add-ons */}
        <FadeCard>
          <div className="bg-[#1B2D40] border border-[#00B4D8]/15 rounded-2xl p-6">
            <h3 className="text-white font-bold text-sm mb-4">Expand Your Plan with Add-Ons</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr>{['Add-On','Starter','Growth','Pro'].map(h => <th key={h} className="text-[#94A3B8] font-semibold pb-3 pr-6">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[
                    { n: 'Dispatch',        s: '$29/mo',  g: 'Included', p: 'Included' },
                    { n: 'Lot Billing',     s: '$49/mo',  g: 'Included', p: 'Included' },
                    { n: 'Lot Map',         s: '—',       g: '$59/mo',   p: 'Included' },
                    { n: 'White Label PDF', s: '—',       g: '$49/mo',   p: 'Included' },
                  ].map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="text-white py-2.5 pr-6 font-medium">{r.n}</td>
                      <td className={`py-2.5 pr-6 ${r.s === '—' ? 'text-[#94A3B8]/30' : 'text-[#94A3B8]'}`}>{r.s}</td>
                      <td className={`py-2.5 pr-6 ${r.g === 'Included' ? 'text-[#00B4D8] font-semibold' : 'text-[#94A3B8]'}`}>{r.g}</td>
                      <td className="py-2.5 text-[#00B4D8] font-semibold">{r.p}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[#94A3B8] text-xs mt-4 border-t border-white/5 pt-4">Growth + all add-ons = $307/mo. Pro at $399 includes everything plus 225 additional reports and unlimited team.</p>
          </div>
        </FadeCard>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'Do I need to install anything?',
    a: "No. Condition IQ runs entirely in your browser and on your phone's browser. No app download, no software installation, no IT setup required." },
  { q: 'What counts as a completed report?',
    a: "A report is counted when an inspection is submitted — not when it's started. Inspections abandoned or cancelled within 24 hours do not count against your monthly total." },
  { q: 'What happens when I hit my report limit?',
    a: "You'll receive a notification as you approach your limit. Additional reports are billed at your plan's overage rate — $3.50 on Starter, $3.00 on Growth, $2.00 on Pro. You're never locked out." },
  { q: 'Does the free demo require a credit card?',
    a: 'No. Your free demo includes 10 reports and 3 days of full access with no credit card required.' },
  { q: 'How do I add team members?',
    a: "Email the Condition IQ team and we'll add them within one business day. Limits: 3 on Starter, 5 on Growth, unlimited on Pro and Enterprise." },
  { q: "What's the difference between Dispatch and Send to Inspector?",
    a: 'Same feature. Dispatch is where you manage sent links and status. Send to Inspector is the action — generating a one-time link for an external person to complete an inspection.' },
  { q: 'Can I white label the reports?',
    a: 'Yes. White Label branding applies to all generated PDFs — logo, header color, accent stripe, business name. Available as an add-on on Growth, included on Pro and Enterprise.' },
  { q: 'Is there a contract?',
    a: 'No. Monthly plans are pay-as-you-go and can be cancelled at any time. Annual plans are billed upfront at a discount.' },
  { q: 'Can I export my data?',
    a: 'Yes, on Pro and Enterprise. CSV export is available for your full vehicle inventory and inspection history.' },
  { q: 'Can multiple inspectors use the same account?',
    a: "Yes. Your plan's team member limit controls how many users can be added. Pro and Enterprise have unlimited team members." },
]

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section id="faq" className="bg-[#F0F4F8] py-20 px-5">
      <div className="max-w-2xl mx-auto">
        <FadeCard>
          <div className="text-center mb-10">
            <div className="text-[#00B4D8] text-xs font-bold uppercase tracking-widest mb-3">FAQ</div>
            <h2 className="text-3xl font-bold text-[#0D1B2A]">Common Questions</h2>
          </div>
        </FadeCard>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <FadeCard key={i} delay={i * 25}>
              <div className="bg-white rounded-xl border border-[#E1E8F0] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className="text-[#0D1B2A] font-medium text-sm">{item.q}</span>
                  <ChevronDown size={16} className="text-[#94A3B8] flex-shrink-0 transition-transform duration-200" style={{ transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: open === i ? '300px' : '0px' }}>
                  <div className="px-5 pb-5 text-[#94A3B8] text-sm leading-relaxed border-t border-[#F0F4F8] pt-3">{item.a}</div>
                </div>
              </div>
            </FadeCard>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────
function FinalCTA() {
  const ref = useFadeIn()
  return (
    <section className="relative bg-[#0D1B2A] py-24 px-5 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{ width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(ellipse at center,rgba(0,180,216,.12) 0%,transparent 70%)' }} />
      </div>
      <div ref={ref} className="relative fade-s text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Start Documenting. Start Billing. Start Today.</h2>
        <p className="text-[#94A3B8] text-base mb-8">Generate 10 free reports — no credit card, no commitment. See the workflow, see the PDF, decide if it fits your operation.</p>
        <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-[#F4A62A] text-[#0D1B2A] font-bold px-8 py-4 rounded-2xl text-base hover:bg-amber-400 transition-all amber-glow mb-4">
          Get Started Free <ArrowRight size={18} />
        </Link>
        <p className="text-[#94A3B8] text-xs">No credit card · Cancel anytime · Setup in minutes</p>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────
function Footer() {
  const links = [
    { label: 'Features',   href: '#features'  },
    { label: 'Pricing',    href: '#pricing'   },
    { label: 'FAQ',        href: '#faq'       },
    { label: "What's New", href: '/changelog' },
    { label: 'Sign In',    href: '/auth/signin' },
  ]
  return (
    <footer className="bg-[#0D1B2A] border-t border-[#1B2D40] px-5 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <Link href="/" className="flex items-center gap-2">
            <Car size={15} className="text-[#00B4D8]" />
            <span className="font-bold text-white">Condition<span className="text-[#00B4D8]">IQ</span></span>
          </Link>
          <div className="flex flex-wrap justify-center gap-6">
            {links.map(l => (
              <Link key={l.label} href={l.href} className="text-sm text-[#94A3B8] hover:text-white transition-colors">{l.label}</Link>
            ))}
          </div>
          <div className="text-center md:text-right text-sm">
            <a href="mailto:hello@conditioniq.app" className="text-[#94A3B8] hover:text-white transition-colors block mb-1">hello@conditioniq.app</a>
            <span className="text-[#94A3B8]">conditioniq.app</span>
          </div>
        </div>
        <div className="border-t border-[#1B2D40] pt-6 text-center">
          <p className="text-[#94A3B8] text-xs">© 2026 Condition IQ LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <style>{CSS}</style>
      <Nav />
      <Hero />
      <PainPoints />
      <PlatformWorkflow />
      <AudienceCards />
      <StatsStrip />
      <TheReport />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  )
}

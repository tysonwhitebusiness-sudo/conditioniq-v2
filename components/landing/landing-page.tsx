'use client'

import Link from 'next/link'
import { CheckCircle, Shield, Clock, Star } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1e3a5f] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="text-xl font-bold">Condition IQ</div>
        <Link href="/login" className="bg-[#dc5010] hover:bg-orange-700 px-5 py-2.5 rounded-xl font-medium text-sm">
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-sm mb-8">
          <Star size={14} className="text-yellow-400" fill="currentColor" /> Vehicle Inspection Platform
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
          Professional Vehicle<br />Condition Reports
        </h1>
        <p className="text-xl text-blue-200 mb-10 max-w-2xl mx-auto">
          Mobile-first vehicle inspections with PDF reports, digital signatures, and chain of custody. Built for storage facilities and tow operators.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/login" className="bg-[#dc5010] hover:bg-orange-700 px-8 py-4 rounded-2xl font-semibold text-lg">
            Get Started
          </Link>
          <a href="mailto:hello@conditioniq.app" className="bg-white/10 hover:bg-white/20 px-8 py-4 rounded-2xl font-semibold text-lg">
            Request Demo
          </a>
        </div>
      </main>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Clock, title: '11-Minute Inspections', desc: 'Complete 9-step inspection in minutes with guided mobile workflow' },
          { icon: Shield, title: 'Legal Protection', desc: 'Timestamped photos, digital signatures, and GPS chain of custody' },
          { icon: CheckCircle, title: 'Instant PDF Reports', desc: '7-page professional PDF generated on device, no cloud processing' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-white/10 rounded-2xl p-6">
            <Icon size={24} className="text-[#dc5010] mb-3" />
            <h3 className="font-semibold text-lg mb-2">{title}</h3>
            <p className="text-blue-200 text-sm">{desc}</p>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Simple Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: 'Starter', price: 99,  reports: 30,  overage: 3.50 },
            { name: 'Growth',  price: 199, reports: 75,  overage: 3.00 },
            { name: 'Pro',     price: 399, reports: 300, overage: 2.00 },
          ].map(plan => (
            <div key={plan.name} className="bg-white/10 rounded-2xl p-5 text-center">
              <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
              <p className="text-3xl font-bold my-3">${plan.price}<span className="text-base font-normal text-blue-200">/mo</span></p>
              <p className="text-sm text-blue-200">{plan.reports} reports included</p>
              <p className="text-xs text-blue-300 mt-1">${plan.overage.toFixed(2)}/overage</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center pb-8 text-blue-300 text-sm space-y-1">
        <div>© 2025 Condition IQ · <a href="mailto:hello@conditioniq.app" className="underline">hello@conditioniq.app</a></div>
        <div><Link href="/changelog" className="underline opacity-60 hover:opacity-100">What's New</Link></div>
      </footer>
    </div>
  )
}

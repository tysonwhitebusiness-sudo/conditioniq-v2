'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MapPin, Send, Package, FileText, ChevronLeft } from 'lucide-react'

const ITEMS = [
  { href: '/fleet', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/fleet/locations', label: 'Locations', icon: MapPin },
  { href: '/fleet/dispatch', label: 'Dispatch', icon: Send },
  { href: '/fleet/inventory', label: 'Inventory', icon: Package },
  { href: '/fleet/reports', label: 'Reports', icon: FileText },
]

export default function FleetNav() {
  const pathname = usePathname()
  return (
    <nav className="bg-[#1e3a5f] text-white">
      <div className="px-4 flex items-center gap-2 h-14">
        <Link href="/" className="flex items-center gap-1 text-blue-200 hover:text-white text-sm mr-3">
          <ChevronLeft size={16} /> App
        </Link>
        <span className="text-blue-300/50">|</span>
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-white/10 text-white' : 'text-blue-200 hover:text-white'}`}>
              <Icon size={15} /> {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

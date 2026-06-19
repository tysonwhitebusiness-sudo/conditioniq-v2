'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/admin/crm', label: 'Dashboard', exact: true },
  { href: '/admin/crm/queue', label: 'Queue' },
  { href: '/admin/crm/leads', label: 'Leads' },
  { href: '/admin/crm/pipeline', label: 'Pipeline' },
  { href: '/admin/crm/inbound', label: 'Inbound' },
]

export default function CRMSubNav() {
  const pathname = usePathname()
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6">
      <div className="flex gap-1 max-w-7xl mx-auto">
        {ITEMS.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-[#dc5010] text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, Users, MessageSquare, ChevronLeft, ShieldCheck } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/admin/overview', label: 'Overview', icon: BarChart2 },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/users', label: 'Users & Roles', icon: ShieldCheck },
  { href: '/admin/crm', label: 'CRM', icon: MessageSquare },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 h-14">
        <Link href="/" className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mr-4">
          <ChevronLeft size={16} /> App
        </Link>
        <span className="text-gray-600">|</span>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${pathname.startsWith(href) ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Icon size={15} /> {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

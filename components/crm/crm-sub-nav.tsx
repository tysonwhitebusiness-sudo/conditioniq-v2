'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY, WHITE, GRAY_500, GRAY_300 } from '@/lib/design-tokens'

const ITEMS = [
  { href: '/admin/crm',          label: 'Dashboard', exact: true },
  { href: '/admin/crm/queue',    label: 'Queue'                  },
  { href: '/admin/crm/leads',    label: 'Leads'                  },
  { href: '/admin/crm/pipeline', label: 'Pipeline'               },
  { href: '/admin/crm/inbound',  label: 'Inbound'                },
]

export default function CRMSubNav() {
  const pathname = usePathname()
  return (
    <div style={{ background: WHITE, borderBottom: `1px solid ${GRAY_300}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', position: 'sticky', top: 60, zIndex: 20 }}>
      <div style={{ display: 'flex', minWidth: 'max-content', padding: '0 16px' }}>
        {ITEMS.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'inline-block', padding: '12px 16px',
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? PRIMARY : GRAY_500,
                borderBottom: active ? `2px solid ${PRIMARY}` : '2px solid transparent',
                textDecoration: 'none', whiteSpace: 'nowrap',
                transition: 'color 150ms',
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

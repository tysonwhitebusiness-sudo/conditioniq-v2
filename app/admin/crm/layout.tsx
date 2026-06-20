import CRMSubNav from '@/components/crm/crm-sub-nav'

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CRMSubNav />
      {children}
    </>
  )
}

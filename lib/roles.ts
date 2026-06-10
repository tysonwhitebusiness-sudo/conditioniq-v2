export type PlatformRole = 'super_admin' | 'user'
export type CompanyRole = 'admin' | 'inspector'

export function isSuperAdmin(platformRole: PlatformRole | null | undefined): boolean {
  return platformRole === 'super_admin'
}

export function isCompanyAdmin(companyRole: CompanyRole | null | undefined): boolean {
  return companyRole === 'admin'
}

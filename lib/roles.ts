export type PlatformRole = 'super_admin' | 'user'
export type CompanyRole = 'admin' | 'inspector'       // normalized value exposed by auth context
export type RawCompanyRole = CompanyRole | 'owner'    // raw value stored in company_members.role

export function isSuperAdmin(platformRole: PlatformRole | null | undefined): boolean {
  return platformRole === 'super_admin'
}

export function isCompanyAdmin(companyRole: CompanyRole | null | undefined): boolean {
  return companyRole === 'admin'
}

import { createClient } from '@/lib/supabase/client'

export interface Customer {
  id: string
  company_id: string
  name: string
  phone: string | null
  email: string | null
  billing_address: string | null
  account_number: string | null
  payment_terms: 'due_on_receipt' | 'net_15' | 'net_30' | null
  tax_exempt: boolean
  secondary_contact_name: string | null
  secondary_contact_phone: string | null
  secondary_contact_email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
}

export type CustomerFormData = Omit<Customer, 'id' | 'company_id' | 'created_at' | 'updated_at'>

export async function getCustomers(companyId: string): Promise<Customer[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .order('name')
  if (error) throw error
  return (data ?? []) as Customer[]
}

export async function getCustomerCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
  return count ?? 0
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()
  return data as Customer | null
}

export async function getCustomerVehicles(customerId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('storage_vehicles')
    .select('id, vin, year, make, model, lifecycle_status, status, arrived_at, released_at, latest_score, location:location_id(id, name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createCustomer(companyId: string, data: CustomerFormData): Promise<Customer> {
  const supabase = createClient()
  const { data: created, error } = await supabase
    .from('customers')
    .insert({ company_id: companyId, ...data })
    .select()
    .single()
  if (error) throw error
  return created as Customer
}

export async function updateCustomer(id: string, data: Partial<CustomerFormData>): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customers')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) throw error
}

export async function linkVehicleToCustomer(vehicleId: string, customerId: string | null): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('storage_vehicles')
    .update({ customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
  if (error) throw error
}

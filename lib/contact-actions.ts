'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function submitContactRequest(data: {
  name: string
  email: string
  company_name: string
  company_type: string
  message?: string
}) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('contact_requests').insert({
    name: data.name,
    email: data.email,
    company_name: data.company_name,
    company_type: data.company_type,
    message: data.message ?? null,
    source: 'landing_page',
    status: 'new',
  })
  if (error) throw new Error(error.message)
}

export async function getContactRequests() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('source', 'landing_page')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

export async function updateContactRequestStatus(id: string, status: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contact_requests')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

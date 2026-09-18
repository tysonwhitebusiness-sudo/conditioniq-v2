import type { Metadata } from 'next'
import LegalPage, { LEGAL_ENTITY, LEGAL_CONTACT } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Privacy Policy · Condition IQ' }

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what information ${LEGAL_ENTITY} collects when you use Condition IQ, how we use it, and the choices you have.`}
      sections={[
        { heading: 'What we collect', body: [
          'Account information: names, email addresses, company details and roles of the people using an account.',
          'Inspection data: vehicle details such as VIN, plate, odometer and condition answers, photos and videos, damage markings, signatures, and the time and, when your device shares it, the location of an inspection.',
          'Usage information: pages visited, device and browser type, and error reports, used to keep the service working and fast.',
        ] },
        { heading: 'How we use it', body: [
          'To provide the service: storing inspections, producing and sharing reports, billing, and supporting you. To keep the service secure and improve it. We do not sell personal information.',
        ] },
        { heading: 'AI processing', body: [
          'When AI assistance is on for your account, the photos and inspection answers needed for a feature are sent to Anthropic, PBC, which processes them to return a result to us. Under its commercial terms, Anthropic does not use this data to train its models. We keep a record of each AI request (which feature, when, and its cost) but not a separate copy of the content beyond the inspection itself.',
          'AI results are suggestions that an inspector confirms or rejects. An account admin can turn AI assistance off in Settings at any time.',
        ] },
        { heading: 'Who we share it with', body: [
          'Service providers that run the service on our behalf: Supabase (database and file storage), Vercel (hosting and page-performance analytics), Anthropic (AI processing, when on) and Sentry (error reporting). Each may only use the information to provide its service to us.',
          'People you share a report with, and anyone holding a report, who can confirm its identifying details (vehicle, VIN, dates, issuer and score) on the verify page. Photos and findings stay within your account.',
          'Authorities, when the law requires it.',
        ] },
        { heading: 'Retention', body: [
          'We keep inspection data for as long as your account is active, so reports stay available. When an account closes we delete or anonymise its data within a reasonable period, except where the law requires us to keep it.',
        ] },
        { heading: 'Your choices', body: [
          `You can ask to see, correct or delete personal information about you by writing to ${LEGAL_CONTACT}. If your information was recorded by a business using Condition IQ, we may refer your request to that business.`,
        ] },
        { heading: 'Security', body: [
          'Data is encrypted in transit and access is limited to the people and systems that need it. No system is perfectly secure; tell us at ' + LEGAL_CONTACT + ' if you find a problem.',
        ] },
        { heading: 'Changes', body: [
          'We will post changes here and tell account admins of material changes before they take effect.',
        ] },
      ]}
    />
  )
}

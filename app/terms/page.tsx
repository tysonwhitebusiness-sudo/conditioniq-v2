import type { Metadata } from 'next'
import LegalPage, { LEGAL_ENTITY, LEGAL_CONTACT } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: 'Terms of Service · Condition IQ' }

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your use of Condition IQ, a vehicle inspection and condition reporting service provided by ${LEGAL_ENTITY} ("we", "us"). By creating an account or using the service you agree to them on behalf of yourself and the business you represent.`}
      sections={[
        { heading: 'The service', body: [
          'Condition IQ lets your inspectors record a vehicle\'s condition with photos, answers and damage markings, and produces condition reports from what they record. You are responsible for the accuracy of what your inspectors record and for how you use the reports.',
        ] },
        { heading: 'Accounts', body: [
          'You are responsible for the people you invite to your account and for keeping sign-in details secure. Tell us promptly at ' + LEGAL_CONTACT + ' if you believe your account has been accessed without permission.',
        ] },
        { heading: 'Condition reports', body: [
          'A report records a vehicle\'s visible condition and the results of basic operating checks at the date and time shown. It is not a warranty, a guarantee, a safety or roadworthiness certification, or a repair estimate. A visual inspection cannot reliably identify mechanical, electrical, structural, driver-assistance or high-voltage battery conditions.',
          'Each report carries a report number and a link where anyone holding it can confirm the report is on file and check its identifying details. Photos and findings are shown only to your account.',
        ] },
        { heading: 'AI assistance', body: [
          'Some features use artificial intelligence provided by Anthropic, PBC: reading VINs and plates when other methods fail, checking photo quality, suggesting damage, and drafting the report summary and recommendations. To produce these results, the photos and inspection answers involved are sent to Anthropic for processing.',
          'AI output is a suggestion. It never records anything on its own: an inspector confirms, edits or rejects every suggestion, and reports state where AI assisted. AI can be wrong, and you remain responsible for what your reports say.',
          'AI assistance is on by default and an account admin can turn it off for the whole account in Settings. Turning it off does not affect any other part of the service.',
        ] },
        { heading: 'Your data', body: [
          'You own the inspection data and photos you upload. You grant us the rights needed to store, process and display them to provide the service, including processing by the providers named in our privacy policy. Our privacy policy explains how we handle personal information.',
        ] },
        { heading: 'Acceptable use', body: [
          'Do not use the service to break the law, to upload content you have no right to share, to interfere with the service, or to misrepresent a report as issued by someone else or as describing a different vehicle.',
        ] },
        { heading: 'Fees', body: [
          'Paid plans are billed as described at sign-up or in your plan settings. AI assistance is included in your plan at no additional charge unless we tell you otherwise in advance.',
        ] },
        { heading: 'Disclaimers and liability', body: [
          'The service is provided "as is". To the fullest extent the law allows, we disclaim implied warranties, and our total liability for any claim relating to the service is limited to the fees you paid us in the twelve months before the claim.',
        ] },
        { heading: 'Changes and termination', body: [
          'We may update these terms; we will tell account admins of material changes before they take effect. You may stop using the service at any time. We may suspend accounts that break these terms.',
        ] },
        { heading: 'Governing law', body: [
          'These terms are governed by the laws of the State of Missouri, United States, and disputes will be heard in the state or federal courts located in Missouri.',
        ] },
      ]}
    />
  )
}

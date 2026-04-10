import PublicLegalPage, { type LegalSection } from "../components/PublicLegalPage";

const CONTACT_EMAIL = "support@bantayfresh.com";
const LAST_UPDATED = "April 10, 2026";

const SECTIONS: LegalSection[] = [
  {
    body: [
      "If you want your BantayFresh account and related personal data deleted, send a request from the email address connected to your account whenever possible.",
      "We will verify the request before removing the account and associated data.",
    ],
    title: "How to Request Deletion",
  },
  {
    bullets: [
      "Email {CONTACT_EMAIL} with the subject line 'Data Deletion Request'.",
      "Include the email address tied to your BantayFresh account.",
      "If helpful, include your full name or any other details that can help us confirm ownership.",
      "We will confirm the request and proceed with deletion of eligible account data.",
    ],
    title: "Step-by-Step",
  },
  {
    bullets: [
      "Your profile information, including your name and avatar.",
      "Your pantry inventory items, notes, categories, quantities, expiry dates, and photos stored for your account.",
      "Your reminder preferences and other account settings.",
      "Your Supabase authentication record tied to the account.",
    ],
    title: "What We Delete",
  },
  {
    body: [
      "Some data may remain temporarily in backups, logs, or other systems for a limited time. Shared product barcode lookup data that is not tied to your account may also remain because it is used as a general reference for the app.",
      "If we are required to keep any information for legal, security, or fraud-prevention reasons, we will only retain it for as long as necessary.",
    ],
    title: "What May Remain",
  },
  {
    body: [
      "Once we finish processing your request, we will let you know that the account has been removed or explain if any limited records must be retained.",
      "If you later create a new account, it will be treated as a new profile.",
    ],
    title: "After Deletion",
  },
];

const formattedSections = SECTIONS.map((section) => ({
  ...section,
  body: section.body?.map((paragraph) =>
    paragraph.includes("{CONTACT_EMAIL}") ? paragraph.replace("{CONTACT_EMAIL}", CONTACT_EMAIL) : paragraph,
  ),
  bullets: section.bullets?.map((bullet) =>
    bullet.includes("{CONTACT_EMAIL}") ? bullet.replace("{CONTACT_EMAIL}", CONTACT_EMAIL) : bullet,
  ),
}));

export default function DataDeletionPage() {
  return (
    <PublicLegalPage
      contactEmail={CONTACT_EMAIL}
      eyebrow="BantayFresh Support"
      intro="Use this page to request deletion of your account and associated data."
      lastUpdated={LAST_UPDATED}
      sections={formattedSections}
      title="User Data Deletion"
    />
  );
}

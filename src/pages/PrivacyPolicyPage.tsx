import PublicLegalPage, { type LegalSection } from "../components/PublicLegalPage";

const CONTACT_EMAIL = "support@bantayfresh.com";
const LAST_UPDATED = "April 10, 2026";

const SECTIONS: LegalSection[] = [
  {
    body: [
      "BantayFresh is an inventory management app that helps users track pantry items, expiration dates, stock levels, barcode scans, profile information, and optional email reminders.",
      "This Privacy Policy explains what information we collect, how we use it, how it is shared, and the choices you have.",
    ],
    title: "Overview",
  },
  {
    bullets: [
      "Account details such as your name, email address, and authentication information through Supabase Auth.",
      "Profile data such as your display name, avatar, and reminder preferences.",
      "Inventory data such as item names, categories, quantities, expiry dates, notes, photos, inventory space, stock status, and barcode values.",
      "Barcode product lookup data used to help match scanned barcodes with product names.",
      "Device and browser information, plus anonymous analytics data where enabled.",
    ],
    title: "Information We Collect",
  },
  {
    bullets: [
      "Create and manage your account.",
      "Store and organize inventory items and related photos.",
      "Scan and identify barcodes.",
      "Send reminder notifications when enabled.",
      "Provide support, troubleshoot issues, and improve the app experience.",
    ],
    title: "How We Use Information",
  },
  {
    body: [
      "We use service providers to operate BantayFresh, including Supabase for authentication, database storage, and file storage. We may also use analytics providers to understand product usage.",
      "We do not sell your personal information.",
    ],
    title: "How We Share Information",
  },
  {
    body: [
      "Barcode scanning in the web app uses your browser camera when you choose to scan. The live camera stream is processed in the browser to detect barcodes and is not intentionally stored by BantayFresh unless you choose to upload an image or save related item data.",
      "If your device or browser does not support live scanning, you can enter the barcode manually.",
    ],
    title: "Camera and Barcode Scanning",
  },
  {
    body: [
      "If you enable email reminders, we use your email address and reminder preferences to support those notifications.",
      "You can update or disable reminder preferences in your profile settings.",
    ],
    title: "Email Notifications",
  },
  {
    body: [
      "We keep your account and inventory data for as long as needed to provide the service or until you request deletion.",
      "Some information may remain temporarily in backups, logs, or other systems for limited operational or legal purposes.",
    ],
    title: "Retention and Security",
  },
  {
    body: [
      "Depending on your location, you may have rights to access, correct, export, or delete your personal information.",
      "You can contact us at any time if you want help with those requests.",
    ],
    title: "Your Choices and Rights",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PublicLegalPage
      contactEmail={CONTACT_EMAIL}
      eyebrow="BantayFresh Privacy"
      intro="This page is written for public review and can be edited later if your data practices change."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      title="Privacy Policy"
    />
  );
}

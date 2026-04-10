import BrandMark from "./BrandMark";

export type LegalSection = {
  body?: string[];
  bullets?: string[];
  title: string;
};

type PublicLegalPageProps = {
  contactEmail: string;
  eyebrow: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
  title: string;
};

export default function PublicLegalPage({
  contactEmail,
  eyebrow,
  intro,
  lastUpdated,
  sections,
  title,
}: PublicLegalPageProps) {
  return (
    <div className="legal-page">
      <main className="legal-page__shell">
        <section className="legal-page__hero">
          <div className="legal-page__brand">
            <BrandMark fillParent showFrame={false} size={88} />
          </div>
          <div className="legal-page__hero-copy">
            <p className="legal-page__eyebrow">{eyebrow}</p>
            <h1 className="legal-page__title">{title}</h1>
            <p className="legal-page__meta">Last updated: {lastUpdated}</p>
          </div>
        </section>

        <p className="legal-page__intro">{intro}</p>

        <div className="legal-page__content">
          {sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2 className="legal-section__title">{section.title}</h2>
              {section.body?.map((paragraph) => (
                <p className="legal-section__body" key={paragraph}>
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="legal-section__list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <section className="legal-page__contact">
          <p className="legal-page__contact-label">Contact</p>
          <p className="legal-page__contact-body">
            If you have questions about this page or need help with your account
            data, email{" "}
            <a className="legal-page__contact-link" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}

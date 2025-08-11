import Script from 'next/script';

interface Breadcrumb { name: string; url: string; }
interface FAQItem { question: string; answer: string; }

interface PageProps {
  title?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  breadcrumbs?: Breadcrumb[];
  datePublished?: string;
  dateModified?: string;
  inLanguage?: string;
}

interface ArticleProps {
  title: string;
  description?: string;
  imageUrl?: string;
  datePublished: string;
  dateModified?: string;
}

interface DocumentationProps extends ArticleProps {
  section?: string;
  keywords?: string[];
}

/** Array items */
type ElementItem =
  | { type: 'article'; value: ArticleProps }
  | { type: 'documentation'; value: DocumentationProps }
  | { type: 'faq'; items: FAQItem[] };

interface StructuredDataProps {
  baseUrl?: string;               // default: https://www.databuddy.cc
  logoUrl?: string;               // default: {baseUrl}/logo.png

  page: PageProps;

  /** Mixed, repeatable elements */
  elements?: ElementItem[];
}

export function StructuredData({
  baseUrl = 'https://www.databuddy.cc',
  logoUrl = `${'https://www.databuddy.cc'}/logo.png`,
  page,
  elements = [],
}: StructuredDataProps) {
  const abs = (u?: string) => (!u ? undefined : u.startsWith('http') ? u : `${baseUrl}${u}`);
  const pageUrl = abs(page.url) ?? baseUrl;
  const lang = page.inLanguage || 'en';

  const orgId = `${baseUrl}#organization`;
  const websiteId = `${baseUrl}#website`;
  const webPageId = `${pageUrl}#webpage`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const faqId = `${pageUrl}#faq`;

  const graph: any[] = [];

  // Organization (always)
  graph.push({
    '@type': 'Organization',
    '@id': orgId,
    name: 'Databuddy',
    url: baseUrl,
    logo: { '@type': 'ImageObject', url: logoUrl },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'support@databuddy.cc',
    },
  });

  // WebSite (always)
  graph.push({
    '@type': 'WebSite',
    '@id': websiteId,
    url: baseUrl,
    name: 'Databuddy',
    publisher: { '@id': orgId },
  });

  // WebPage (anchor)
  graph.push({
    '@type': 'WebPage',
    '@id': webPageId,
    url: pageUrl,
    name: page.title,
    description: page.description,
    isPartOf: { '@id': websiteId },
    about: { '@id': orgId },
    breadcrumb: page.breadcrumbs?.length ? { '@id': breadcrumbId } : undefined,
    datePublished: page.datePublished,
    dateModified: page.dateModified || page.datePublished,
    image: page.imageUrl ? { '@type': 'ImageObject', url: abs(page.imageUrl) } : undefined,
    inLanguage: lang,
  });

  // Breadcrumbs
  if (page.breadcrumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: page.breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: abs(crumb.url),
      })),
    });
  }

  // Collect FAQ items across all elements, then emit once
  const faqItems: FAQItem[] = [];

  for (const el of elements) {
    if (el.type === 'article') {
      const a = el.value;
      graph.push({
        '@type':  ['BlogPosting', 'Article'],
        headline: a.title,
        description: a.description,
        url: pageUrl,
        mainEntityOfPage: { '@id': webPageId },
        isPartOf: { '@id': websiteId },
        author: { '@type': 'Organization', '@id': orgId, name: 'Databuddy' },
        publisher: { '@type': 'Organization', '@id': orgId },
        image: a.imageUrl ? { '@type': 'ImageObject', url: abs(a.imageUrl) } : undefined,
        datePublished: a.datePublished,
        dateModified: a.dateModified || a.datePublished,
        inLanguage: lang,
      });
    } else if (el.type === 'documentation') {
      const d = el.value;
      graph.push({
        '@type': ['TechArticle', 'Article'],
        headline: d.title,
        description: d.description,
        url: pageUrl,
        mainEntityOfPage: { '@id': webPageId },
        isPartOf: { '@id': websiteId },
        author: { '@type': 'Organization', '@id': orgId, name: 'Databuddy', url: baseUrl },
        publisher: { '@type': 'Organization', '@id': orgId },
        image: d.imageUrl ? { '@type': 'ImageObject', url: abs(d.imageUrl) } : undefined,
        datePublished: d.datePublished,
        dateModified: d.dateModified || d.datePublished,
        articleSection: d.section ?? 'Documentation',
        keywords: d.keywords ?? ['analytics', 'privacy-first', 'web analytics', 'GDPR', 'documentation'],
        inLanguage: lang,
      });
    } else if (el.type === 'faq') {
      faqItems.push(...el.items);
    }
  }

  if (faqItems.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': faqId,
      mainEntity: faqItems.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  const jsonLd = { '@context': 'https://schema.org', '@graph': graph.filter(Boolean) };

  return (
    <Script
      id="structured-data-page"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

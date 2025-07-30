import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How is Databuddy different from Google Analytics?",
    answer:
      "Databuddy is built for privacy-first analytics with no cookies required, making it GDPR and CCPA compliant out of the box. Our script is 65x faster than GA4, with a <1KB footprint that won't impact your Core Web Vitals.",
  },
  {
    question: "Do I need to add cookie consent banners?",
    answer:
      "No. Databuddy's analytics are completely cookieless, using privacy-preserving techniques to provide accurate analytics without tracking individual users. Our customers typically see a 30% increase in conversion rates after removing those intrusive cookie banners.",
  },
  {
    question: "What's included in the free plan?",
    answer:
      "Our free plan includes up to 50,000 monthly pageviews, real-time analytics, basic event tracking, and 30-day data retention. It's perfect for small websites, personal projects, or to test Databuddy before upgrading.",
  },
  {
    question: "How easy is it to implement Databuddy?",
    answer:
      "Implementation takes less than 5 minutes for most websites. Simply add our lightweight script to your site (we provide easy integrations for Next.js, React, WordPress, Shopify, and more), and you'll start seeing data immediately.",
  },
];

export default function FAQ() {
  return (
    <div className="flex flex-col px-5 lg:px-16 xl:px-16">
      <div className="flex-1 mt-12 mb-16 px-12 lg:px-14">
        <h1 className="text-[32px] max-w-sm mb-12">
          Questions we think you might like answers to
        </h1>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left font-medium text-lg">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}

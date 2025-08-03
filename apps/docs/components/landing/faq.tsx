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
    <div className="w-full max-w-5xl mx-auto">
      <div className="space-y-8 lg:space-y-12">
        {/* Header Section */}
        <div className="text-center lg:text-left">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-medium leading-tight max-w-2xl mx-auto lg:mx-0">
            Questions we think you might like answers to
          </h2>
        </div>

        {/* FAQ Accordion */}
        <div className="w-full">
          <Accordion type="single" collapsible className="w-full space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-background/50 hover:bg-background/80 transition-colors duration-200"
              >
                <AccordionTrigger className="text-left font-medium text-base sm:text-lg lg:text-xl py-4 sm:py-6 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm sm:text-base leading-relaxed pb-4 sm:pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

import { homeFaqItems } from "@/lib/home-seo";
import { FaqSection } from "./faq-section";

export default function FAQ() {
	return (
		<div className="w-full px-8">
			<FaqSection
				className="max-w-full"
				items={homeFaqItems}
				title="We give a FAQ"
			/>
		</div>
	);
}

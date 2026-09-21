"use client";

import { flush, track } from "@databuddy/sdk";
import { Button, CopyButton } from "@databuddy/ui";
import { usePathname } from "next/navigation";
import { CtaBanner, ctaBannerHeadingClass } from "@/components/footer";

const installSnippet = `<script
    src="https://cdn.databuddy.cc/databuddy.js"
    data-client-id="your-client-id"
    data-track-web-vitals
    crossorigin="anonymous"
    async
></script>`;

export function MidPageCta() {
	const pathname = usePathname();
	const page = pathname?.split("/").filter(Boolean)[0] ?? "home";

	return (
		<CtaBanner className="h-auto md:h-auto">
			<h2 className={ctaBannerHeadingClass}>
				Add one script and watch the first visit land.
			</h2>

			<div className="mb-6 flex items-start gap-3">
				<pre className="min-w-0 flex-1 overflow-x-auto rounded border border-white/15 bg-black/40 p-4 font-mono text-[13px] text-white/90 leading-relaxed">
					<code>{installSnippet}</code>
				</pre>
				<CopyButton
					className="shrink-0 border-white/20 bg-white/10 text-white hover:bg-white/20"
					label="Copy"
					onCopy={() => {
						track("install_snippet_copied", { page, placement: "closing_cta" });
						flush();
					}}
					value={installSnippet}
					variant="secondary"
				/>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<Button
					asChild
					className="bg-white text-black hover:bg-white/90"
					size="sm"
				>
					<a
						href="https://app.databuddy.cc/register"
						onClick={() => {
							track("signup_cta_clicked", { page, placement: "closing_cta" });
							flush();
						}}
					>
						Start free
					</a>
				</Button>
				<span className="text-sm text-white/70">
					Free up to 10,000 events/mo. No credit card required.
				</span>
			</div>
		</CtaBanner>
	);
}

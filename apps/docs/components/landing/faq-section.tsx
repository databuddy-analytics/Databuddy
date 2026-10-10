"use client";

import { PlusIcon } from "@databuddy/ui/icons";
import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";
import { type KeyboardEvent, useId, useState } from "react";
import { Branding } from "@/components/logo/branding";
import { SciFiCard } from "@/components/scifi-card";
import { cn } from "@/lib/utils";
import { SectionBullet } from "../icons/section-bullet";

interface FaqItem {
	answer: string;
	question: string;
}

interface FaqSectionProps {
	className?: string;
	items: FaqItem[];
	subtitle?: string;
	title?: string;
}

const SEND: Transition = { type: "spring", visualDuration: 0.42, bounce: 0.28 };
const SHIFT: Transition = { type: "spring", visualDuration: 0.4, bounce: 0.1 };
const LEAVE: Transition = { duration: 0.16, ease: [0.4, 0, 0.2, 1] };
const INSTANT: Transition = { duration: 0 };

const QUESTION = '[data-slot="faq-question"]';
const KEY_STEPS: Partial<
	Record<string, (index: number, last: number) => number>
> = {
	ArrowDown: (index) => index + 1,
	ArrowUp: (index) => index - 1,
	Home: () => 0,
	End: (_, last) => last,
};

function focusSiblingQuestion(event: KeyboardEvent<HTMLButtonElement>) {
	const step = KEY_STEPS[event.key];
	const thread = event.currentTarget.closest('[data-slot="faq-thread"]');
	if (!(step && thread)) {
		return;
	}
	const questions = [...thread.querySelectorAll<HTMLElement>(QUESTION)];
	const next = step(
		questions.indexOf(event.currentTarget),
		questions.length - 1
	);
	event.preventDefault();
	questions[(next + questions.length) % questions.length]?.focus();
}

export function FaqSection({
	title = "Frequently asked questions",
	subtitle,
	items,
	className,
}: FaqSectionProps) {
	const reduced = useReducedMotion() ?? false;
	const uid = useId();
	const [openQuestion, setOpenQuestion] = useState<string | null>(
		items[0]?.question ?? null
	);

	return (
		<div
			className={cn(
				"mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-12 lg:gap-12",
				className
			)}
		>
			<div className="flex items-start gap-2 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
				<span className="mt-1.5 hidden sm:block">
					<SectionBullet color="#CD5F20" />
				</span>
				<div>
					<h2 className="text-balance font-semibold text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl">
						{title}
					</h2>
					{subtitle ? (
						<p className="mt-3 max-w-md text-pretty text-muted-foreground text-sm sm:text-base">
							{subtitle}
						</p>
					) : null}
					<p className="mt-6 text-muted-foreground text-sm">
						Have a question that isn't listed here? Email{" "}
						<a
							className="text-foreground underline-offset-4 hover:underline"
							href="mailto:support@databuddy.cc"
						>
							support@databuddy.cc
						</a>
						.
					</p>
				</div>
			</div>

			<SciFiCard
				className="border border-border bg-card/40 lg:col-span-8"
				cornerOpacity="opacity-60"
			>
				<div className="flex h-12 items-center justify-between border-border border-b px-4 sm:px-6">
					<div className="flex items-center gap-2.5">
						<Branding heightPx={16} variant="logomark" />
						<span className="font-medium text-foreground text-sm">
							Databuddy
						</span>
					</div>
					<span className="text-muted-foreground text-xs">
						Select a question to see its answer
					</span>
				</div>

				<div
					className="relative flex flex-col gap-3 px-3 py-6 sm:p-6"
					data-slot="faq-thread"
				>
					{items.map((faq, index) => {
						const open = openQuestion === faq.question;
						const questionId = `${uid}-${index}-question`;
						const answerId = `${uid}-${index}-answer`;

						return (
							<div className="flex flex-col gap-2" key={questionId}>
								<motion.button
									aria-controls={open ? answerId : undefined}
									aria-expanded={open}
									className={cn(
										"group flex max-w-[88%] cursor-pointer items-center gap-3 self-start rounded-[20px] rounded-bl-[6px] py-2.5 pr-2.5 pl-4 text-left text-[15px] text-foreground leading-snug transition-colors duration-200 ease-in-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-[80%] sm:pl-5 sm:text-base",
										open ? "bg-accent" : "bg-muted"
									)}
									data-slot="faq-question"
									id={questionId}
									layout="position"
									layoutDependency={openQuestion}
									onClick={() => setOpenQuestion(open ? null : faq.question)}
									onKeyDown={focusSiblingQuestion}
									transition={reduced ? INSTANT : SHIFT}
									type="button"
									whileTap={reduced ? undefined : { scale: 0.97 }}
								>
									<span>{faq.question}</span>
									<span
										aria-hidden
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-full bg-background/60 transition-[color,transform] duration-200 ease-in-out group-hover:text-foreground",
											open ? "rotate-45 text-foreground" : "text-foreground/70"
										)}
									>
										<PlusIcon className="size-4" />
									</span>
								</motion.button>
								<AnimatePresence initial={false} mode="popLayout">
									{open ? (
										<motion.div
											animate={{ opacity: 1, scale: 1, y: 0 }}
											className="flex items-end justify-end gap-2.5"
											exit={{
												opacity: 0,
												scale: 0.9,
												transition: reduced ? INSTANT : LEAVE,
											}}
											initial={{ opacity: 0, scale: 0.6, y: 12 }}
											layout="position"
											layoutDependency={openQuestion}
											style={{ originX: 1, originY: 1 }}
											transition={reduced ? INSTANT : SEND}
										>
											<section
												aria-labelledby={questionId}
												className="max-w-[88%] rounded-[20px] rounded-br-[6px] bg-primary px-4 py-3 text-[15px] text-primary-foreground leading-relaxed sm:max-w-[80%] sm:px-5 sm:text-base"
												id={answerId}
											>
												{faq.answer}
											</section>
											<span
												aria-hidden
												className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background"
											>
												<Branding heightPx={14} variant="logomark" />
											</span>
										</motion.div>
									) : null}
								</AnimatePresence>
							</div>
						);
					})}
				</div>
			</SciFiCard>
		</div>
	);
}

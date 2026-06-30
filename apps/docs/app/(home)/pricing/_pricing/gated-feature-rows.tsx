import {
	FEATURE_METADATA,
	type FeatureLimit,
	GATED_FEATURES,
	type GatedFeatureId,
	HIDDEN_PRICING_FEATURES,
	PLAN_FEATURE_LIMITS,
	PLAN_HIERARCHY,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import { CheckIcon, XMarkIcon as XIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

/** Docs pricing column ids → shared plan ids (enterprise maps to Scale limits). */
const TABLE_PLAN_TO_SHARED: Record<string, PlanId> = {
	free: PLAN_IDS.FREE,
	hobby: PLAN_IDS.HOBBY,
	pro: PLAN_IDS.PRO,
	enterprise: PLAN_IDS.SCALE,
};

function isUnlimitedOnAllPlans(featureId: GatedFeatureId): boolean {
	for (const planId of PLAN_HIERARCHY) {
		const limit = PLAN_FEATURE_LIMITS[planId][featureId];
		if (limit !== "unlimited") {
			return false;
		}
	}
	return true;
}

function featuresWithLimits(): GatedFeatureId[] {
	return (Object.values(GATED_FEATURES) as GatedFeatureId[])
		.filter((id) => !HIDDEN_PRICING_FEATURES.includes(id))
		.filter((id) => !isUnlimitedOnAllPlans(id));
}

function featuresUnlimitedOnAll(): GatedFeatureId[] {
	return (Object.values(GATED_FEATURES) as GatedFeatureId[])
		.filter((id) => !HIDDEN_PRICING_FEATURES.includes(id))
		.filter((id) => isUnlimitedOnAllPlans(id));
}

function FeatureX() {
	return (
		<span className="inline-flex items-center justify-center">
			<XIcon className="size-4 text-muted-foreground" weight="bold" />
		</span>
	);
}

function FeatureCheck() {
	return (
		<span className="inline-flex items-center justify-center">
			<CheckIcon className="size-4 text-primary" weight="bold" />
		</span>
	);
}

function formatLimitCell(
	limit: FeatureLimit,
	featureId: GatedFeatureId
): ReactNode {
	if (limit === false) {
		return <FeatureX />;
	}
	if (limit === "unlimited") {
		return <FeatureCheck />;
	}
	const meta = FEATURE_METADATA[featureId];
	const unit = meta.unit;
	return (
		<div className="flex flex-col items-center gap-0.5">
			<span className="tabular-nums">{limit.toLocaleString()}</span>
			{unit ? (
				<span className="text-muted-foreground text-xs">{unit}</span>
			) : null}
		</div>
	);
}

function GatedLimitCell({
	featureId,
	tablePlanId,
}: {
	featureId: GatedFeatureId;
	tablePlanId: string;
}) {
	const sharedPlan = TABLE_PLAN_TO_SHARED[tablePlanId];
	if (sharedPlan == null) {
		return <FeatureX />;
	}
	const limit = PLAN_FEATURE_LIMITS[sharedPlan][featureId];
	return formatLimitCell(limit, featureId);
}

interface GatedFeaturePricingRowsProps {
	plans: Array<{ id: string }>;
	planTdClassName: (planId: string) => string;
}

const GATED_FEATURE_LINKS: Partial<Record<GatedFeatureId, string>> = {
	[GATED_FEATURES.FEATURE_FLAGS]: "/feature-flags",
	[GATED_FEATURES.WEB_VITALS]: "/web-vitals",
	[GATED_FEATURES.ERROR_TRACKING]: "/errors",
};

interface PlatformFeature {
	description: string;
	href?: string;
	name: string;
}

const PLATFORM_FEATURES: PlatformFeature[] = [
	{
		name: "Uptime Monitoring",
		description: "Endpoint checks, alerts, and status pages",
		href: "/uptime",
	},
	{
		name: "Short Links",
		description: "Branded links with click analytics and deep linking",
		href: "/links",
	},
	{
		name: "Revenue Tracking",
		description: "Stripe and Paddle revenue attribution",
	},
	{
		name: "Alerts & Notifications",
		description: "Traffic, error, and anomaly alerts",
	},
	{ name: "Team Members", description: "Unlimited seats on all plans" },
	{ name: "Websites", description: "Unlimited websites on all plans" },
	{ name: "API Access", description: "REST API with scoped API keys" },
	{ name: "Slack Integration", description: "Alerts and digests in Slack" },
	{ name: "SDKs", description: "JavaScript, React, Vue, Swift" },
];

function FeatureLabel({
	name,
	description,
	href,
}: {
	name: string;
	description: string;
	href?: string;
}) {
	if (href) {
		return (
			<Link
				className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
				href={href}
				title={description}
			>
				{name}
			</Link>
		);
	}
	return <span title={description}>{name}</span>;
}

function AllPlansCheckRow({
	name,
	description,
	href,
	plans,
	planTdClassName,
}: {
	name: string;
	description: string;
	href?: string;
	plans: Array<{ id: string }>;
	planTdClassName: (planId: string) => string;
}) {
	return (
		<tr className="border-border border-t hover:bg-card/10">
			<th
				className="px-4 py-3 text-left font-normal text-muted-foreground text-sm sm:px-5 lg:px-6"
				scope="row"
			>
				<FeatureLabel description={description} href={href} name={name} />
			</th>
			{plans.map((p) => (
				<td className={planTdClassName(p.id)} key={`${name}-${p.id}`}>
					<FeatureCheck />
				</td>
			))}
		</tr>
	);
}

export function GatedFeaturePricingRows({
	plans,
	planTdClassName,
}: GatedFeaturePricingRowsProps) {
	const limited = featuresWithLimits();
	const unlimited = featuresUnlimitedOnAll();
	const colSpan = 1 + plans.length;

	return (
		<>
			{limited.length > 0 && (
				<>
					<tr className="border-border border-t bg-muted/20">
						<td
							className="px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide sm:px-5 lg:px-6"
							colSpan={colSpan}
						>
							Analytics features
						</td>
					</tr>
					{limited.map((featureId) => {
						const meta = FEATURE_METADATA[featureId];
						const href = GATED_FEATURE_LINKS[featureId];
						return (
							<tr
								className="border-border border-t hover:bg-card/10"
								key={featureId}
							>
								<th
									className="px-4 py-3 text-left font-normal text-muted-foreground text-sm sm:px-5 lg:px-6"
									scope="row"
								>
									<FeatureLabel
										description={meta.description}
										href={href}
										name={meta.name}
									/>
								</th>
								{plans.map((p) => (
									<td
										className={planTdClassName(p.id)}
										key={`${featureId}-${p.id}`}
									>
										<GatedLimitCell featureId={featureId} tablePlanId={p.id} />
									</td>
								))}
							</tr>
						);
					})}
					{unlimited.map((featureId) => {
						const meta = FEATURE_METADATA[featureId];
						const href = GATED_FEATURE_LINKS[featureId];
						return (
							<AllPlansCheckRow
								description={meta.description}
								href={href}
								key={featureId}
								name={meta.name}
								plans={plans}
								planTdClassName={planTdClassName}
							/>
						);
					})}
				</>
			)}
			<tr className="border-border border-t bg-muted/20">
				<td
					className="px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide sm:px-5 lg:px-6"
					colSpan={colSpan}
				>
					Platform
				</td>
			</tr>
			{PLATFORM_FEATURES.map((feat) => (
				<AllPlansCheckRow
					description={feat.description}
					href={feat.href}
					key={feat.name}
					name={feat.name}
					plans={plans}
					planTdClassName={planTdClassName}
				/>
			))}
		</>
	);
}

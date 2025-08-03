import { Star } from '@phosphor-icons/react';
import type { Product, ProductItem } from 'autumn-js';
import { useCustomer, usePricingTable } from 'autumn-js/react';
import { Check, Loader2 } from 'lucide-react';
import React, { createContext, useCallback, useContext, useState } from 'react';
import { PricingTiersTooltip } from '@/app/(main)/billing/components/pricing-tiers-tooltip';
import AttachDialog from '@/components/autumn/attach-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getPricingTableContent } from '@/lib/autumn/pricing-table-content';
import { cn } from '@/lib/utils';

export default function PricingTable({
	productDetails,
}: {
	productDetails?: any;
}) {
	const { attach } = useCustomer();
	const [isAnnual, setIsAnnual] = useState(false);
	const { products, isLoading, error, refetch } = usePricingTable({
		productDetails,
	});

	const summary =
		'All plans include unlimited team members, full analytics, and priority support.';

	const PricingTableSkeleton = () => (
		<div
			aria-live="polite"
			className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
		>
			{[1, 2, 3].map((i) => (
				<div
					className="mx-auto flex h-64 w-full max-w-xl animate-pulse flex-col rounded-lg border bg-secondary/40 p-6"
					key={i}
				>
					<div className="mb-4 h-6 w-1/2 rounded bg-zinc-300/60" />
					<div className="mb-2 h-4 w-1/3 rounded bg-zinc-200/60" />
					<div className="mb-6 h-4 w-2/3 rounded bg-zinc-200/60" />
					<div className="flex-1" />
					<div className="mt-4 h-10 w-full rounded bg-zinc-300/60" />
				</div>
			))}
		</div>
	);

	const handleRetry = useCallback(() => {
		if (typeof refetch === 'function') {
			refetch();
		}
	}, [refetch]);

	if (isLoading) {
		return (
			<div
				aria-live="polite"
				className="flex h-full min-h-[300px] w-full flex-col items-center justify-center"
			>
				<PricingTableSkeleton />
				<span className="mt-4 text-muted-foreground text-sm">
					Loading pricing plans…
				</span>
			</div>
		);
	}

	if (error) {
		return (
			<div
				aria-live="polite"
				className="flex h-full min-h-[300px] w-full flex-col items-center justify-center"
			>
				<span className="mb-2 font-medium text-destructive">
					Something went wrong loading pricing plans.
				</span>
				<button
					aria-label="Retry loading pricing plans"
					className="mt-2 rounded bg-primary px-4 py-2 text-primary-foreground transition hover:bg-primary/90"
					onClick={handleRetry}
					type="button"
				>
					Retry
				</button>
			</div>
		);
	}

	const intervals = Array.from(
		new Set(
			products?.map((p) => p.properties?.interval_group).filter((i) => !!i)
		)
	);

	const multiInterval = intervals.length > 1;

	const intervalFilter = (product: Product) => {
		if (!product.properties?.interval_group) {
			return true;
		}

		if (multiInterval) {
			if (isAnnual) {
				return product.properties?.interval_group === 'year';
			}
			return product.properties?.interval_group === 'month';
		}

		return true;
	};

	return (
		<section aria-labelledby="pricing-table-title" className={cn('root')}>
			<div className="mx-auto mb-4 flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div
					className="flex-1 rounded border bg-secondary/60 p-4 text-center font-medium text-base text-foreground shadow-sm sm:text-left"
					id="pricing-table-title"
				>
					{summary}
				</div>
				{multiInterval && (
					<div className="mt-2 flex items-center justify-center sm:mt-0">
						<div className="flex rounded-full border bg-muted p-1">
							<button
								aria-pressed={!isAnnual}
								className={cn(
									'rounded-full px-4 py-1 font-medium text-sm transition focus:outline-none',
									isAnnual
										? 'bg-transparent text-foreground'
										: 'bg-primary text-primary-foreground shadow'
								)}
								onClick={() => setIsAnnual(false)}
								type="button"
							>
								Monthly
							</button>
							<button
								aria-pressed={isAnnual}
								className={cn(
									'rounded-full px-4 py-1 font-medium text-sm transition focus:outline-none',
									isAnnual
										? 'bg-primary text-primary-foreground shadow'
										: 'bg-transparent text-foreground'
								)}
								onClick={() => setIsAnnual(true)}
								type="button"
							>
								Annual
							</button>
						</div>
					</div>
				)}
			</div>
			{products && (
				<PricingTableContainer
					isAnnualToggle={isAnnual}
					multiInterval={multiInterval}
					products={products}
					setIsAnnualToggle={setIsAnnual}
				>
					{products
						.filter((p) => p.id !== 'free' && intervalFilter(p))
						.map((plan) => (
							<PricingCard
								buttonProps={{
									disabled:
										plan.scenario === 'active' || plan.scenario === 'scheduled',
									onClick: async () => {
										await attach({
											productId: plan.id,
											dialog: AttachDialog,
										});
									},
									'aria-label': plan.display?.recommend_text
										? `Select recommended plan: ${plan.display?.name}`
										: `Select plan: ${plan.display?.name}`,
								}}
								key={plan.id}
								productId={plan.id}
							/>
						))}
				</PricingTableContainer>
			)}
		</section>
	);
}

const PricingTableContext = createContext<{
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
	products: Product[];
	showFeatures: boolean;
}>({
	isAnnualToggle: false,
	setIsAnnualToggle: () => {
		throw new Error('setIsAnnualToggle is not implemented');
	},
	products: [],
	showFeatures: true,
});

export const usePricingTableContext = (componentName: string) => {
	const context = useContext(PricingTableContext);

	if (context === undefined) {
		throw new Error(`${componentName} must be used within <PricingTable />`);
	}

	return context;
};

export const PricingTableContainer = ({
	children,
	products,
	showFeatures = true,
	className,
	isAnnualToggle,
	setIsAnnualToggle,
	multiInterval,
}: {
	children?: React.ReactNode;
	products?: Product[];
	showFeatures?: boolean;
	className?: string;
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
	multiInterval: boolean;
}) => {
	if (!products) {
		throw new Error('products is required in <PricingTable />');
	}

	if (products.length === 0) {
		return null;
	}

	const hasRecommended = products?.some((p) => p.display?.recommend_text);
	return (
		<PricingTableContext.Provider
			value={{ isAnnualToggle, setIsAnnualToggle, products, showFeatures }}
		>
			<div
				className={cn('flex flex-col items-center', hasRecommended && '!py-10')}
			>
				{multiInterval && (
					<div
						className={cn(
							products.some((p) => p.display?.recommend_text) && 'mb-8'
						)}
					>
						<AnnualSwitch
							isAnnualToggle={isAnnualToggle}
							setIsAnnualToggle={setIsAnnualToggle}
						/>
					</div>
				)}
				<div
					className={cn(
						'grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]',
						className
					)}
				>
					{children}
				</div>
			</div>
		</PricingTableContext.Provider>
	);
};

interface PricingCardProps {
	productId: string;
	showFeatures?: boolean;
	className?: string;
	onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
	buttonProps?: React.ComponentProps<'button'>;
}

export const PricingCard = ({
	productId,
	className,
	buttonProps,
}: PricingCardProps) => {
	const { products, showFeatures } = usePricingTableContext('PricingCard');

	const product = products.find((p) => p.id === productId);

	if (!product) {
		throw new Error(`Product with id ${productId} not found`);
	}

	const { name, display: productDisplay } = product;

	const { buttonText } = getPricingTableContent(product);
	const isRecommended = !!productDisplay?.recommend_text;
	const mainPriceDisplay = product.properties?.is_free
		? {
				primary_text: 'Free',
			}
		: product.items[0].display;

	let supportLevel: { display: { primary_text: string } } | null = null;
	switch (product.id) {
		case 'free':
			supportLevel = { display: { primary_text: 'Community Support' } };
			break;
		case 'hobby':
			supportLevel = { display: { primary_text: 'Email Support' } };
			break;
		case 'pro':
			supportLevel = { display: { primary_text: 'Priority Email Support' } };
			break;
		case 'scale':
		case 'buddy':
			supportLevel = {
				display: { primary_text: 'Priority Email + Slack Support' },
			};
			break;
		default:
			supportLevel = null;
	}

	const extraFeatures: { display: { primary_text: string } }[] = [
		'scale',
		'buddy',
	].includes(product.id)
		? [
				{ display: { primary_text: 'White Glove Onboarding' } },
				{ display: { primary_text: 'Beta/Early Access' } },
			]
		: [];

	const featureItems = product.properties?.is_free
		? supportLevel
			? [...product.items, ...extraFeatures, supportLevel]
			: [...product.items, ...extraFeatures]
		: supportLevel
			? [...product.items.slice(1), ...extraFeatures, supportLevel]
			: [...product.items.slice(1), ...extraFeatures];

	return (
		<div
			className={cn(
				'relative h-full w-full max-w-xl rounded-lg border py-6 text-foreground shadow-sm transition-all duration-300',
				isRecommended &&
					'lg:-translate-y-6 animate-recommended-glow border-primary bg-secondary/40 lg:h-[calc(100%+48px)] lg:shadow-lg dark:shadow-zinc-800/80',
				className
			)}
		>
			{isRecommended && (
				<RecommendedBadge recommended={productDisplay?.recommend_text ?? ''} />
			)}
			<div
				className={cn(
					'flex h-full flex-grow flex-col',
					isRecommended && 'lg:translate-y-6'
				)}
			>
				<div className="h-full">
					<div className="flex flex-col">
						<div className="pb-4">
							<h2 className="truncate px-6 font-semibold text-2xl">
								{productDisplay?.name || name}
							</h2>
							{productDisplay?.description && (
								<div className="h-8 px-6 text-muted-foreground text-sm">
									<p className="line-clamp-2">{productDisplay?.description}</p>
								</div>
							)}
						</div>
						<div className="mb-2">
							<h3 className="mb-4 flex h-16 items-center border-y bg-secondary/40 px-6 font-semibold">
								<div className="line-clamp-2">
									{mainPriceDisplay?.primary_text}{' '}
									{mainPriceDisplay?.secondary_text && (
										<span className="mt-1 font-normal text-muted-foreground">
											{mainPriceDisplay?.secondary_text}
										</span>
									)}
								</div>
							</h3>
						</div>
					</div>
					{showFeatures && featureItems.length > 0 && (
						<div className="mb-6 flex-grow px-6">
							<PricingFeatureList
								everythingFrom={product.display?.everything_from}
								items={featureItems}
								showIcon={true}
							/>
						</div>
					)}
				</div>
				<div className={cn(' px-6 ', isRecommended && 'lg:-translate-y-12')}>
					<PricingCardButton
						recommended={!!productDisplay?.recommend_text}
						{...buttonProps}
					>
						{buttonText}
					</PricingCardButton>
				</div>
			</div>
		</div>
	);
};

export const PricingFeatureList = ({
	items,
	showIcon = true,
	everythingFrom,
	className,
}: {
	items: ProductItem[];
	showIcon?: boolean;
	everythingFrom?: string;
	className?: string;
}) => {
	return (
		<div className={cn('flex-grow', className)}>
			{everythingFrom && (
				<p className="mb-4 text-sm">Everything from {everythingFrom}, plus:</p>
			)}
			<div className="space-y-3">
				{items.map((item) => {
					const featureItem = item as any;
					let secondaryText = featureItem.display?.secondary_text;

					const hasTiers =
						featureItem.type === 'priced_feature' &&
						featureItem.tiers?.length > 0;

					if (hasTiers) {
						secondaryText = 'Usage-based pricing';
					}

					return (
						<div
							className="flex items-start gap-2 text-sm"
							key={featureItem.display?.primary_text}
						>
							{showIcon && (
								<Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
							)}
							<div className="flex flex-col">
								<span>{featureItem.display?.primary_text}</span>
								<div className="flex items-center gap-1">
									{secondaryText && (
										<span className="text-muted-foreground text-sm">
											{secondaryText}
										</span>
									)}
									{hasTiers && (
										<PricingTiersTooltip
											showText={false}
											tiers={featureItem.tiers}
										/>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export interface PricingCardButtonProps extends React.ComponentProps<'button'> {
	recommended?: boolean;
	buttonUrl?: string;
}

export const PricingCardButton = React.forwardRef<
	HTMLButtonElement,
	PricingCardButtonProps
>(({ recommended, children, className, onClick, ...props }, ref) => {
	const [loading, setLoading] = useState(false);

	const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
		setLoading(true);
		try {
			await onClick?.(e);
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Button
			className={cn(
				'group relative w-full overflow-hidden rounded-lg border px-4 py-3 transition-all duration-300 hover:brightness-90',
				className
			)}
			{...props}
			disabled={loading || props.disabled}
			onClick={handleClick}
			ref={ref}
			variant={recommended ? 'default' : 'secondary'}
		>
			{loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				<>
					<div className="flex w-full items-center justify-between transition-transform duration-300 group-hover:translate-y-[-130%]">
						<span>{children}</span>
						<span className="text-sm">→</span>
					</div>
					<div className="absolute mt-2 flex w-full translate-y-[130%] items-center justify-between px-4 transition-transform duration-300 group-hover:mt-0 group-hover:translate-y-0">
						<span>{children}</span>
						<span className="text-sm">→</span>
					</div>
				</>
			)}
		</Button>
	);
});
PricingCardButton.displayName = 'PricingCardButton';

export const AnnualSwitch = ({
	isAnnualToggle,
	setIsAnnualToggle,
}: {
	isAnnualToggle: boolean;
	setIsAnnualToggle: (isAnnual: boolean) => void;
}) => {
	return (
		<div className="mb-4 flex flex-col items-center space-y-1">
			<span
				className="font-medium text-foreground text-sm"
				id="billing-interval-label"
			>
				Choose billing interval
			</span>
			<div className="flex items-center space-x-2">
				<span className="text-muted-foreground text-sm">Monthly</span>
				<Switch
					aria-label="Toggle annual billing"
					checked={isAnnualToggle}
					id="annual-billing"
					onCheckedChange={setIsAnnualToggle}
				>
					<span className="sr-only">Toggle annual billing</span>
				</Switch>
				<span className="text-muted-foreground text-sm">Annual</span>
			</div>
		</div>
	);
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
	return (
		<div className="absolute top-[-1px] right-[-1px] flex animate-bounce-in items-center gap-1 rounded-bl-lg border border-primary bg-primary/90 px-3 font-medium text-primary-foreground text-sm shadow-md lg:top-4 lg:right-4 lg:rounded-full lg:py-0.5">
			<Star aria-hidden="true" className="h-4 w-4" weight="duotone" />
			<span>{recommended}</span>
		</div>
	);
};

<style global jsx>{`
  @keyframes recommended-glow {
    0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
    70% { box-shadow: 0 0 16px 8px rgba(99, 102, 241, 0.15); }
    100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
  }
  .animate-recommended-glow {
    animation: recommended-glow 2.5s infinite;
  }
  @keyframes bounce-in {
    0% { transform: scale(0.8); opacity: 0; }
    60% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); }
  }
  .animate-bounce-in {
    animation: bounce-in 0.7s cubic-bezier(0.68, -0.55, 0.27, 1.55);
  }
`}</style>;

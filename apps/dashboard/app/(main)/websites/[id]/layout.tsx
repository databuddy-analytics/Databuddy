'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import {
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from '@/stores/jotai/filterAtoms';
import { AnalyticsToolbar } from './_components/analytics-toolbar';
import { FiltersSection } from './_components/filters-section';

interface WebsiteLayoutProps {
	children: React.ReactNode;
}

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const queryClient = useQueryClient();
	const { isTrackingSetup } = useTrackingSetup(id as string);
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters, setSelectedFilters] = useAtom(
		dynamicQueryFiltersAtom
	);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ['websites', id] }),
				queryClient.invalidateQueries({
					queryKey: ['websites', 'isTrackingSetup', id],
				}),
				queryClient.invalidateQueries({ queryKey: ['dynamic-query', id] }),
				queryClient.invalidateQueries({
					queryKey: ['batch-dynamic-query', id],
				}),
			]);
			toast.success('Data refreshed');
		} catch {
			toast.error('Failed to refresh data');
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
			{/* Analytics toolbar and filters shared across all website pages */}
			{isTrackingSetup && (
				<div className="space-y-4">
					<AnalyticsToolbar
						isRefreshing={isRefreshing}
						onRefresh={handleRefresh}
					/>
					<FiltersSection
						onFiltersChange={setSelectedFilters}
						selectedFilters={selectedFilters}
					/>
				</div>
			)}

			{/* Page content */}
			{children}
		</div>
	);
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { useParams, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useTrackingSetup } from '@/hooks/use-tracking-setup';
import {
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from '@/stores/jotai/filterAtoms';
import { AnalyticsToolbar } from './_components/analytics-toolbar';

interface WebsiteLayoutProps {
	children: React.ReactNode;
}

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { isTrackingSetup } = useTrackingSetup(id as string);
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters, setSelectedFilters] = useAtom(
		dynamicQueryFiltersAtom
	);

	// Check if current page is sessions page
	const isSessionsPage = pathname?.includes('/sessions');

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
			{/* Analytics toolbar shared across all website pages except sessions */}
			{isTrackingSetup && !isSessionsPage && (
				<AnalyticsToolbar
					isRefreshing={isRefreshing}
					onFiltersChange={setSelectedFilters}
					onRefresh={handleRefresh}
					selectedFilters={selectedFilters}
				/>
			)}

			{/* Page content */}
			{children}
		</div>
	);
}

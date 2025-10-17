import { atom } from 'jotai';
import type { WebsiteDataTabProps } from '@/app/(main)/websites/[id]/_components/utils/types';

export const websiteIdAtom = atom<string | null>(null);
export const websiteDataAtom = atom<WebsiteDataTabProps['websiteData'] | null>(
	null
);
export const dateRangeAtom = atom<{
	start_date: string;
	end_date: string;
	granularity: string;
} | null>(null);

import { cache } from 'react';

import type {
	MarbleAuthorList,
	MarbleCategoryList,
	MarblePost,
	MarblePostList,
	MarbleTagList,
} from '@/types/post';

type FetchError = { error: true; status: number; statusText: string };

async function fetchFromMarble<T>(
	endpoint: string,
	options?: { returnStatusOnError?: boolean }
): Promise<T | FetchError> {
	try {
		const response = await fetch(
			`${process.env.MARBLE_API_URL}/${process.env.MARBLE_WORKSPACE_KEY}/${endpoint}`
		);
		if (!response.ok) {
			if (options?.returnStatusOnError) {
				return {
					error: true,
					status: response.status,
					statusText: response.statusText,
				};
			}
			throw new Error(
				`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`
			);
		}
		return (await response.json()) as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		if (options?.returnStatusOnError) {
			return {
				error: true,
				status: 500,
				statusText: 'Internal Error',
			};
		}
		throw error;
	}
}

export const getPosts = cache(() => {
	return fetchFromMarble<MarblePostList>('posts');
});

export const getTags = cache(() => {
	return fetchFromMarble<MarbleTagList>('tags');
});

export const getSinglePost = cache((slug: string) => {
	return fetchFromMarble<MarblePost>(`posts/${slug}`, {
		returnStatusOnError: true,
	});
});

export const getCategories = cache(() => {
	return fetchFromMarble<MarbleCategoryList>('categories');
});

export const getAuthors = cache(() => {
	return fetchFromMarble<MarbleAuthorList>('authors');
});

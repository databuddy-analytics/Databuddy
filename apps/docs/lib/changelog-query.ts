import { cache } from "react";

export interface NotraPost {
	id: string;
	title: string;
	content: string;
	markdown: string;
	contentType: string;
	sourceMetadata: unknown;
	status: "draft" | "published";
	createdAt: string;
	updatedAt: string;
}

export interface NotraPagination {
	limit: number;
	currentPage: number;
	nextPage: number | null;
	previousPage: number | null;
	totalPages: number;
	totalItems: number;
}

export interface NotraPostListResponse {
	posts: NotraPost[];
	pagination: NotraPagination;
	metadata?: {
		status: string[];
	};
}

export interface NotraPostResponse {
	post: NotraPost;
}

interface FetchError {
	error: true;
	status: number;
	statusText: string;
}

async function fetchFromNotra<T>(endpoint: string): Promise<T | FetchError> {
	try {
		const apiKey = process.env.NOTRA_API_KEY;
		const orgId = process.env.NOTRA_ORGANIZATION_ID;

		if (!(apiKey && orgId)) {
			return {
				error: true,
				status: 500,
				statusText:
					"NOTRA_API_KEY and NOTRA_ORGANIZATION_ID environment variables are required",
			};
		}

		const response = await fetch(
			`https://api.usenotra.com/v1/${orgId}/${endpoint}`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				next: { revalidate: 3600 },
			}
		);

		if (!response.ok) {
			return {
				error: true,
				status: response.status,
				statusText: response.statusText,
			};
		}

		return (await response.json()) as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint} from Notra:`, error);
		return {
			error: true,
			status: 500,
			statusText: "Internal Error",
		};
	}
}

export const getChangelogs = cache((page = 1, limit = 100) =>
	fetchFromNotra<NotraPostListResponse>(
		`posts?status=published&sort=desc&page=${page}&limit=${limit}`
	)
);

export const getChangelogPost = cache((postId: string) =>
	fetchFromNotra<NotraPostResponse>(`posts/${postId}`)
);

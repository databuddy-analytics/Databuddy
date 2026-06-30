import { cache } from "react";

const DEFAULT_MARBLE_API_URL = "https://api.marblecms.com/v1";
const API_VERSION_PATH_REGEX = /\/v\d+$/;
const LEADING_SLASHES_REGEX = /^\/+/;
const TRAILING_SLASHES_REGEX = /\/+$/;

interface FetchError {
	error: true;
	status: number;
	statusText: string;
}

export interface MarbleAuthor {
	bio?: string | null;
	id: string;
	image?: string | null;
	name: string;
	role?: string | null;
	slug?: string;
	socials?: { platform: string; url: string }[];
}

export interface MarbleCategory {
	description?: string | null;
	id: string;
	name: string;
	slug: string;
}

export interface MarbleTag {
	description?: string | null;
	id: string;
	name: string;
	slug: string;
}

export interface Post {
	attribution?: { author: string; url: string } | null;
	authors: MarbleAuthor[];
	category?: MarbleCategory | null;
	content: string;
	coverImage?: string | null;
	description: string;
	featured?: boolean;
	fields?: Record<string, unknown>;
	id: string;
	publishedAt: Date | string;
	slug: string;
	status?: "published" | "draft" | string;
	tags?: MarbleTag[];
	title: string;
	updatedAt?: Date | string;
}

export interface MarblePostList {
	pagination?: {
		currentPage: number;
		limit: number;
		nextPage: number | null;
		previousPage: number | null;
		totalItems: number;
		totalPages: number;
	};
	posts: Post[];
}

export interface MarblePost {
	post: Post;
}

interface MarbleTagList {
	tags: MarbleTag[];
}

interface MarbleCategoryList {
	categories: MarbleCategory[];
}

interface MarbleAuthorList {
	authors: MarbleAuthor[];
}

type MarbleRequest =
	| {
			headers: HeadersInit;
			url: string;
	  }
	| FetchError;

export function normalizeMarbleApiUrl(value: string | undefined): string {
	const trimmedValue = value?.trim();
	const baseUrl = (trimmedValue || DEFAULT_MARBLE_API_URL).replace(
		TRAILING_SLASHES_REGEX,
		""
	);
	return API_VERSION_PATH_REGEX.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

export function createMarbleRequest(
	endpoint: string,
	env: Record<string, string | undefined> = process.env
): MarbleRequest {
	const apiKey = env.MARBLE_API_KEY?.trim();
	const workspaceKey = env.MARBLE_WORKSPACE_KEY?.trim();
	const apiUrl = normalizeMarbleApiUrl(env.MARBLE_API_URL);
	const normalizedEndpoint = endpoint.replace(LEADING_SLASHES_REGEX, "");

	if (apiKey) {
		return {
			headers: {
				Authorization: apiKey,
			},
			url: `${apiUrl}/${normalizedEndpoint}`,
		};
	}

	if (workspaceKey) {
		return {
			headers: {},
			url: `${apiUrl}/${encodeURIComponent(workspaceKey)}/${normalizedEndpoint}`,
		};
	}

	return {
		error: true,
		status: 500,
		statusText: "Environment variables not configured",
	};
}

async function fetchFromMarble<T>(
	endpoint: string,
	options?: { returnStatusOnError?: boolean }
): Promise<T | FetchError> {
	try {
		const request = createMarbleRequest(endpoint);
		if ("error" in request) {
			if (options?.returnStatusOnError) {
				return request;
			}
			throw new Error(
				"MARBLE_API_KEY or MARBLE_WORKSPACE_KEY environment variable is required"
			);
		}

		const response = await fetch(request.url, { headers: request.headers });
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
		const data = (await response.json()) as
			| T
			| { error?: unknown; success?: false };
		if (
			typeof data === "object" &&
			data !== null &&
			"success" in data &&
			data.success === false
		) {
			throw new Error(`Marble returned an error for ${endpoint}`);
		}
		return data as T;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		if (options?.returnStatusOnError) {
			return {
				error: true,
				status: 500,
				statusText: "Internal Error",
			};
		}
		throw error;
	}
}

function withPostListParams() {
	return new URLSearchParams({
		limit: "100",
		order: "desc",
		status: "published",
	}).toString();
}

export function createPostListEndpoint() {
	return `posts?${withPostListParams()}`;
}

export const getPosts = cache(() =>
	fetchFromMarble<MarblePostList>(createPostListEndpoint(), {
		returnStatusOnError: true,
	})
);

export const getTags = cache(() =>
	fetchFromMarble<MarbleTagList>("tags", { returnStatusOnError: true })
);

export const getSinglePost = cache((slug: string) =>
	fetchFromMarble<MarblePost>(`posts/${encodeURIComponent(slug)}`, {
		returnStatusOnError: true,
	})
);

export const getCategories = cache(() =>
	fetchFromMarble<MarbleCategoryList>("categories")
);

export const getAuthors = cache(() =>
	fetchFromMarble<MarbleAuthorList>("authors")
);

export function isPublished(post: {
	publishedAt: Date | string;
	status?: string;
}) {
	const publishedAt = new Date(post.publishedAt).getTime();
	return (
		post.status !== "draft" &&
		Number.isFinite(publishedAt) &&
		publishedAt <= Date.now()
	);
}

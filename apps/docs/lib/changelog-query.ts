import { Notra } from "@usenotra/sdk";
import { NotraError } from "@usenotra/sdk/models/errors";
import type {
	GetPostPost,
	ListPostsPost,
	Pagination,
} from "@usenotra/sdk/models/operations";
import { cache } from "react";

export type NotraPost = Omit<ListPostsPost, "recommendations" | "status"> & {
	sourceMetadata: unknown;
	status: "draft" | "published";
};

export type NotraPagination = Pagination;

export interface NotraPostListResponse {
	metadata?: {
		status: string[];
	};
	pagination: NotraPagination;
	posts: NotraPost[];
}

export interface NotraPostResponse {
	post: NotraPost;
}

interface FetchError {
	error: true;
	status: number;
	statusText: string;
}

const NOTRA_REVALIDATE_SECONDS = 3600;

const normalizeNotraStatus = (status: string): NotraPost["status"] =>
	status === "draft" ? "draft" : "published";

const mapNotraPost = (post: ListPostsPost | GetPostPost): NotraPost => ({
	id: post.id,
	title: post.title,
	content: post.content,
	markdown: post.markdown,
	contentType: post.contentType,
	sourceMetadata: post.sourceMetadata ?? null,
	status: normalizeNotraStatus(post.status),
	createdAt: post.createdAt,
	updatedAt: post.updatedAt,
});

const getNotraClient = cache(() => {
	const apiKey = process.env.NOTRA_API_KEY;

	if (!apiKey) {
		return null;
	}

	return new Notra({
		bearerAuth: apiKey,
	});
});

async function fetchFromNotra<T>(
	request: (client: Notra) => Promise<T | FetchError>
): Promise<T | FetchError> {
	try {
		const client = getNotraClient();

		if (!client) {
			return {
				error: true,
				status: 500,
				statusText: "NOTRA_API_KEY environment variable is required",
			};
		}

		return await request(client);
	} catch (error) {
		if (error instanceof NotraError) {
			return {
				error: true,
				status: error.statusCode,
				statusText: error.message,
			};
		}

		console.error("Error fetching from Notra:", error);
		return {
			error: true,
			status: 500,
			statusText: "Internal Error",
		};
	}
}

export const getChangelogs = cache((page = 1, limit = 100) =>
	fetchFromNotra<NotraPostListResponse>(async (client) => {
		const response = await client.content.listPosts(
			{
				limit,
				page,
				sort: "desc",
				status: "published",
			},
			{
				next: { revalidate: NOTRA_REVALIDATE_SECONDS },
			}
		);

		return {
			posts: response.posts.map(mapNotraPost),
			pagination: response.pagination,
		};
	})
);

export const getChangelogPost = cache((postId: string) =>
	fetchFromNotra<NotraPostResponse>(async (client) => {
		const response = await client.content.getPost(
			{ postId },
			{
				next: { revalidate: NOTRA_REVALIDATE_SECONDS },
			}
		);

		if (!response.post) {
			return {
				error: true,
				status: 404,
				statusText: `Changelog post ${postId} not found`,
			};
		}

		return {
			post: mapNotraPost(response.post),
		};
	})
);

import { randomUUIDv7, S3Client } from "bun";

const BUCKET = process.env.STORAGE_BUCKET ?? "databuddy-static";
const ENDPOINT =
	process.env.STORAGE_ENDPOINT ?? `https://${BUCKET}.t3.storage.dev`;
const PUBLIC_URL = (process.env.STORAGE_PUBLIC_URL ?? ENDPOINT).replace(
	/\/+$/,
	""
);
const UPLOAD_URL_TTL_SECONDS = 300;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const EXTENSIONS = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/svg+xml": "svg",
	"image/webp": "webp",
	"image/x-icon": "ico",
} as const;

export type UploadContentType = keyof typeof EXTENSIONS;

export const UPLOAD_CONTENT_TYPES = Object.keys(EXTENSIONS) as [
	UploadContentType,
	...UploadContentType[],
];

export function isUploadContentType(value: string): value is UploadContentType {
	return value in EXTENSIONS;
}

const client = new S3Client({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	bucket: BUCKET,
	endpoint: ENDPOINT,
	region: process.env.AWS_REGION ?? "auto",
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	virtualHostedStyle: true,
});

export function createAssetUpload({
	asset,
	contentType,
	organizationId,
}: {
	asset: string;
	contentType: UploadContentType;
	organizationId: string;
}): { publicUrl: string; uploadUrl: string } {
	const key = `uploads/${organizationId}/${asset}-${randomUUIDv7()}.${EXTENSIONS[contentType]}`;

	return {
		publicUrl: `${PUBLIC_URL}/${key}`,
		uploadUrl: client.file(key).presign({
			acl: "public-read",
			expiresIn: UPLOAD_URL_TTL_SECONDS,
			method: "PUT",
			type: contentType,
		}),
	};
}

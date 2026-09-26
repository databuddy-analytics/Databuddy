export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const UPLOAD_EXTENSIONS = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/vnd.microsoft.icon": "ico",
	"image/webp": "webp",
	"image/x-icon": "ico",
} as const;

export type UploadContentType = keyof typeof UPLOAD_EXTENSIONS;

export const UPLOAD_CONTENT_TYPES = Object.keys(UPLOAD_EXTENSIONS) as [
	UploadContentType,
	...UploadContentType[],
];

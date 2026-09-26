import { createHash, createHmac } from "node:crypto";
import { config, type StorageConfig } from "@databuddy/env/app";
import {
	type UploadContentType,
	UPLOAD_EXTENSIONS,
} from "@databuddy/shared/uploads";
import { randomUUIDv7 } from "bun";

const UPLOAD_URL_TTL_SECONDS = 300;
const SIGNED_HEADERS = "content-length;content-type;host";
const ENCODE_EXTRA = /[!'()*]/g;
const AMZ_DATE_NOISE = /[-:]|\.\d{3}/g;

export function isStorageConfigured(): boolean {
	return config.storage !== undefined;
}

function encode(value: string): string {
	return encodeURIComponent(value).replace(
		ENCODE_EXTRA,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

function signingKey(storage: StorageConfig, date: string): Buffer {
	let key = createHmac("sha256", `AWS4${storage.secretAccessKey}`)
		.update(date)
		.digest();

	for (const part of [storage.region, "s3", "aws4_request"]) {
		key = createHmac("sha256", key).update(part).digest();
	}

	return key;
}

function presignPut(
	storage: StorageConfig,
	{
		contentLength,
		contentType,
		key,
	}: { contentLength: number; contentType: UploadContentType; key: string }
): string {
	const { host } = new URL(storage.endpoint);
	const amzDate = new Date().toISOString().replace(AMZ_DATE_NOISE, "");
	const date = amzDate.slice(0, 8);
	const scope = `${date}/${storage.region}/s3/aws4_request`;

	const path = `/${key.split("/").map(encode).join("/")}`;
	const canonicalQuery = [
		`X-Amz-Algorithm=${encode("AWS4-HMAC-SHA256")}`,
		`X-Amz-Credential=${encode(`${storage.accessKeyId}/${scope}`)}`,
		`X-Amz-Date=${encode(amzDate)}`,
		`X-Amz-Expires=${UPLOAD_URL_TTL_SECONDS}`,
		`X-Amz-SignedHeaders=${encode(SIGNED_HEADERS)}`,
	].join("&");
	const canonicalRequest = [
		"PUT",
		path,
		canonicalQuery,
		`content-length:${contentLength}`,
		`content-type:${contentType}`,
		`host:${host}`,
		"",
		SIGNED_HEADERS,
		"UNSIGNED-PAYLOAD",
	].join("\n");

	const signature = createHmac("sha256", signingKey(storage, date))
		.update(
			[
				"AWS4-HMAC-SHA256",
				amzDate,
				scope,
				createHash("sha256").update(canonicalRequest).digest("hex"),
			].join("\n")
		)
		.digest("hex");

	return `${storage.endpoint}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function createAssetUpload({
	asset,
	contentLength,
	contentType,
	organizationId,
}: {
	asset: string;
	contentLength: number;
	contentType: UploadContentType;
	organizationId: string;
}): { publicUrl: string; uploadUrl: string } {
	const storage = config.storage;

	if (!storage) {
		throw new Error(
			"Object storage is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to enable asset uploads."
		);
	}

	const key = `uploads/${organizationId}/${asset}-${randomUUIDv7()}.${UPLOAD_EXTENSIONS[contentType]}`;

	return {
		publicUrl: `${storage.publicUrl}/${key}`,
		uploadUrl: presignPut(storage, { contentLength, contentType, key }),
	};
}

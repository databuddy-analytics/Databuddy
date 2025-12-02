import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import type { CompressionConfig, CompressionAlgorithm } from "../types";

/**
 * Result of compression operation
 */
export interface CompressionResult {
	/** Compressed or original data */
	data: Buffer;
	/** Content-Encoding header value, or null if not compressed */
	encoding: string | null;
	/** Original size in bytes */
	originalSize: number;
	/** Compressed size in bytes */
	compressedSize: number;
}

/**
 * Compress payload if it exceeds threshold and compression helps
 */
export function compressPayload(
	payload: string | Buffer,
	config: Required<CompressionConfig>,
): CompressionResult {
	const data =
		typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;
	const originalSize = data.length;

	// Skip compression for small payloads
	if (originalSize < config.threshold) {
		return {
			data,
			encoding: null,
			originalSize,
			compressedSize: originalSize,
		};
	}

	let compressed: Buffer;
	let encoding: string;

	if (config.algorithm === "brotli") {
		compressed = brotliCompressSync(data, {
			params: {
				[constants.BROTLI_PARAM_QUALITY]: Math.min(config.level, 11),
			},
		});
		encoding = "br";
	} else {
		compressed = gzipSync(data, {
			level: Math.min(config.level, 9),
		});
		encoding = "gzip";
	}

	// Only use compression if it actually reduces size
	if (compressed.length >= originalSize) {
		return {
			data,
			encoding: null,
			originalSize,
			compressedSize: originalSize,
		};
	}

	return {
		data: compressed,
		encoding,
		originalSize,
		compressedSize: compressed.length,
	};
}

/**
 * Get Content-Encoding header value for algorithm
 */
export function getEncodingHeader(algorithm: CompressionAlgorithm): string {
	return algorithm === "brotli" ? "br" : "gzip";
}

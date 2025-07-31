import stream from 'node:stream';
import zlib from 'node:zlib';

const make = (ctx, handle) =>
	Object.assign(ctx, {
		readable: stream.Readable.toWeb(handle),
		writable: stream.Writable.toWeb(handle),
	});

globalThis.CompressionStream ??= class CompressionStream {
	readable;
	writable;

	constructor(format) {
		make(
			this,
			format === 'deflate'
				? zlib.createDeflate()
				: format === 'gzip'
					? zlib.createGzip()
					: zlib.createDeflateRaw()
		);
	}
};

globalThis.DecompressionStream ??= class DecompressionStream {
	readable;
	writable;

	constructor(format) {
		make(
			this,
			format === 'deflate'
				? zlib.createInflate()
				: format === 'gzip'
					? zlib.createGunzip()
					: zlib.createInflateRaw()
		);
	}
};

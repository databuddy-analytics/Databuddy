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
		let handle;
		if (format === 'deflate') {
			handle = zlib.createDeflate();
		} else if (format === 'gzip') {
			handle = zlib.createGzip();
		} else {
			handle = zlib.createDeflateRaw();
		}
		make(this, handle);
	}
};

globalThis.DecompressionStream ??= class DecompressionStream {
	readable;
	writable;

	constructor(format) {
		let handle;
		if (format === 'deflate') {
			handle = zlib.createInflate();
		} else if (format === 'gzip') {
			handle = zlib.createGunzip();
		} else {
			handle = zlib.createInflateRaw();
		}
		make(this, handle);
	}
};

import type { PixelCrop } from 'react-image-crop';

// This function was adapted from the official react-image-crop examples
// to ensure the output is a high-quality, circular image.
export async function getCroppedImage(
	image: HTMLImageElement,
	crop: PixelCrop,
	fileName: string
): Promise<File> {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');

	if (!ctx) {
		throw new Error('No 2d context');
	}

	const scaleX = image.naturalWidth / image.width;
	const scaleY = image.naturalHeight / image.height;
	const pixelRatio = window.devicePixelRatio || 1;

	canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
	canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

	ctx.scale(pixelRatio, pixelRatio);
	ctx.imageSmoothingQuality = 'high';

	const cropX = crop.x * scaleX;
	const cropY = crop.y * scaleY;

	const _centerX = image.naturalWidth / 2;
	const _centerY = image.naturalHeight / 2;

	ctx.save();

	// Create a circular clipping path.
	const radius = canvas.width / (2 * pixelRatio);
	ctx.beginPath();
	ctx.arc(radius, radius, radius, 0, Math.PI * 2, true);
	ctx.closePath();
	ctx.clip();

	ctx.drawImage(
		image,
		cropX,
		cropY,
		crop.width * scaleX,
		crop.height * scaleY,
		0,
		0,
		crop.width * scaleX,
		crop.height * scaleY
	);

	ctx.restore();

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error('Canvas is empty'));
				return;
			}
			resolve(new File([blob], fileName, { type: 'image/png' }));
		}, 'image/png');
	});
}

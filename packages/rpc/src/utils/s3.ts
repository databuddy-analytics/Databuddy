import { S3Client } from 'bun';
import { nanoid } from 'nanoid';

export class S3UploadManager {
	private client: S3Client;

	constructor() {
		this.client = new S3Client({
			accessKeyId: process.env.R2_ACCESS_KEY_ID,
			secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
			bucket: process.env.R2_BUCKET,
			endpoint: process.env.R2_ENDPOINT,
		});
	}

	async uploadFile(file: File, options: { isPublic?: boolean } = {}) {
		const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '');
		const key = `${nanoid()}-${safeFilename}`;

		await this.client.write(key, file, {
			acl: options.isPublic ? 'public-read' : undefined,
		});

		if (options.isPublic) {
			const publicUrl = `https://cdn.databuddy.cc/${key}`;
			return { key, url: publicUrl };
		}

		return { key };
	}

	async deleteFileFromUrl(url: string) {
		try {
			const key = url.split('/').pop();
			if (key) {
				await this.client.delete(key);
			}
		} catch (error) {
			console.error('Error deleting file from URL:', error);
		}
	}

	getFileUrl(key: string) {
		return this.client.presign(key, {
			expiresIn: 60 * 5, // 5 minutes
		});
	}

	async deleteFile(key: string) {
		await this.client.delete(key);
	}

	async listFiles() {
		return await this.client.list();
	}

	// Organization-specific methods
	validateLogoFile(file: File): void {
		const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
		const maxSize = 5 * 1024 * 1024; // 5MB

		if (!allowedTypes.includes(file.type)) {
			throw new Error(
				'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
			);
		}

		if (file.size > maxSize) {
			throw new Error('File size too large. Maximum size is 5MB.');
		}
	}

	async uploadOrganizationLogo(
		organizationId: string,
		file: File
	): Promise<string> {
		this.validateLogoFile(file);

		// Add organization prefix to the filename for better organization
		const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '');
		const key = `organizations/${organizationId}/logos/${nanoid()}-${safeFilename}`;

		await this.client.write(key, file, {
			acl: 'public-read',
		});

		return `https://cdn.databuddy.cc/${key}`;
	}

	async deleteOrganizationLogo(logoUrl: string): Promise<void> {
		if (!logoUrl) {
			return;
		}

		try {
			// Extract key from CDN URL
			const url = new URL(logoUrl);
			const key = url.pathname.startsWith('/')
				? url.pathname.slice(1)
				: url.pathname;

			await this.client.delete(key);
		} catch (error) {
			console.error('Failed to delete logo from S3:', error);
		}
	}

	// Generate presigned URL for direct client uploads
	createPresignedUpload(
		organizationId: string,
		fileName: string,
		contentType: string,
		expiresIn = 3600
	): { uploadUrl: string; publicUrl: string; fileKey: string } {
		// Validate content type
		const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(contentType)) {
			throw new Error(
				'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
			);
		}

		const safeFilename = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
		const fileKey = `organizations/${organizationId}/logos/${nanoid()}-${safeFilename}`;

		const uploadUrl = this.client.presign(fileKey, {
			method: 'PUT',
			type: contentType,
			expiresIn,
			acl: 'public-read',
		});

		const publicUrl = `https://cdn.databuddy.cc/${fileKey}`;

		return {
			uploadUrl,
			publicUrl,
			fileKey,
		};
	}
}

export const s3 = new S3UploadManager();

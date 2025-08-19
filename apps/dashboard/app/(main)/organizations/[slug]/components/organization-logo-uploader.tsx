'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import ReactCrop, {
	type Crop,
	centerCrop,
	makeAspectCrop,
	type PixelCrop,
} from 'react-image-crop';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type Organization, useOrganizations } from '@/hooks/use-organizations';
import { getOrganizationInitials } from '@/lib/utils';
import 'react-image-crop/dist/ReactCrop.css';
import { TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { getCroppedImage } from '@/lib/canvas-utils';

interface OrganizationLogoUploaderProps {
	organization: Organization;
}

export function OrganizationLogoUploader({
	organization,
}: OrganizationLogoUploaderProps) {
	const {
		uploadOrganizationLogo,
		isUploadingOrganizationLogo,
		deleteOrganizationLogo,
		isDeletingOrganizationLogo,
	} = useOrganizations();
	const [preview, setPreview] = useState(organization.logo);
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [crop, setCrop] = useState<Crop>();
	const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);

	const resetCropState = () => {
		setImageSrc(null);
		setCrop(undefined);
		setCompletedCrop(undefined);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleModalOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			resetCropState();
		}
		setIsModalOpen(isOpen);
	};

	function onImageLoad(img: HTMLImageElement) {
		const { naturalWidth: width, naturalHeight: height } = img;
		const percentCrop = centerCrop(
			makeAspectCrop(
				{
					unit: '%',
					width: 90,
				},
				1,
				width,
				height
			),
			width,
			height
		);
		setCrop(percentCrop);

		const pixelCrop = {
			unit: 'px' as const,
			x: Math.round((percentCrop.x / 100) * width),
			y: Math.round((percentCrop.y / 100) * height),
			width: Math.round((percentCrop.width / 100) * width),
			height: Math.round((percentCrop.height / 100) * height),
		};
		setCompletedCrop(pixelCrop);
	}

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onloadend = () => {
				setImageSrc(reader.result as string);
				setIsModalOpen(true);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleUpload = async () => {
		if (!(imageSrc && completedCrop && imageRef.current)) {
			toast.error('Please crop the image before uploading.');
			return;
		}

		try {
			const croppedFile = await getCroppedImage(
				imageRef.current,
				completedCrop,
				'logo.png'
			);

			const reader = new FileReader();
			reader.onloadend = () => {
				const fileData = reader.result as string;
				uploadOrganizationLogo(
					{
						organizationId: organization.id,
						fileData,
						fileName: croppedFile.name,
						fileType: croppedFile.type,
					},
					{
						onSuccess: (data) => {
							setPreview(data.logoUrl);
							handleModalOpenChange(false);
							setTimeout(() => resetCropState(), 100);
						},
						onError: (error) => {
							toast.error(error.message || 'Failed to upload logo.');
						},
					}
				);
			};
			reader.readAsDataURL(croppedFile);
		} catch (e) {
			toast.error('Failed to crop image.');
			console.error(e);
		}
	};

	const handleDeleteLogo = () => {
		deleteOrganizationLogo(
			{ organizationId: organization.id },
			{
				onSuccess: () => {
					setPreview(null);
				},
				onError: (error) => {
					toast.error(error.message || 'Failed to delete logo.');
				},
			}
		);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-4">
				<div className="group relative">
					<Avatar className="h-20 w-20 border-2 border-border/50 shadow-sm">
						<AvatarImage alt={organization.name} src={preview || undefined} />
						<AvatarFallback className="bg-accent font-medium text-lg">
							{getOrganizationInitials(organization.name)}
						</AvatarFallback>
					</Avatar>
					<button
						aria-label="Upload new organization logo"
						className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
						onClick={() => fileInputRef.current?.click()}
						type="button"
					>
						<UploadSimpleIcon className="text-white" size={24} />
					</button>
				</div>
				<div className="space-y-2">
					<p className="font-medium text-foreground">Update your logo</p>
					<p className="text-muted-foreground text-sm">
						Click the image to upload a new one.
					</p>
					{preview && (
						<Button
							className="rounded"
							disabled={isDeletingOrganizationLogo}
							onClick={handleDeleteLogo}
							size="sm"
							variant="outline"
						>
							{isDeletingOrganizationLogo ? (
								<>
									<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground" />
									Deleting...
								</>
							) : (
								<>
									<TrashIcon className="mr-2 h-4 w-4" size={16} />
									Remove Logo
								</>
							)}
						</Button>
					)}
					<Input
						accept="image/png, image/jpeg, image/gif"
						className="hidden"
						onChange={handleFileChange}
						ref={fileInputRef}
						type="file"
					/>
				</div>
			</div>

			<Dialog onOpenChange={handleModalOpenChange} open={isModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Crop your new logo</DialogTitle>
					</DialogHeader>
					{imageSrc && (
						<ReactCrop
							aspect={1}
							circularCrop={true}
							crop={crop}
							onChange={(pixelCrop, percentCrop) => {
								setCrop(percentCrop);
								setCompletedCrop(pixelCrop);
							}}
							onComplete={(pixelCrop) => {
								setCompletedCrop(pixelCrop);
							}}
						>
							<Image
								alt="Crop preview"
								height={600}
								onLoadingComplete={onImageLoad}
								ref={imageRef}
								src={imageSrc}
								width={800}
							/>
						</ReactCrop>
					)}
					<DialogFooter>
						<Button
							onClick={() => handleModalOpenChange(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={
								isUploadingOrganizationLogo || !imageSrc || !completedCrop
							}
							onClick={handleUpload}
						>
							{isUploadingOrganizationLogo ? (
								<>
									<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
									Uploading...
								</>
							) : (
								'Save and Upload'
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

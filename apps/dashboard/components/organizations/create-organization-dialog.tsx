'use client';

import {
	BuildingsIcon,
	UploadSimpleIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
// import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { useOrganizations } from '@/hooks/use-organizations';
import { getCroppedImage } from '@/lib/canvas-utils';
import 'react-image-crop/dist/ReactCrop.css';

// Top-level regex literals for performance and lint compliance
const SLUG_ALLOWED_REGEX = /^[a-z0-9-]+$/;
const REGEX_NON_SLUG_NAME_CHARS = /[^a-z0-9\s-]/g;
const REGEX_SPACES_TO_DASH = /\s+/g;
const REGEX_MULTI_DASH = /-+/g;
const REGEX_TRIM_DASH = /^-+|-+$/g;
const REGEX_INVALID_SLUG_CHARS = /[^a-z0-9-]/g;

interface CreateOrganizationData {
	name: string;
	slug: string;
	logo: string;
	metadata: Record<string, unknown>;
}

interface CreateOrganizationDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export function CreateOrganizationDialog({
	isOpen,
	onClose,
}: CreateOrganizationDialogProps) {
	const { createOrganizationAsync, isCreatingOrganization } =
		useOrganizations();
	// const router = useRouter();

	// Form state
	const [formData, setFormData] = useState<CreateOrganizationData>({
		name: '',
		slug: '',
		logo: '',
		metadata: {},
	});
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

	// Image upload state
	const [preview, setPreview] = useState<string | null>(null);
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [crop, setCrop] = useState<Crop>();
	const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
	const [isCropModalOpen, setIsCropModalOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);

	// Slug auto-generation
	useEffect(() => {
		if (!(slugManuallyEdited && formData.slug)) {
			const generatedSlug = formData.name
				.toLowerCase()
				.replace(REGEX_NON_SLUG_NAME_CHARS, '')
				.replace(REGEX_SPACES_TO_DASH, '-')
				.replace(REGEX_MULTI_DASH, '-')
				.replace(REGEX_TRIM_DASH, '');
			setFormData((prev) => ({ ...prev, slug: generatedSlug }));
		}
	}, [formData.name, formData.slug, slugManuallyEdited]);

	// Reset form
	const resetForm = () => {
		setFormData({ name: '', slug: '', logo: '', metadata: {} });
		setPreview(null);
		setSlugManuallyEdited(false);
	};

	// Close dialog
	const handleClose = () => {
		onClose();
		resetForm();
	};

	// Slug input handler
	const handleSlugChange = (value: string) => {
		setSlugManuallyEdited(true);
		const cleanSlug = value
			.toLowerCase()
			.replace(REGEX_INVALID_SLUG_CHARS, '')
			.replace(REGEX_MULTI_DASH, '-')
			.replace(REGEX_TRIM_DASH, '');
		setFormData((prev) => ({ ...prev, slug: cleanSlug }));
		if (cleanSlug === '') {
			setSlugManuallyEdited(false);
		}
	};

	// Form validation
	const isFormValid = useMemo(
		() =>
			formData.name.trim().length >= 2 &&
			(formData.slug || '').trim().length >= 2 &&
			SLUG_ALLOWED_REGEX.test(formData.slug || ''),
		[formData.name, formData.slug]
	);

	// Image crop modal handlers
	const handleCropModalOpenChange = (open: boolean) => {
		if (!open && fileInputRef.current) {
			fileInputRef.current.value = '';
		}
		if (!open) {
			setImageSrc(null);
			setCrop(undefined);
			setCompletedCrop(undefined);
		}
		setIsCropModalOpen(open);
	};

	function onImageLoad(img: HTMLImageElement) {
		const width = img.naturalWidth;
		const height = img.naturalHeight;
		const percentCrop = centerCrop(
			makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
			width,
			height
		);
		setCrop(percentCrop);
		setCompletedCrop({
			unit: 'px',
			x: Math.round((percentCrop.x / 100) * width),
			y: Math.round((percentCrop.y / 100) * height),
			width: Math.round((percentCrop.width / 100) * width),
			height: Math.round((percentCrop.height / 100) * height),
		});
		imageRef.current = img;
	}

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onloadend = () => {
				setImageSrc(reader.result as string);
				setIsCropModalOpen(true);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleCropSave = async () => {
		if (!(imageSrc && completedCrop && imageRef.current)) {
			toast.error('Please crop the image before saving.');
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
				const dataUrl = reader.result as string;
				setPreview(dataUrl);
				setFormData((prev) => ({ ...prev, logo: dataUrl }));
				handleCropModalOpenChange(false);
				toast.success('Logo saved successfully!');
			};
			reader.readAsDataURL(croppedFile);
		} catch {
			toast.error('Failed to crop image.');
		}
	};

	// Organization initials for avatar fallback
	const getOrganizationInitials = (name: string) =>
		name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);

	// Submit handler
	const handleSubmit = async () => {
		if (!isFormValid) {
			return;
		}
		try {
			await createOrganizationAsync(formData);
			handleClose();
			// router.push('/organizations');
		} catch {
			// handled by mutation toast
		}
	};

	return (
		<>
			<Sheet onOpenChange={handleClose} open={isOpen}>
				<SheetContent
					className="w-full max-w-md overflow-y-auto p-4 sm:max-w-lg sm:p-6 md:max-w-xl lg:max-w-2xl"
					side="right"
				>
					<SheetHeader className="space-y-3 border-border/50 border-b pb-4 sm:pb-6">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
							<div className="self-start rounded border border-primary/20 bg-primary/10 p-3 sm:self-center">
								<BuildingsIcon
									className="h-6 w-6 text-primary"
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<SheetTitle className="font-semibold text-foreground text-lg sm:text-xl">
									Create New Organization
								</SheetTitle>
								<SheetDescription className="mt-1 text-muted-foreground text-sm">
									Set up a new organization to collaborate with your team
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="space-y-4 pt-4 sm:space-y-6 sm:pt-6">
						<div className="space-y-4">
							<div className="space-y-2">
								<Label
									className="font-medium text-foreground text-sm"
									htmlFor="org-name"
								>
									Organization Name *
								</Label>
								{(() => {
									const isNameValid = formData.name.trim().length >= 2;
									return (
										<>
											<Input
												aria-describedby="org-name-help"
												aria-invalid={!isNameValid}
												className={`rounded border-border/50 focus:border-primary/50 focus:ring-primary/20 ${
													isNameValid ? '' : 'border-destructive'
												}`}
												id="org-name"
												maxLength={100}
												onChange={(e) =>
													setFormData((prev) => ({
														...prev,
														name: e.target.value,
													}))
												}
												placeholder="e.g., Acme Corporation"
												value={formData.name}
											/>
											<p
												className="text-muted-foreground text-xs"
												id="org-name-help"
											>
												This is the display name for your organization
											</p>
										</>
									);
								})()}
							</div>

							<div className="space-y-2">
								<Label
									className="font-medium text-foreground text-sm"
									htmlFor="org-slug"
								>
									Organization Slug *
								</Label>
								{(() => {
									const isSlugValid =
										SLUG_ALLOWED_REGEX.test(formData.slug || '') &&
										(formData.slug || '').trim().length >= 2;
									return (
										<>
											<Input
												aria-describedby="org-slug-help"
												aria-invalid={!isSlugValid}
												className={`rounded border-border/50 focus:border-primary/50 focus:ring-primary/20 ${
													isSlugValid ? '' : 'border-destructive'
												}`}
												id="org-slug"
												maxLength={50}
												onChange={(e) => handleSlugChange(e.target.value)}
												placeholder="e.g., acme-corp"
												value={formData.slug}
											/>
											<p
												className="text-muted-foreground text-xs"
												id="org-slug-help"
											>
												Used in URLs and must be unique. Only lowercase letters,
												numbers, and hyphens allowed.
											</p>
										</>
									);
								})()}
							</div>

							<div className="space-y-2">
								<Label className="font-medium text-foreground text-sm">
									Organization Logo
									<span className="font-normal text-muted-foreground">
										{' '}
										(optional)
									</span>
								</Label>
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
									<div className="group relative self-start">
										<Avatar className="h-16 w-16 border border-border/50">
											<AvatarImage
												alt={formData.name || 'Organization'}
												src={preview || undefined}
											/>
											<AvatarFallback className="bg-accent font-medium text-sm">
												{getOrganizationInitials(formData.name || 'O')}
											</AvatarFallback>
										</Avatar>
										<button
											aria-label="Upload organization logo"
											className="absolute inset-0 flex cursor-pointer items-center justify-center rounded bg-black bg-opacity-50 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => fileInputRef.current?.click()}
											onKeyDown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													fileInputRef.current?.click();
												}
											}}
											type="button"
										>
											<UploadSimpleIcon className="h-5 w-5 text-white" />
											<span className="sr-only">Upload organization logo</span>
										</button>
									</div>
									<div className="min-w-0 flex-1">
										<p className="font-medium text-sm">Upload your logo</p>
										<p className="text-muted-foreground text-xs">
											Click the image to upload a new one.
										</p>
										<Input
											accept="image/png, image/jpeg, image/gif"
											className="hidden"
											onChange={handleFileChange}
											ref={fileInputRef}
											type="file"
										/>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<UsersIcon className="h-5 w-5 text-primary" weight="duotone" />
								<Label className="font-semibold text-base text-foreground">
									Getting Started
								</Label>
							</div>
							<div className="rounded border border-border/50 bg-muted/30 p-4">
								<p className="text-muted-foreground text-sm">
									After creating your organization, you'll be able to:
								</p>
								<ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
									<li>Invite team members with different roles</li>
									<li>Share websites and analytics data</li>
									<li>Manage organization settings and permissions</li>
								</ul>
							</div>
						</div>

						<div className="flex flex-col justify-end gap-3 border-border/50 border-t pt-4 sm:flex-row sm:pt-6">
							<Button
								className="order-2 rounded sm:order-1"
								disabled={isCreatingOrganization}
								onClick={handleClose}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="relative order-1 rounded sm:order-2"
								disabled={!isFormValid || isCreatingOrganization}
								onClick={handleSubmit}
								type="button"
							>
								{isCreatingOrganization && (
									<div className="absolute left-3">
										<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
									</div>
								)}
								<span className={isCreatingOrganization ? 'ml-6' : ''}>
									{isCreatingOrganization
										? 'Creating...'
										: 'Create Organization'}
								</span>
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<Dialog onOpenChange={handleCropModalOpenChange} open={isCropModalOpen}>
				<DialogContent className="max-h-[95vh] max-w-[95vw] overflow-auto">
					<DialogHeader>
						<DialogTitle>Crop organization logo</DialogTitle>
					</DialogHeader>
					{imageSrc && (
						<div className="flex justify-center">
							<ReactCrop
								aspect={1}
								circularCrop
								crop={crop}
								onChange={(pixelCrop, percentCrop) => {
									setCrop(percentCrop);
									setCompletedCrop(pixelCrop);
								}}
							>
								<Image
									alt="Crop preview"
									className="max-h-[60vh] max-w-full object-contain"
									height={600}
									onLoadingComplete={onImageLoad}
									src={imageSrc as string}
									width={800}
								/>
							</ReactCrop>
						</div>
					)}
					<DialogFooter className="flex flex-col gap-2 sm:flex-row">
						<Button
							className="w-full sm:w-auto"
							onClick={() => handleCropModalOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							className="w-full sm:w-auto"
							disabled={!(imageSrc && completedCrop)}
							onClick={handleCropSave}
							type="button"
						>
							Save Logo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

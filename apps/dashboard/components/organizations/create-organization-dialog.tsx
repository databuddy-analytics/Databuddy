'use client';

import { BuildingsIcon, UploadSimple, UsersIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
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

interface CreateOrganizationData {
	name: string;
	slug: string;
	logo: string;
	metadata: Record<string, any>;
}

interface CreateOrganizationDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export function CreateOrganizationDialog({
	isOpen,
	onClose,
}: CreateOrganizationDialogProps) {
	const { createOrganization, isCreatingOrganization } = useOrganizations();
	const router = useRouter();

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
	const imageRef = useRef<HTMLImageElement>(null);

	// Slug auto-generation
	useEffect(() => {
		if (!(slugManuallyEdited && formData.slug)) {
			const generatedSlug = formData.name
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, '')
				.replace(/\s+/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-+|-+$/g, '');
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
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-+|-+$/g, '');
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
			/^[a-z0-9-]+$/.test(formData.slug || ''),
		[formData.name, formData.slug]
	);

	// Image crop modal handlers
	const handleCropModalOpenChange = (isOpen: boolean) => {
		if (!isOpen && fileInputRef.current) {
			fileInputRef.current.value = '';
		}
		if (!isOpen) {
			setImageSrc(null);
			setCrop(undefined);
			setCompletedCrop(undefined);
		}
		setIsCropModalOpen(isOpen);
	};

	function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
		const { width, height } = e.currentTarget;
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
		} catch (e) {
			toast.error('Failed to crop image.');
			console.error(e);
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
			createOrganization(formData);
			handleClose();
			router.push('/organizations');
		} catch {
			// Error handled by mutation
		}
	};

	return (
		<>
			<Sheet onOpenChange={handleClose} open={isOpen}>
				<SheetContent
					className="w-[40vw] overflow-y-auto p-6"
					side="right"
					style={{ maxWidth: '600px', minWidth: '500px' }}
				>
					<SheetHeader className="space-y-3 border-border/50 border-b pb-6">
						<div className="flex items-center gap-3">
							<div className="rounded border border-primary/20 bg-primary/10 p-3">
								<BuildingsIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<SheetTitle className="font-semibold text-foreground text-xl">
									Create New Organization
								</SheetTitle>
								<SheetDescription className="mt-1 text-muted-foreground">
									Set up a new organization to collaborate with your team
								</SheetDescription>
							</div>
						</div>
					</SheetHeader>

					<div className="space-y-6 pt-6">
						<div className="space-y-4">
							<div className="space-y-2">
								<Label
									className="font-medium text-foreground text-sm"
									htmlFor="org-name"
								>
									Organization Name *
								</Label>
								<Input
									className="rounded border-border/50 focus:border-primary/50 focus:ring-primary/20"
									id="org-name"
									maxLength={100}
									onChange={(e) =>
										setFormData((prev) => ({ ...prev, name: e.target.value }))
									}
									placeholder="e.g., Acme Corporation"
									value={formData.name}
								/>
								<p className="text-muted-foreground text-xs">
									This is the display name for your organization
								</p>
							</div>

							<div className="space-y-2">
								<Label
									className="font-medium text-foreground text-sm"
									htmlFor="org-slug"
								>
									Organization Slug *
								</Label>
								<Input
									className="rounded border-border/50 focus:border-primary/50 focus:ring-primary/20"
									id="org-slug"
									maxLength={50}
									onChange={(e) => handleSlugChange(e.target.value)}
									placeholder="e.g., acme-corp"
									value={formData.slug}
								/>
								<p className="text-muted-foreground text-xs">
									Used in URLs and must be unique. Only lowercase letters,
									numbers, and hyphens allowed.
								</p>
							</div>

							<div className="space-y-2">
								<Label className="font-medium text-foreground text-sm">
									Organization Logo
									<span className="font-normal text-muted-foreground">
										{' '}
										(optional)
									</span>
								</Label>
								<div className="flex items-center gap-4">
									<div className="group relative">
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
											className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black bg-opacity-50 opacity-0 transition-opacity group-hover:opacity-100"
											onClick={() => fileInputRef.current?.click()}
											type="button"
										>
											<UploadSimple className="text-white" size={20} />
										</button>
									</div>
									<div className="grid gap-2">
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
								<UsersIcon
									className="h-5 w-5 text-primary"
									size={16}
									weight="duotone"
								/>
								<Label className="font-semibold text-base text-foreground">
									Getting Started
								</Label>
							</div>
							<div className="rounded border border-border/50 bg-muted/30 p-4">
								<p className="text-muted-foreground text-sm">
									After creating your organization, you'll be able to:
								</p>
								<ul className="mt-2 space-y-1 text-muted-foreground text-sm">
									<li className="flex items-start gap-2">
										<span className="mt-0.5 text-primary">•</span>
										Invite team members with different roles
									</li>
									<li className="flex items-start gap-2">
										<span className="mt-0.5 text-primary">•</span>
										Share websites and analytics data
									</li>
									<li className="flex items-start gap-2">
										<span className="mt-0.5 text-primary">•</span>
										Manage organization settings and permissions
									</li>
								</ul>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-border/50 border-t pt-6">
							<Button
								className="rounded"
								disabled={isCreatingOrganization}
								onClick={handleClose}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="relative rounded"
								disabled={!isFormValid || isCreatingOrganization}
								onClick={handleSubmit}
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
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Crop your organization logo</DialogTitle>
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
						>
							<img
								alt="Crop preview"
								onLoad={onImageLoad}
								ref={imageRef}
								src={imageSrc}
							/>
						</ReactCrop>
					)}
					<DialogFooter>
						<Button
							onClick={() => handleCropModalOpenChange(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={!(imageSrc && completedCrop)}
							onClick={handleCropSave}
						>
							Save Logo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

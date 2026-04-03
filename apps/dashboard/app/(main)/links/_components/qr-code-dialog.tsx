"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Link } from "@/hooks/use-links";
import { LinkQrCode } from "./link-qr-code";

interface QrCodeDialogProps {
	link: Link | null;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function QrCodeDialog({ link, open, onOpenChange }: QrCodeDialogProps) {
	if (!link) {
		return null;
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-center">{link.name}</DialogTitle>
					<DialogDescription className="text-center">
						Customize and download your QR code
					</DialogDescription>
				</DialogHeader>
				<LinkQrCode name={link.name} slug={link.slug} />
			</DialogContent>
		</Dialog>
	);
}

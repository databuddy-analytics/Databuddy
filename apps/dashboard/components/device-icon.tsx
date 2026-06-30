import { getDeviceTypeIcon } from "@/app/(main)/websites/[id]/_components/utils/technology-helpers";

export function getDeviceIcon(
	device: string | null | undefined,
	size: "sm" | "md" | "lg" = "md"
) {
	return getDeviceTypeIcon(device, size);
}

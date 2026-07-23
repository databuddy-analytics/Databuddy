export interface AttachDialogCopy {
	confirmLabel: string;
	description: string;
	title: string;
}

export function getAttachDialogCopy(
	action: string | null | undefined,
	planName: string
): AttachDialogCopy {
	switch (action) {
		case "upgrade":
			return {
				title: `Upgrade to ${planName}`,
				description:
					"Review today's charge and the price for your next billing cycle.",
				confirmLabel: "Confirm upgrade",
			};
		case "downgrade":
			return {
				title: `Downgrade to ${planName}`,
				description:
					"Review when the plan change takes effect and what you will pay next.",
				confirmLabel: "Confirm downgrade",
			};
		case "trial":
			return {
				title: `Start your ${planName} trial`,
				description:
					"Review what is due today and the price after your trial ends.",
				confirmLabel: "Start free trial",
			};
		case "resume":
			return {
				title: `Resume ${planName}`,
				description:
					"Review the billing details before keeping this subscription active.",
				confirmLabel: "Resume plan",
			};
		case "add":
			return {
				title: `Add ${planName}`,
				description:
					"Review today's charge and the recurring price for this add-on.",
				confirmLabel: "Add to subscription",
			};
		default:
			return {
				title: `Start ${planName}`,
				description:
					"Review today's charge and the price for your next billing cycle.",
				confirmLabel: "Confirm subscription",
			};
	}
}

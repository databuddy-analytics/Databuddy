import type { PreviewAttachResponse } from "autumn-js";

export const getAttachContent = (_preview: PreviewAttachResponse) => {
	const planName = "this plan";

	return {
		title: <p>Confirm Subscription</p>,
		message: (
			<p>
				By clicking confirm, you will be subscribed to {planName} and your
				payment method will be charged.
			</p>
		),
	};
};

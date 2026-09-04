interface PaymentMethodCard {
	brand?: string;
	exp_month?: number;
	exp_year?: number;
	last4?: string;
}

interface PaymentMethodBillingDetails {
	address?: {
		city?: string;
		country?: string;
		line1?: string;
		line2?: string;
		postal_code?: string;
		state?: string;
	};
	email?: string;
	name?: string;
}

interface PaymentMethod {
	billing_details?: PaymentMethodBillingDetails;
	card?: PaymentMethodCard;
	id?: string;
	type?: string;
}

export interface CustomerWithPaymentMethod {
	name?: string | null;
	paymentMethod?: PaymentMethod | null;
}

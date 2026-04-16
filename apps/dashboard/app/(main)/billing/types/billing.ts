export interface PaymentMethodCard {
	brand?: string;
	expMonth?: number;
	expYear?: number;
	last4?: string;
}

export interface PaymentMethodBillingDetails {
	address?: {
		city?: string;
		country?: string;
		line1?: string;
		line2?: string;
		postalCode?: string;
		state?: string;
	};
	email?: string;
	name?: string;
}

export interface PaymentMethod {
	billingDetails?: PaymentMethodBillingDetails;
	card?: PaymentMethodCard;
	id?: string;
	type?: string;
}

export interface CustomerWithPaymentMethod {
	name?: string | null;
	paymentMethod?: PaymentMethod;
}

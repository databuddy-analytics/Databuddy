import type { Customer as AutumnCustomer } from "autumn-js";

export type PaymentMethodCard = {
	brand?: string;
	last4?: string;
	exp_month?: number;
	exp_year?: number;
};

export type PaymentMethodBillingDetails = {
	name?: string;
	email?: string;
	address?: {
		city?: string;
		country?: string;
		line1?: string;
		line2?: string;
		postal_code?: string;
		state?: string;
	};
};

export type PaymentMethod = {
	id?: string;
	type?: string;
	card?: PaymentMethodCard;
	billing_details?: PaymentMethodBillingDetails;
};

export type CustomerWithPaymentMethod = AutumnCustomer & {
	payment_method?: PaymentMethod;
};

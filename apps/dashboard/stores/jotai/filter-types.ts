export interface DynamicQueryFilter {
	field: string;
	operator:
		| "eq"
		| "ne"
		| "contains"
		| "not_contains"
		| "starts_with"
		| "in"
		| "not_in";
	value: string | number | (string | number)[];
}

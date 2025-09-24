export class Databuddy {
	constructor(options: object = {}) {
		this.options = options;
	}
	options: object;
	records: Array<{
		event: string;
		properties: Record<
			string,
			| string
			| number
			| boolean
			| null
			| undefined
			| string[]
			| number[]
			| boolean[]
		>;
	}> = [];
	track(
		event: string,
		properties: Record<
			string,
			| string
			| number
			| boolean
			| null
			| undefined
			| string[]
			| number[]
			| boolean[]
		>
	): void {
		this.records.push({ event, properties });
	}
}

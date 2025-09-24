export class Databuddy {
	constructor(options: any) {
		this.options = options;
	}
	options: any;
	track(event: string, properties: any) {
		console.log('track', event, properties);
	}
}

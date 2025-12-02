import type {
	TrackedEvent,
	Middleware,
	KoaMiddleware,
	SimpleMiddleware,
	MiddlewareNext,
	Logger,
} from "../types";

/**
 * Check if middleware uses Koa-style signature (has 2 parameters)
 */
function isKoaMiddleware(fn: Middleware): fn is KoaMiddleware {
	return fn.length === 2;
}

/**
 * Wrap simple middleware to Koa-style
 */
function wrapSimpleMiddleware(fn: SimpleMiddleware): KoaMiddleware {
	return async (event: TrackedEvent, next: MiddlewareNext) => {
		const result = await fn(event);
		if (result === null) {
			return null;
		}
		return next(result);
	};
}

/**
 * Middleware pipeline executor
 * Supports both Koa-style middleware (event, next) and simple transforms (event) => event
 */
export class MiddlewarePipeline {
	private middlewares: KoaMiddleware[] = [];
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Add middleware to the pipeline
	 * Auto-detects middleware style and wraps if needed
	 */
	use(middleware: Middleware): void {
		const wrapped = isKoaMiddleware(middleware)
			? middleware
			: wrapSimpleMiddleware(middleware);
		this.middlewares.push(wrapped);
	}

	/**
	 * Execute the middleware pipeline on an event
	 * Returns null if event was dropped by middleware
	 */
	async execute(event: TrackedEvent): Promise<TrackedEvent | null> {
		if (this.middlewares.length === 0) {
			return event;
		}

		let index = 0;

		const dispatch: MiddlewareNext = async (
			currentEvent: TrackedEvent,
		): Promise<TrackedEvent | null> => {
			// If we've run through all middleware, return the final event
			if (index >= this.middlewares.length) {
				return currentEvent;
			}

			const middleware = this.middlewares[index++];

			try {
				return await middleware(currentEvent, dispatch);
			} catch (error) {
				this.logger.error("Middleware error", {
					index: index - 1,
					error: error instanceof Error ? error.message : String(error),
				});
				// Continue pipeline on error, don't drop event
				return dispatch(currentEvent);
			}
		};

		return dispatch(event);
	}

	/**
	 * Clear all middleware
	 */
	clear(): void {
		this.middlewares = [];
	}

	/**
	 * Get middleware count
	 */
	get length(): number {
		return this.middlewares.length;
	}
}

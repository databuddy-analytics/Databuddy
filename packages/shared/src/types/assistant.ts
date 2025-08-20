// TODO: This is inefficient, we can use better short codes
// to indicate the type of update.

// TODO: Enforce more strict types here based on the "type" field
export type StreamingUpdate =
	| {
			type: 'thinking' | 'progress' | 'complete' | 'error';
			content: string;
			data?: {
				hasVisualization?: boolean;
				chartType?: string;
				data?: any[];
				responseType?: 'chart' | 'text' | 'metric';
				metricValue?: string | number;
				metricLabel?: string;
			};
			debugInfo?: Record<string, any>;
	  }
	| {
			type: 'metadata';
			data: {
				conversationId: string;
				messageId: string;
			};
	  };

import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

export const feedbackCases: EvalCase[] = [
	{
		id: "feedback-explicit-bug-report-submits",
		category: "behavioral",
		name: "Submits feedback when the user explicitly asks to report a Databuddy bug",
		query:
			"The funnels page keeps crashing when I open it. Please send feedback to the Databuddy team about this so they can fix it.",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["feedback"],
		expect: {
			toolsCalled: ["submit_feedback"],
			maxSteps: 8,
		},
	},
	{
		id: "feedback-explicit-feature-request-submits",
		category: "behavioral",
		name: "Submits a feature request when the user asks to send one",
		query:
			"I really wish I could compare two funnels side by side. Can you send that to the Databuddy team as a feature request?",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["feedback"],
		expect: {
			toolsCalled: ["submit_feedback"],
			maxSteps: 8,
		},
	},
	{
		id: "feedback-offers-before-submitting",
		category: "behavioral",
		name: "Offers to send feedback but does not submit without agreement",
		query:
			"the errors page chart is completely blank but the table below it shows errors, this looks broken",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["feedback"],
		expect: {
			toolsNotCalled: ["submit_feedback"],
			responseMatches: [
				{
					pattern: "(send|file|report|pass|flag).{0,80}(feedback|bug|team)",
					flags: "is",
					description: "offers to send the report to the Databuddy team",
				},
			],
		},
	},
	{
		id: "feedback-vague-complaint-gets-clarified",
		category: "behavioral",
		name: "Asks for specifics instead of submitting a vague complaint",
		query: "this agent sucks, tell the team",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["feedback"],
		expect: {
			toolsNotCalled: ["submit_feedback"],
			responseMatches: [
				{
					pattern: "\\?",
					description: "asks a clarifying question about what went wrong",
				},
			],
		},
	},
	{
		id: "feedback-own-website-errors-stay-analytics",
		category: "behavioral",
		name: "Treats errors on the user's own website as analytics, not product feedback",
		query:
			"my checkout page is throwing errors for customers, can you look into it?",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["feedback"],
		expect: {
			toolsNotCalled: ["submit_feedback"],
		},
	},
];

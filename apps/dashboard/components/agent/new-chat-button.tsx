"use client";

import { generateId } from "ai";
import { useAtomValue, useSetAtom } from "jotai";
import { useParams, usePathname, useRouter } from "next/navigation";
import { agentInputAtom } from "@/components/agent/agent-atoms";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	formatFilterValue,
	getFieldLabel,
	getOperatorLabel,
} from "@/hooks/use-filters";
import { cn } from "@/lib/utils";
import {
	type DynamicQueryFilter,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import { PlusIcon, RobotIcon } from "@databuddy/ui/icons";
import { Button, dayjs } from "@databuddy/ui";

interface NewChatButtonProps {
	className?: string;
	onNewChat: (chatId: string) => void;
}

export function NewChatButton({ className, onNewChat }: NewChatButtonProps) {
	const handleNewChat = () => {
		onNewChat(generateId());
	};

	return (
		<Button
			aria-label="New chat"
			className={cn(className)}
			onClick={handleNewChat}
			size="sm"
		>
			<PlusIcon className="size-4 shrink-0" />
			New chat
		</Button>
	);
}

function describeChartScope(
	subject: string,
	startDate: string,
	endDate: string,
	filters: DynamicQueryFilter[]
) {
	const range = `${dayjs(startDate).format("MMM D, YYYY")} to ${dayjs(endDate).format("MMM D, YYYY")}`;
	const filterText = filters
		.map(
			(filter) =>
				`${getFieldLabel(filter.field)} ${getOperatorLabel(filter.operator)} ${formatFilterValue(filter.value)}`
		)
		.join(" and ");
	return filterText
		? `About ${subject}, ${range}, filtered to ${filterText}: `
		: `About ${subject}, ${range}: `;
}

interface AskAgentButtonProps {
	className?: string;
	subject: string;
}

export function AskAgentButton({ className, subject }: AskAgentButtonProps) {
	const params = useParams();
	const pathname = usePathname();
	const router = useRouter();
	const setInput = useSetAtom(agentInputAtom);
	const filters = useAtomValue(dynamicQueryFiltersAtom);
	const { dateRange } = useDateFilters();

	const websitePath =
		typeof params.id === "string" ? `/websites/${params.id}` : null;
	if (
		!(websitePath && pathname.startsWith(websitePath)) ||
		pathname.startsWith(`${websitePath}/agent`)
	) {
		return null;
	}

	const askAgent = () => {
		setInput(
			describeChartScope(
				subject,
				dateRange.start_date,
				dateRange.end_date,
				filters
			)
		);
		router.push(`${websitePath}/agent/${generateId()}`);
	};

	return (
		<Button
			aria-label={`Ask Databunny about ${subject}`}
			className={cn("size-7", className)}
			onClick={askAgent}
			size="icon"
			title="Ask Databunny"
			type="button"
			variant="ghost"
		>
			<RobotIcon className="size-4" />
		</Button>
	);
}

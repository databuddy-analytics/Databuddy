"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useAtomValue } from "jotai";
import { agentTitleAtom } from "./agent-atoms";

export function AgentTitle() {
	const chatTitle = useAtomValue(agentTitleAtom);

	return (
		<AnimatePresence mode="wait">
			{chatTitle && (
				<motion.div
					animate={{ width: "auto", opacity: 1 }}
					className="overflow-hidden"
					exit={{ width: 0, opacity: 0 }}
					initial={{ width: 0, opacity: 0 }}
					key={chatTitle}
					transition={{ duration: 0.2, ease: "easeOut" }}
				>
					<div className="whitespace-nowrap font-medium text-foreground text-xs">
						{chatTitle}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

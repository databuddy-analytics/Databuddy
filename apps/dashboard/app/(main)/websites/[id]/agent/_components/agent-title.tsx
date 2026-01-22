"use client";

import { useAtomValue } from"jotai";
import { AnimatePresence, motion } from"motion/react";
import { agentTitleAtom } from"./agent-atoms";

export function AgentTitle() {
	const chatTitle = useAtomValue(agentTitleAtom);

	return (
		<AnimatePresence mode="wait">
			{chatTitle ? (
				<motion.div
					animate={{ opacity: 1, scale: 1 }}
					className="origin-left"
					exit={{ opacity: 0, scale: 0.95 }}
					initial={{ opacity: 0, scale: 0.95 }}
					key={chatTitle}
					transition={{ duration: 0.2, ease:"easeOut" }}
				>
					<div className="whitespace-nowrap font-medium text-foreground text-xs">
						{chatTitle}
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

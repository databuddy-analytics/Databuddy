import { SparkleIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';

export const ChatGreeting = () => {
	return (
		<div
			className="mx-auto mt-4 flex size-full max-w-3xl flex-col items-center justify-center px-4 md:mt-16 md:px-8"
			key="overview"
		>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-accent/10"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.5 }}
			>
				<SparkleIcon className="h-8 w-8 text-primary" weight="duotone" />
			</motion.div>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="font-semibold text-lg"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.5 }}
			>
				Welcome to Databunny
			</motion.div>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="max-w-md text-center text-muted-foreground text-sm"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.6 }}
			>
				I'm Databunny, your data analyst. I can help you understand your website
				data through charts, metrics, and insights.
			</motion.div>
		</div>
	);
};

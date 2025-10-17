import type { Chat } from '@databuddy/db';
import { DotsThreeVerticalIcon, TrashIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { memo } from 'react';
import { toast } from 'sonner';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@/components/ui/sidebar';
import { trpc } from '@/lib/trpc';

const PureChatItem = ({
	chat,
	isActive,
	onDelete,
	setOpenMobile,
}: {
	chat: Chat;
	isActive: boolean;
	onDelete: (chatId: string) => void;
	setOpenMobile: (open: boolean) => void;
}) => {
	const deleteChatMutation = trpc.assistant.deleteChat.useMutation({
		onSuccess: () => {
			toast.success('Chat deleted successfully');
			onDelete(chat.id);
		},
		onError: (error) => {
			toast.error(error.message || 'Failed to delete chat');
		},
	});

	const handleDelete = () => {
		deleteChatMutation.mutate({ chatId: chat.id });
	};

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive}>
				<Link href={`/chat/${chat.id}`} onClick={() => setOpenMobile(false)}>
					<span>{chat.title}</span>
				</Link>
			</SidebarMenuButton>

			<DropdownMenu modal={true}>
				<DropdownMenuTrigger asChild>
					<SidebarMenuAction
						className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						showOnHover={!isActive}
					>
						<DotsThreeVerticalIcon />
						<span className="sr-only">More</span>
					</SidebarMenuAction>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" side="bottom">
					<DropdownMenuItem
						className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
						disabled={deleteChatMutation.isPending}
						onSelect={handleDelete}
					>
						<TrashIcon />
						<span>
							{deleteChatMutation.isPending ? 'Deleting...' : 'Delete'}
						</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
	if (prevProps.isActive !== nextProps.isActive) {
		return false;
	}
	return true;
});

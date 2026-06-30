"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Text } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";
import { ArrowRightIcon, CreditCardIcon } from "@databuddy/ui/icons";
import { orpc } from "@/lib/orpc";

interface RedeemDialogProps {
	creditsRequired: number;
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
	rewardAmount: number;
	rewardType: string;
	tierIndex: number;
}

export function RedeemDialog({
	open,
	onOpenChangeAction,
	tierIndex,
	creditsRequired,
	rewardAmount,
	rewardType,
}: RedeemDialogProps) {
	const queryClient = useQueryClient();
	const rewardLabel =
		rewardType === "agent-credits" ? "Agent credits" : "Events";

	const redeemMutation = useMutation({
		...orpc.feedback.redeemCredits.mutationOptions(),
		onSuccess: (result) => {
			toast.success(
				`Redeemed ${result.rewardAmount.toLocaleString()} ${rewardLabel.toLowerCase()}. ${result.remainingCredits.toLocaleString()} credits remaining.`
			);
			queryClient.invalidateQueries({
				queryKey: orpc.feedback.getCreditsBalance.queryOptions().queryKey,
			});
			onOpenChangeAction(false);
		},
		onError: (error) => {
			toast.error(error.message || "Failed to redeem credits");
		},
	});

	return (
		<Dialog onOpenChange={onOpenChangeAction} open={open}>
			<Dialog.Content className="border-sidebar-border/60 bg-sidebar">
				<Dialog.Header className="border-sidebar-border/50 border-b bg-sidebar px-5 py-4">
					<div className="flex items-start gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center rounded bg-sidebar-accent text-sidebar-foreground/65">
							<CreditCardIcon className="size-4" />
						</div>
						<div>
							<Dialog.Title className="text-sm">Redeem credits</Dialog.Title>
							<Dialog.Description>
								Confirm this exchange before we update your balance.
							</Dialog.Description>
						</div>
					</div>
				</Dialog.Header>
				<Dialog.Body className="space-y-3">
					<div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2">
						<div className="rounded border border-sidebar-border/50 bg-background/30 p-3">
							<Text tone="muted" variant="caption">
								Spend
							</Text>
							<p className="mt-1 font-semibold text-2xl text-foreground tabular-nums">
								{creditsRequired.toLocaleString()}
							</p>
							<Text tone="muted" variant="caption">
								credits
							</Text>
						</div>

						<div className="flex size-8 items-center justify-center rounded bg-sidebar-accent text-muted-foreground">
							<ArrowRightIcon className="size-4" />
						</div>

						<div className="rounded border border-sidebar-border/50 bg-background/30 p-3">
							<Text tone="muted" variant="caption">
								Receive
							</Text>
							<p className="mt-1 font-semibold text-2xl text-success tabular-nums">
								+{rewardAmount.toLocaleString()}
							</p>
							<Text tone="muted" variant="caption">
								{rewardLabel.toLowerCase()}
							</Text>
						</div>
					</div>
					<div className="rounded border border-sidebar-border/50 bg-sidebar-accent/35 px-3 py-2">
						<Text tone="muted" variant="caption">
							This action cannot be undone after redemption.
						</Text>
					</div>
				</Dialog.Body>
				<Dialog.Footer className="border-sidebar-border/50 border-t bg-sidebar-accent/35">
					<Dialog.Close>
						<Button variant="secondary">Cancel</Button>
					</Dialog.Close>
					<Button
						disabled={redeemMutation.isPending}
						loading={redeemMutation.isPending}
						onClick={() => redeemMutation.mutate({ tierIndex })}
					>
						Confirm
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}

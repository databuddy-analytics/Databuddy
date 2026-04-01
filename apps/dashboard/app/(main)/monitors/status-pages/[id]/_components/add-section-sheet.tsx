"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const formSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddSectionSheetProps {
	open: boolean;
	statusPageId: string;
	onCloseAction: () => void;
	onSaveAction: () => void;
}

export function AddSectionSheet({
	open,
	statusPageId,
	onCloseAction,
	onSaveAction,
}: AddSectionSheetProps) {
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			description: "",
		},
	});

	const addMutation = useMutation({
		...orpc.statusPage.addSection.mutationOptions(),
	});

	const handleSubmit = async (values: FormValues) => {
		await addMutation.mutateAsync({
			statusPageId,
			name: values.name,
			description: values.description || undefined,
		});

		onSaveAction();
		onCloseAction();
	};

	return (
		<Sheet onOpenChange={() => onCloseAction()} open={open}>
			<SheetContent className="w-full sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Add Section</SheetTitle>
					<SheetDescription>
						Group related monitors under a section heading
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form
						className="flex flex-1 flex-col overflow-hidden"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<SheetBody className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Section Name</FormLabel>
										<FormControl>
											<Input {...field} placeholder="Core Services" />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Description (optional)</FormLabel>
										<FormControl>
											<Textarea
												{...field}
												placeholder="Primary production services"
												rows={2}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</SheetBody>

						<SheetFooter>
							<Button
								onClick={() => onCloseAction()}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
							<Button
								className="min-w-28"
								disabled={addMutation.isPending || !form.formState.isValid}
								type="submit"
							>
								{addMutation.isPending ? "Adding..." : "Add Section"}
							</Button>
						</SheetFooter>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}

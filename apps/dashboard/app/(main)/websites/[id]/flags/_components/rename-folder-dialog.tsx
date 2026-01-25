"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useEffect } from "react";

const formSchema = z.object({
    name: z
        .string()
        .min(1, "Folder name is required")
        .max(50, "Folder name must be less than 50 characters")
        .regex(
            /^[a-zA-Z0-9\s-_]+$/,
            "Folder name can only contain letters, numbers, spaces, hyphens, and underscores"
        ),
});

interface RenameFolderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (newName: string) => void;
    currentName: string;
    isSubmitting?: boolean;
}

export function RenameFolderDialog({
    isOpen,
    onClose,
    onConfirm,
    currentName,
    isSubmitting = false,
}: RenameFolderDialogProps) {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: currentName,
        },
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({ name: currentName });
        }
    }, [isOpen, currentName, form]);

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        if (values.name === currentName) {
            onClose();
            return;
        }
        onConfirm(values.name);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rename Folder</DialogTitle>
                    <DialogDescription>
                        Enter a new name for the folder "{currentName}".
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Folder name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Renaming..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

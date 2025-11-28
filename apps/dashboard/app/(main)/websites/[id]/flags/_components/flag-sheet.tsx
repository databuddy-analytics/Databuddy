"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlagIcon, Info } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/elastic-slider";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import type { Flag } from "./types";
import { UserRulesBuilder } from "./user-rules-builder";
import { DependencySelector } from "./dependency-selector";
import { VariantEditor } from "./variant-editor";
import { ScheduleManager } from "./schedule-manager";
import {
  createFlagScheduleSchema,
  FlagSchedule,
} from "@databuddy/shared/types/flags";

const userRuleSchema = z.object({
  type: z.enum(["user_id", "email", "property"]),
  operator: z.enum([
    "equals",
    "contains",
    "starts_with",
    "ends_with",
    "in",
    "not_in",
    "exists",
    "not_exists",
  ]),
  field: z.string().optional(),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  enabled: z.boolean(),
  batch: z.boolean(),
  batchValues: z.array(z.string()).optional(),
});

const variantSchema = z.object({
  key: z.string().min(1, "Key is required").max(50, "Key too long"),
  value: z.any(),
  weight: z.number().min(0).max(100),
  description: z.string().optional(),
});

const flagFormSchema = z
  .object({
    key: z
      .string()
      .min(1, "Key is required")
      .max(100, "Key too long")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Key must contain only letters, numbers, underscores, and hyphens"
      ),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name too long")
      .optional(),
    description: z.string().optional(),
    type: z.enum(["boolean", "rollout", "multivariant"]),
    status: z.enum(["active", "inactive", "archived"]),
    defaultValue: z.boolean(),
    rolloutPercentage: z.number().min(0).max(100),
    rules: z.array(userRuleSchema).optional(),
    variants: z.array(variantSchema).optional(),
    dependencies: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "multivariant" && data.variants) {
      const totalWeight = data.variants.reduce(
        (sum, v) => sum + (v.weight || 0),
        0
      );
      if (totalWeight !== 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants"],
        });
      }
    }
  });

export const flagWithScheduleSchema = z.object({
  flag: flagFormSchema,
  schedule: createFlagScheduleSchema.optional(),
});

type FlagWithScheduleForm = z.infer<typeof flagWithScheduleSchema>;

type FlagSheetProps = {
  isOpen: boolean;
  onCloseAction: () => void;
  websiteId: string;
  flag?: Flag | null;
};

export function FlagSheet({
  isOpen,
  onCloseAction,
  websiteId,
  flag,
}: FlagSheetProps) {
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const queryClient = useQueryClient();

  const { data: flagsList } = useQuery({
    ...orpc.flags.list.queryOptions({
      input: { websiteId },
    }),
  });
  const { data: schedules, isLoading: isFlagSchedulesLoading } = useQuery(
    orpc.flagSchedules.get.queryOptions({
      input: { flagId: flag?.id || "" },
      enabled: !!flag?.id,
    })
  );
  const isEditing = Boolean(flag);

  const form = useForm<FlagWithScheduleForm>({
    resolver: zodResolver(flagWithScheduleSchema),
    defaultValues: {
      flag: {
        key: "",
        name: "",
        description: "",
        type: "boolean",
        status: "active",
        defaultValue: false,
        rolloutPercentage: 0,
        rules: [],
        variants: [],
        dependencies: [],
      },
      schedule: undefined,
    },
  });

  const createMutation = useMutation({
    ...orpc.flags.create.mutationOptions(),
  });
  const updateMutation = useMutation({
    ...orpc.flags.update.mutationOptions(),
  });

  useEffect(() => {
    if (isOpen) {
      if (flag && isEditing) {
        form.reset({
          flag: {
            key: flag.key,
            name: flag.name || "",
            description: flag.description || "",
            type: flag.type,
            status: flag.status,
            defaultValue: Boolean(flag.defaultValue),
            rolloutPercentage: flag.rolloutPercentage ?? 0,
            rules: flag.rules ?? [],
            variants: flag.variants ?? [],
            dependencies: flag.dependencies ?? [],
          },
          schedule: undefined, // always fresh when editing
        });
      } else {
        form.reset({
          flag: {
            key: "",
            name: "",
            description: "",
            type: "boolean",
            status: "active",
            defaultValue: false,
            rolloutPercentage: 0,
            rules: [],
            variants: [],
            dependencies: [],
          },
          schedule: undefined,
        });
      }

      setKeyManuallyEdited(false);
    }
  }, [isOpen, flag, isEditing, form]);

  const watchedName = form.watch("flag.name");
  const watchedType = form.watch("flag.type");

  useEffect(() => {
    if (isEditing || keyManuallyEdited || !watchedName) {
      return;
    }

    const key = watchedName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    form.setValue("flag.key", key);
  }, [watchedName, keyManuallyEdited, isEditing]);

  const showRolloutPercentage = watchedType === "rollout";
  const showVariants = watchedType === "multivariant";
  const showDefaultValue = watchedType !== "multivariant";

  const createFlagScheduleMutation = useMutation(
    orpc.flagSchedules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.flagSchedules.list.key({
            input: { flagId: flag?.id },
          }),
        });
        toast.success("Schedule created successfully");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const onSubmit = async (formData: FlagWithScheduleForm) => {
    try {
      const data = formData.flag;
      const schedule = formData.schedule;

      const mutation = isEditing ? updateMutation : createMutation;

      const mutationData =
        isEditing && flag
          ? {
              id: flag.id,
              name: data.name,
              description: data.description,
              type: data.type,
              status: data.status,
              defaultValue: data.defaultValue,
              rolloutPercentage: data.rolloutPercentage,
              rules: data.rules || [],
              variants: data.variants || [],
              dependencies: data.dependencies || [],
            }
          : {
              websiteId,
              key: data.key,
              name: data.name,
              description: data.description,
              type: data.type,
              status: data.status,
              defaultValue: data.defaultValue,
              rolloutPercentage: data.rolloutPercentage,
              rules: data.rules || [],
              variants: data.variants || [],
              dependencies: data.dependencies || [],
            };

      const updatedFlag = await mutation.mutateAsync(mutationData as any);
      const flagIdToUse = isEditing ? flag!.id : updatedFlag.id;

      // Handle Schedule Creation
      if (schedule) {
        if (
          schedule.action === "update_rollout" &&
          schedule.rolloutSteps &&
          schedule.rolloutSteps.length > 0
        ) {
          await createFlagScheduleMutation.mutateAsync({
            flagId: flagIdToUse,
            action: schedule.action,
            timezone: schedule.timezone,
            scheduledAt: schedule.scheduledAt,
            value: schedule.value,
            rolloutSteps: schedule.rolloutSteps || [],
          });
        } else {
          await createFlagScheduleMutation.mutateAsync({
            flagId: flagIdToUse,
            action: schedule.action,
            timezone: schedule.timezone,
            scheduledAt: schedule.scheduledAt!,
            value: schedule.value,
          });
        }
      }

      toast.success(`Flag ${isEditing ? "updated" : "created"} successfully`);

      queryClient.invalidateQueries({
        queryKey: orpc.flagSchedules.list.key({
          input: { flagId: flagIdToUse },
        }),
      });

      queryClient.invalidateQueries({
        queryKey: orpc.flags.list.key({ input: { websiteId } }),
      });

      onCloseAction();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("unique") || errorMessage.includes("CONFLICT")) {
        toast.error("A flag with this key already exists in this scope");
      } else if (errorMessage.includes("FORBIDDEN")) {
        toast.error("You do not have permission to perform this action");
      } else {
        toast.error(`Failed to ${isEditing ? "update" : "create"} flag`);
      }
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet onOpenChange={onCloseAction} open={isOpen}>
      <SheetContent
        className="w-full overflow-y-auto p-4 sm:w-[90vw] sm:max-w-[800px] md:w-[70vw] lg:w-[60vw]"
        side="right"
      >
        <SheetHeader className="space-y-3 border-border/50 border-b pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded border border-primary/20 bg-primary/10 p-3">
              <FlagIcon className="h-6 w-6 text-primary" weight="duotone" />
            </div>
            <div>
              <SheetTitle className="font-semibold text-foreground text-xl">
                {isEditing ? "Edit Feature Flag" : "Create Feature Flag"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-muted-foreground">
                {isEditing
                  ? "Update flag configuration and settings"
                  : "Set up a new feature flag for controlled rollouts"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-8 pt-6">
          <Form {...form}>
            <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
              {/* Basic Information */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="flag.name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flag Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="New Dashboard Feature"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="flag.key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Key{" "}
                          {!isEditing && (
                            <span aria-hidden="true" className="text-red-500">
                              *
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="new-dashboard"
                            {...field}
                            disabled={isEditing}
                            onChange={(e) => {
                              const value = e.target.value;
                              setKeyManuallyEdited(value.length > 0);
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        {isEditing && (
                          <FormDescription>
                            Flag keys cannot be changed after creation to
                            maintain data integrity.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="flag.description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What does this flag control?"
                          rows={2}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Configuration */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="flag.type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flag Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="boolean">
                              Boolean (On/Off)
                            </SelectItem>
                            <SelectItem value="rollout">
                              Rollout (Percentage)
                            </SelectItem>
                            <SelectItem value="multivariant">
                              Multi-Variant (A/B/n)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="flag.status"
                    render={({ field }) => {
                      const watchedDependencies:string[] =
                        form.watch("flag.dependencies") || [];
                      const hasInactiveDependency = watchedDependencies.some(
                        (depKey) => {
                          const depFlag = flagsList?.find(
                            (f) => f.key === depKey
                          );
                          return depFlag && depFlag.status !== "active";
                        }
                      );

                      const inactiveDeps = watchedDependencies
                        .map((depKey) => {
                          const depFlag = flagsList?.find(
                            (f) => f.key === depKey
                          );
                          return depFlag && depFlag.status !== "active"
                            ? depFlag
                            : null;
                        })
                        .filter(Boolean);

                      const canBeActive = !hasInactiveDependency;

                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Status
                            {hasInactiveDependency && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium mb-1">
                                      Cannot activate flag
                                    </p>
                                    <p className="text-sm">
                                      The following dependencies are inactive:
                                    </p>
                                    <ul className="text-sm list-disc list-inside mt-1">
                                      {inactiveDeps.map((dep: any) => (
                                        <li key={dep.key}>
                                          {dep.name || dep.key}
                                        </li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </FormLabel>
                          <Select
                            onValueChange={(value) => {
                              if (value === "active" && hasInactiveDependency) {
                                return;
                              }
                              field.onChange(value);
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem
                                value="active"
                                disabled={!canBeActive}
                              >
                                Active
                                {!canBeActive && " (Dependencies inactive)"}
                              </SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {showDefaultValue && (
                    <FormField
                      control={form.control}
                      name="flag.defaultValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Value</FormLabel>
                          <FormControl>
                            <div className="flex h-10 items-center justify-center rounded-md border bg-background px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={
                                    field.value
                                      ? "text-muted-foreground"
                                      : "font-medium"
                                  }
                                >
                                  Off
                                </span>
                                <Switch
                                  aria-label="Toggle default flag value"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                                <span
                                  className={
                                    field.value
                                      ? "font-medium"
                                      : "text-muted-foreground"
                                  }
                                >
                                  On
                                </span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Rollout Percentage */}
              {showRolloutPercentage && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="flag.rolloutPercentage"
                    render={({ field }) => {
                      const currentValue = Number(field.value) || 0;

                      return (
                        <FormItem>
                          <FormLabel>Rollout Percentage</FormLabel>
                          <FormControl>
                            <div className="space-y-4">
                              <Slider
                                max={100}
                                min={0}
                                onValueChange={field.onChange}
                                step={5}
                                value={currentValue}
                              />
                              <div className="flex flex-wrap justify-center gap-2">
                                {[0, 25, 50, 75, 100].map((preset) => (
                                  <button
                                    aria-label={`Set rollout to ${preset}% ${preset === 0 ? "(disabled)" : preset === 100 ? "(enabled)" : ""}`}
                                    className={`rounded border px-3 py-2 text-sm transition-colors ${
                                      currentValue === preset
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border hover:border-primary/50"
                                    }`}
                                    key={preset}
                                    onClick={() => field.onChange(preset)}
                                    type="button"
                                  >
                                    {preset}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          </FormControl>
                          <FormDescription>
                            Percentage of users who will see this flag enabled.
                            0% = disabled, 100% = fully enabled.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              )}

              {/* Variants Editor */}
              {showVariants && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="flag.variants"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <VariantEditor
                            variants={field.value || []}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* User Targeting Rules */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="flag.rules"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User Targeting (Optional)</FormLabel>
                      <FormControl>
                        <UserRulesBuilder
                          onChange={field.onChange}
                          rules={field.value || []}
                        />
                      </FormControl>
                      <FormDescription>
                        Define rules to target specific users or groups
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dependencies */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="flag.dependencies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dependencies (Optional)</FormLabel>
                      <FormControl>
                        <DependencySelector
                          value={field.value || []}
                          onChange={field.onChange}
                          availableFlags={flagsList || []}
                          currentFlagKey={flag?.key}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Scheduled Changes */}
              <div className="space-y-4 pt-4 border-t">
                <ScheduleManager form={form} flagType={watchedType} />
              </div>

              <div className="flex justify-end gap-3 border-t pt-6">
                <Button onClick={onCloseAction} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isLoading} type="submit">
                  {isLoading ? "Saving..." : isEditing ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

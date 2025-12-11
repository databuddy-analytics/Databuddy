"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, FlagIcon, InfoIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Flag } from "./types";
import { UserRulesBuilder } from "./user-rules-builder";
import { DependencySelector } from "./dependency-selector";
import { VariantEditor } from "./variant-editor";
import { ScheduleManager } from "./schedule-manager";
import {
  FlagWithScheduleForm,
  flagWithScheduleSchema,
} from "@databuddy/shared/flags";
import { DATE_FORMATS, formatDate } from "@/lib/formatters";
import { Textarea } from "@/components/ui/textarea";

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

  const { data: schedule } = useQuery({
    ...orpc.flagSchedules.getByFlagId.queryOptions({
      input: { flagId: flag?.id ?? "" },
    }),
    enabled: Boolean(flag?.id),
  });
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
        environment: undefined,
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
            environment: flag.environment || undefined,
          },
          schedule: schedule
            ? {
              id: schedule?.id,
              type: schedule?.type,
              isEnabled: schedule?.isEnabled || false,
              scheduledAt: schedule?.scheduledAt
                ? new Date(schedule.scheduledAt).toISOString()
                : undefined,
              rolloutSteps: schedule?.rolloutSteps ?? [],
              flagId: schedule?.flagId,
            }
            : undefined,
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
  }, [isOpen, flag, isEditing, form, schedule]);

  const watchedName = form.watch("flag.name");
  const watchedType = form.watch("flag.type");
  const watchedIsScheduleEnabled = form.watch("schedule.isEnabled");
  const watchedRolloutSteps = form.watch("schedule.rolloutSteps");
  const rolloutStepsErrors = form.formState.errors.schedule?.rolloutSteps?.message;

  useEffect(() => {
    if (watchedIsScheduleEnabled === false) {
      form.setValue("schedule", undefined);
    } else if (watchedIsScheduleEnabled === true && flag?.id) {
      form.setValue("schedule.flagId", flag.id);
    }
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
  }, [watchedName, keyManuallyEdited, isEditing, watchedIsScheduleEnabled]);

  const showRolloutPercentage = watchedType === "rollout";
  const showVariants = watchedType === "multivariant";
  const showDefaultValue = watchedType !== "multivariant";

  const createFlagScheduleMutation = useMutation({
    ...orpc.flagSchedules.create.mutationOptions(),
  });
  const updateFlagScheduleMutation = useMutation({
    ...orpc.flagSchedules.update.mutationOptions(),
  });

  const onSubmit = async (formData: FlagWithScheduleForm) => {
    try {
      const data = formData.flag;
      const scheduleData = formData.schedule;

      const mutation = isEditing ? updateMutation : createMutation;

      const mutationData: any = {
        name: data.name,
        description: data.description,
        type: data.type,
        status: data.status,
        defaultValue: data.defaultValue,
        rolloutPercentage: data.rolloutPercentage,
        rules: data.rules || [],
        variants: data.variants || [],
        dependencies: data.dependencies || [],
        environment: data.environment?.trim() || null,
      }

      if (isEditing && flag) {
        mutationData.id = flag.id
      } else {
        mutationData.websiteId = websiteId
        mutationData.key = data.key
        mutationData.name = data.name
      }

      const updatedFlag = await mutation.mutateAsync(mutationData as any);
      const flagIdToUse = isEditing ? flag!.id : updatedFlag.id;

      // Handle Schedule Creation
      if (scheduleData) {
        let scheduleMutationData: any = {
          flagId: flagIdToUse,
          type: scheduleData.type,
          scheduledAt: scheduleData.scheduledAt,
          rolloutSteps: scheduleData.rolloutSteps || [],
          isEnabled: scheduleData.isEnabled,
        };
        if (schedule && schedule.id) {
          scheduleMutationData.id = schedule.id;
          await updateFlagScheduleMutation.mutateAsync(scheduleMutationData);
        } else {
          await createFlagScheduleMutation.mutateAsync(scheduleMutationData);
        }
      }

      toast.success(`Flag ${isEditing ? "updated" : "created"} successfully`);

      queryClient.invalidateQueries({
        queryKey: orpc.flagSchedules.getByFlagId.queryKey({
          input: { flagId: flagIdToUse },
        }),
      });

      queryClient.invalidateQueries({
        queryKey: orpc.flags.list.key({ input: { websiteId } }),
      });

      onCloseAction();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (
        errorMessage.includes("unique") ||
        errorMessage.includes("CONFLICT")
      ) {
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
      <SheetContent side="right">
        <SheetHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
              <FlagIcon
                className="text-accent-foreground"
                size={22}
                weight="fill"
              />
            </div>
            <div>
              <SheetTitle className="text-lg">
                {isEditing ? "Edit Feature Flag" : "Create Feature Flag"}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? "Update flag configuration and settings"
                  : "Set up a new feature flag for controlled rollouts"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col overflow-y-auto"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SheetBody className="space-y-6">
              {/* Basic Information */}
              <section className="space-y-3">
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
                          {isEditing ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon
                                  className="h-4 w-4"
                                  weight="duotone"
                                />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2">
                                  <p className="text-xs leading-relaxed">
                                    Key cannot be changed after creation to
                                    maintain data integrity.
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
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
                      <FormLabel>
                        Description{" "}
                        <span className="text-muted-foreground text-xs">
                          (Optional)
                        </span>
                      </FormLabel>
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
              </section>

              {/* Configuration */}
              <section className="space-y-3">
                <div className="flex flex-wrap gap-8">
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
                      const watchedDependencies: string[] =
                        form.watch("flag.dependencies") || [];

                      // Find all inactive dependencies
                      const inactiveDeps = (flagsList || []).filter(
                        (flag) => watchedDependencies.includes(flag.key) && flag.status !== "active"
                      );

                      const canBeActive = inactiveDeps.length === 0;

                      return (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Status
                            {!canBeActive && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <InfoIcon className="h-4 w-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="font-medium mb-1">
                                      Cannot activate flag
                                    </p>
                                    <p className="text-sm">
                                      The following dependencies are inactive:
                                    </p>
                                    <ul className="text-sm list-disc list-inside mt-1">
                                      {inactiveDeps.map((dep) => (
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
                              if (value === "active" && !canBeActive) {
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
                            <div className="flex h-9 w-fit items-center justify-center rounded-md border bg-accent-brighter/80 px-3 will-change-contents">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-sm",
                                    field.value === false
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground/50"
                                  )}
                                >
                                  Off
                                </span>
                                <Switch
                                  aria-label="Toggle default flag value"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                                <span
                                  className={cn(
                                    "text-sm",
                                    field.value === true
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground/50"
                                  )}
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

                  <FormField
                    control={form.control}
                    name="flag.environment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Environment
                          <span className="text-muted-foreground text-xs">
                            (Optional)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. production"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </section>

              {/* Rollout Percentage */}
              {showRolloutPercentage && (
                <section className="space-y-3">
                  <FormField
                    control={form.control}
                    name="flag.rolloutPercentage"
                    render={({ field }) => {
                      const currentValue = Number(field.value) || 0;
                      const hasRolloutSteps = (watchedRolloutSteps || []).length > 0;

                      return (
                        <FormItem>
                          <FormLabel>Rollout Percentage</FormLabel>
                          <FormControl>
                            {!hasRolloutSteps ? (
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
                                      className={`rounded border px-3 py-2 text-sm ${currentValue === preset
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
                            ) : (
                              <div className="rounded-md border border-dashed p-4 text-center">
                                <p className="text-sm text-muted-foreground">
                                  Rollout percentage will be controlled by scheduled steps below.
                                  <br />
                                  Current: <span className="font-medium text-foreground">{currentValue}%</span>
                                </p>
                              </div>
                            )}
                          </FormControl>
                          {!hasRolloutSteps && (
                            <FormDescription className="mx-auto text-muted-foreground text-xs">
                              Percentage of users who will see this flag enabled.
                              0% = disabled, 100% = fully enabled.
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* Scheduled Rollout Steps */}
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <FormLabel>Scheduled Rollout Steps</FormLabel>
                        <FormDescription>
                          Automatically update rollout percentage over time
                        </FormDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentSchedule = form.getValues("schedule");
                          form.setValue("schedule.rolloutSteps", [
                            ...(watchedRolloutSteps || []),
                            {
                              scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                              value: 0,
                            },
                          ]);
                          // Ensure all required schedule fields are set
                          if (!currentSchedule?.type) {
                            form.setValue("schedule.type", "update_rollout");
                          }
                          if (currentSchedule?.isEnabled === undefined || currentSchedule?.isEnabled === null) {
                            form.setValue("schedule.isEnabled", true);
                          }
                          if (!currentSchedule?.flagId && flag?.id) {
                            form.setValue("schedule.flagId", flag.id);
                          }
                        }}
                      >
                        Add Step
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {(watchedRolloutSteps || []).map((step, idx) => {
                        // Helper function to ensure schedule fields are set when modifying steps
                        const ensureScheduleFields = () => {
                          const currentSchedule = form.getValues("schedule");
                          if (!currentSchedule?.type) {
                            form.setValue("schedule.type", "update_rollout");
                          }
                          if (currentSchedule?.isEnabled === false || currentSchedule?.isEnabled === undefined) {
                            form.setValue("schedule.isEnabled", true);
                          }
                          if (!currentSchedule?.flagId && flag?.id) {
                            form.setValue("schedule.flagId", flag.id);
                          }
                        };

                        return (
                          <div
                            key={idx}
                            className="flex items-end gap-4 rounded-md border p-4"
                          >
                            <FormItem className="grow">
                              <FormLabel>Step Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !step.scheduledAt && "text-muted-foreground"
                                    )}
                                  >
                                    {step.scheduledAt
                                      ? formatDate(new Date(step.scheduledAt), DATE_FORMATS.DATE_TIME_12H)
                                      : "Pick a Time"}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={
                                      step.scheduledAt
                                        ? new Date(step.scheduledAt)
                                        : undefined
                                    }
                                    onSelect={(date) => {
                                      if (date) {
                                        ensureScheduleFields();
                                        const newSteps = [...(watchedRolloutSteps || [])];
                                        newSteps[idx].scheduledAt = date.toISOString();
                                        form.setValue("schedule.rolloutSteps", newSteps);
                                      }
                                    }}
                                  />
                                  <div className="p-3 border-t">
                                    <Input
                                      type="time"
                                      defaultValue={
                                        step.scheduledAt
                                          ? formatDate(
                                            new Date(step.scheduledAt),
                                            DATE_FORMATS.DATE_TIME_12H
                                          )
                                          : ""
                                      }
                                      onChange={(e) => {
                                        ensureScheduleFields();
                                        const date = step.scheduledAt
                                          ? new Date(step.scheduledAt)
                                          : new Date();
                                        const [h, m] = e.target.value.split(":");
                                        date.setHours(Number(h), Number(m));
                                        const newSteps = [...(watchedRolloutSteps || [])];
                                        newSteps[idx].scheduledAt = date.toISOString();
                                        form.setValue("schedule.rolloutSteps", newSteps);
                                      }}
                                    />
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </FormItem>

                            <FormItem className="grow">
                              <FormLabel>Rollout %</FormLabel>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={step.value}
                                onChange={(e) => {
                                  ensureScheduleFields();
                                  const newSteps = [...(watchedRolloutSteps || [])];
                                  newSteps[idx].value = Number(e.target.value);
                                  form.setValue("schedule.rolloutSteps", newSteps);
                                }}
                              />
                            </FormItem>

                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => {
                                const filtered = (watchedRolloutSteps || []).filter(
                                  (_, i) => i !== idx
                                );
                                form.setValue("schedule.rolloutSteps", filtered);
                              }}
                            >
                              <TrashIcon className="h-4 w-4" weight="duotone" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    {rolloutStepsErrors && (
                      <FormMessage>{rolloutStepsErrors}</FormMessage>
                    )}
                  </div>
                </section>
              )}

              {/* Variants Editor */}
              {showVariants && (
                <section className="space-y-4">
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
                </section>
              )}

              {/* User Targeting Rules */}
              <section className="space-y-3">
                <FormField
                  control={form.control}
                  name="flag.rules"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        User Targeting{" "}
                        <span className="text-muted-foreground text-xs">
                          (Optional)
                        </span>
                      </FormLabel>
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
              </section>

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
              {watchedType !== "rollout" && (
                <div className="space-y-4 pt-4 border-t">
                  <ScheduleManager form={form} />
                </div>
              )}
            </SheetBody>

            <SheetFooter>
              <Button onClick={onCloseAction} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={isLoading} type="submit">
                {isLoading
                  ? isEditing
                    ? "Updating..."
                    : "Creating..."
                  : isEditing
                    ? "Update Flag"
                    : "Create Flag"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

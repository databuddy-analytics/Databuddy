"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn, formatDate } from "@/lib/utils";
import { CalendarIcon, Trash } from "@phosphor-icons/react";
import { UseFormReturn, UseFormSetValue } from "react-hook-form";
import type {
  FlagSchedule,
  FlagScheduleType,
  FlagType,
} from "@databuddy/shared/flags";

interface ScheduleManagerProps {
  form: UseFormReturn<any>;
  flagType: FlagType;
  setValue: UseFormSetValue<any>;
}

export function ScheduleManager({ form, flagType, setValue }: ScheduleManagerProps) {
  const rolloutSteps = form.watch("schedule.rolloutSteps") || [];
  const scheduleEnabled = form.watch("schedule.isEnabled");
  const watchedScheduledType = form.watch("schedule.type");

  function addRolloutStep() {
    form.setValue("schedule.rolloutSteps", [
      ...rolloutSteps,
      {
        scheduledAt: new Date().toISOString(),
        value: 0,
      },
    ]);
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Schedule Changes</h3>
          <p className="text-xs text-muted-foreground">
            Automatically update this flag at a specific time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FormField
            // control={form.control}
            name="isEnabled"
            render={() => (
              <FormItem className="flex items-center gap-2">
                <FormLabel className="text-sm text-muted-foreground">
                  {scheduleEnabled ? "Enabled" : "Disabled"}
                </FormLabel>
                <FormControl>
                  <Switch
                    id="schedule-toggle"
                    checked={scheduleEnabled}
                    onCheckedChange={(value) => {
                      setValue("schedule.isEnabled", value);
                      if (!value) {
                        setValue("schedule", undefined);
                      }
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>

      {scheduleEnabled && (
        <div className="rounded-md border p-4 bg-muted/30 space-y-4">
          <div className="flex gap-2">
            <FormField
              control={form.control}
              name="schedule.type"
              render={({ field }) => (
                <FormItem className="grow">
                  <FormLabel>Schedule Type</FormLabel>
                  <Select
                    onValueChange={(e) => {
                      if (watchedScheduledType === "update_rollout") {
                        addRolloutStep();
                      }
                      field.onChange(e);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="enable">Enable</SelectItem>
                      <SelectItem value="disable">Disable</SelectItem>
                      {flagType === "rollout" && (
                        <SelectItem value="update_rollout">
                          Update Rollout %
                        </SelectItem>
                      )}
                      {/* {flagType === "boolean" && (
                        <SelectItem value="update_default">
                          Update Default Value
                        </SelectItem>
                      )} */}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schedule.scheduledAt"
              disabled={watchedScheduledType === "update_rollout"}
              render={({ field }) => (
                <FormItem className="flex flex-col grow">
                  <FormLabel>Date & Time</FormLabel>

                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={watchedScheduledType === "update_rollout"}
                        >
                          {field.value
                            ? formatDate(new Date(field.value), "PPP p")
                            : "Pick a Time"}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>

                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          field.value ? new Date(field.value) : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            const currentTime = field.value
                              ? new Date(field.value)
                              : new Date();
                            date.setHours(currentTime.getHours());
                            date.setMinutes(currentTime.getMinutes());
                            field.onChange(date.toISOString());
                          }
                        }}
                      />

                      <div className="p-3 border-t">
                        <Input
                          type="time"
                          defaultValue={
                            field.value
                              ? formatDate(new Date(field.value), "HH:mm")
                              : ""
                          }
                          onChange={(e) => {
                            const date = field.value
                              ? new Date(field.value)
                              : new Date();
                            const [h, m] = e.target.value.split(":");
                            date.setHours(Number(h), Number(m));
                            field.onChange(date.toISOString());
                          }}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {watchedScheduledType === "update_rollout" && (
            <div className="space-y-4">
              {flagType !== "rollout" && (
                <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
                  <p className="text-sm font-medium text-amber-900">
                    ⚠️ Cannot schedule rollout on {flagType} flag
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    "Update Rollout %" only works with Rollout-type flags.
                    Consider selecting "Enable" or "Disable" instead.
                  </p>
                </div>
              )}

              {/* Rollout Steps */}
              <div className="flex items-center justify-between">
                <FormLabel>Gradual Rollout Steps</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRolloutStep}
                >
                  Add Step
                </Button>
              </div>

              <div className="space-y-3">
                {rolloutSteps.map((step: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 rounded-md border p-4 bg-muted/30"
                  >
                    <div className="flex-1">
                      <FormLabel>Step Date</FormLabel>
                      <Input
                        type="datetime-local"
                        value={step.scheduledAt.slice(0, 16)}
                        onChange={(e) => {
                          const newSteps = [...rolloutSteps];
                          newSteps[idx].scheduledAt = new Date(
                            e.target.value
                          ).toISOString();
                          form.setValue("schedule.rolloutSteps", newSteps);
                        }}
                      />
                    </div>

                    <div className="w-32">
                      <FormLabel>Rollout %</FormLabel>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={step.value}
                        onChange={(e) => {
                          const newSteps = [...rolloutSteps];
                          newSteps[idx].value = Number(e.target.value);
                          form.setValue("schedule.rolloutSteps", newSteps);
                        }}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const filtered = rolloutSteps.filter(
                          (_: any, i: number) => i !== idx
                        );
                        form.setValue("schedule.rolloutSteps", filtered);
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

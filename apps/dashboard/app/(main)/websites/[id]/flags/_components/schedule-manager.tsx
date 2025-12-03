"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
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
import { cn } from "@/lib/utils";
import { CalendarIcon, TrashIcon } from "@phosphor-icons/react";
import { UseFormReturn, UseFormSetValue } from "react-hook-form";
import type {
  FlagSchedule,
  FlagScheduleType,
  FlagType,
  FlagWithScheduleForm,
} from "@databuddy/shared/flags";
import { DATE_FORMATS, formatDate } from "../../../../../../lib/formatters";

interface ScheduleManagerProps {
  form: UseFormReturn<FlagWithScheduleForm>;
}

export function ScheduleManager({
  form,
}: ScheduleManagerProps) {
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
                      form.setValue("schedule.isEnabled", value);
                      if (!value) {
                        form.setValue("schedule", undefined);
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
        <div className="rounded-md border p-4  space-y-4">
          <div className="flex gap-2">
            <FormField
              control={form.control}
              name="schedule.type"
              render={({ field }) => (
                <FormItem className="grow">
                  <FormLabel>Schedule Type</FormLabel>
                  <Select
                    onValueChange={(e) => {
                      if (e === "update_rollout" && (rolloutSteps.length === 0 || !rolloutSteps)) {
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
                    </SelectContent>
                  </Select>
                  {watchedScheduledType === "update_rollout" && <FormDescription>
                    Schedule different rollouts for your traffic.
                  </FormDescription>}
                </FormItem>
              )}
            />

            {watchedScheduledType !== "update_rollout" &&
              <FormField
                control={form.control}
                name="schedule.scheduledAt"
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
                          >
                            {field.value
                              ? formatDate(new Date(field.value), DATE_FORMATS.DATE_TIME_12H)
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
                                ? formatDate(new Date(field.value), DATE_FORMATS.TIME_ONLY)
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
              />}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import {
  FlagIcon,
  FunnelSimpleIcon,
  LightbulbIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlagExamples } from "./flag-examples";
import { FlagRow } from "./flag-row";
import type { Flag } from "./types";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { getShouldShowExamples } from "@/lib/flags/get-examples-strategy";

type FlagsListProps = {
  flags: Flag[];
  isLoading: boolean;
  onCreateFlagAction: () => void;
  onEditFlagAction: (flag: Flag) => void;
};

type FlagStatus = "active" | "inactive" | "archived";

export function FlagsList({
  flags,
  isLoading,
  onCreateFlagAction,
  onEditFlagAction,
}: FlagsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlagStatus | "all">("all");
  const [showExamples, setShowExamples] = useState(false);

  const filteredFlags = flags.filter((flag) => {
    // Status filter
    if (statusFilter !== "all" && flag.status !== statusFilter) {
      return false;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        flag.key.toLowerCase().includes(query) ||
        flag.name?.toLowerCase().includes(query) ||
        flag.description?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  if (isLoading) {
    return null; // Skeleton is handled by parent
  }

  if (flags.length === 0) {
    return (
      <EmptyState
        action={{
          label: "Create Your First Flag",
          onClick: onCreateFlagAction,
        }}
        className="h-full py-0"
        description="Create your first feature flag to start controlling feature rollouts and A/B testing across your application."
        icon={<FlagIcon weight="duotone" />}
        title="No feature flags yet"
        variant="minimal"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlassIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flags by key, name, description"
              value={searchQuery}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value: FlagStatus | "all") =>
                setStatusFilter(value)
              }
              value={statusFilter}
            >
              <SelectTrigger className="w-36">
                <FunnelSimpleIcon className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground text-sm">
            {filteredFlags.length} flag{filteredFlags.length !== 1 ? "s" : ""}
          </div>
          <Button
            variant={"default"}
            size="sm"
            onClick={() => setShowExamples(!showExamples)}
          >
            <LightbulbIcon className="mr-2 h-4 w-4" weight="duotone" />
            {showExamples ? "Hide" : "View"} Examples
          </Button>
        </div>
      </div>

      {/* Show Examples or Flags */}
      {showExamples ? (
        <FlagExamples
          onCreateFromTemplate={(template) => {
            // TODO: Auto-fill create form with template
            setShowExamples(false);
            onCreateFlagAction();
          }}
          showExamples={showExamples}
        />
      ) : (
        <>
          {/* Flags List */}
          {filteredFlags.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FlagIcon
                className="h-12 w-12 text-muted-foreground"
                weight="duotone"
              />
              <h3 className="mt-4 font-medium">No flags found</h3>
              <p className="mt-2 text-muted-foreground text-sm">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFlags.map((flag) => (
                <FlagRow
                  flag={flag}
                  key={flag.id}
                  onEditAction={() => onEditFlagAction(flag)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

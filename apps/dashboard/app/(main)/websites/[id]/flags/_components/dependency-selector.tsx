"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "@phosphor-icons/react";

interface DependencySelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
  availableFlags: Array<{ key: string; name: string | null }>;
  currentFlagKey?: string;
}

export function DependencySelector({
  value,
  onChange,
  availableFlags,
  currentFlagKey,
}: DependencySelectorProps) {
  const selectableFlags = availableFlags.filter(
    (f) => f.key !== currentFlagKey
  );

  const addDependency = () => {
    onChange([...value, ""]);
  };

  const removeDependency = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateDependency = (index: number, updates: string) => {
    const newValue = [...value];
    newValue[index] = updates;
    onChange(newValue);
  };

  if (selectableFlags.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
        No other flags available. Create more flags to add dependencies.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {value.map((dep, index) => {
        const availableOptions = selectableFlags.filter(
          (flag) => !value.includes(flag.key) || flag.key === dep
        );

        return (
          <div
            key={index}
            className="flex items-center gap-2 p-3 border rounded-lg"
          >
            <div className="flex-1">
              <Select
                value={dep}
                onValueChange={(key) => updateDependency(index, key)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select prerequisite flag..." />
                </SelectTrigger>
                <SelectContent>
                  {availableOptions.map((flag) => (
                    <SelectItem key={flag.key} value={flag.key}>
                      {flag.name || flag.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeDependency(index)}
              type="button"
              aria-label="Remove dependency"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={addDependency}
        type="button"
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Dependency
      </Button>

      {value.length > 0 && (
        <div className="text-xs bg-muted/50 p-3 rounded-lg">
          <p className="font-medium mb-1"> How dependencies work:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              This flag will <strong>only be enabled</strong> if all selected
              prerequisite flags are also enabled.
            </li>
            <li>
              Circular dependencies are automatically detected and prevented.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

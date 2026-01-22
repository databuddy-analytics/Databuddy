"use client";

import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const DOT_NOTATION_REGEX = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;

interface FieldPathInputProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function FieldPathInput({ value = [], onChange }: FieldPathInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validatePath = (path: string) => {
    if (!path) {
      return false;
    }
    // Simple dot notation validation: alphanumeric chars + underscores, separated by dots
    return DOT_NOTATION_REGEX.test(path);
  };

  const addPath = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      return;
    }

    if (value.includes(trimmed)) {
      setError("Path already exists");
      return;
    }

    if (!validatePath(trimmed)) {
      setError("Invalid path format (use dot notation e.g. services.db)");
      return;
    }

    onChange([...value, trimmed]);
    setInputValue("");
    setError(null);
  };

  const removePath = (pathToRemove: string) => {
    onChange(value.filter((path) => path !== pathToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addPath(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removePath(value.at(-1) ?? "");
    }
  };

  const handleBlur = () => {
    if (inputValue) {
      addPath(inputValue);
    }
    setError(null);
  };

  const generatePreview = () => {
    if (value.length === 0) {
      return {
        status: "ok",
        services: {
          database: {
            status: "up",
            latency: 45,
          },
        },
      };
    }

    const preview = {};
    for (const path of value) {
      let current: any = preview;
      const parts = path.split(".");
      const last = parts.pop();
      if (!last) {
        continue;
      }

      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      if (last.includes("status")) {
        current[last] = "up";
      } else if (last.includes("latency")) {
        current[last] = 45;
      } else {
        current[last] = "ok";
      }
    }
    return preview;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 border border-accent-brighter bg-input p-1.5 transition-all focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/80">
          {value.map((path) => (
            <Badge
              className="flex items-center gap-1 pr-1"
              key={path}
              variant="secondary"
            >
              {path}
              <button
                className=" p-0.5 hover:bg-muted-foreground/20"
                onClick={() => removePath(path)}
                type="button"
              >
                <XIcon className="size-3" />
                <span className="sr-only">Remove {path}</span>
              </button>
            </Badge>
          ))}
          <Input
            className="h-6 min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            onBlur={handleBlur}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? "e.g. services.database" : ""}
            value={inputValue}
          />
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      <div className=" border bg-muted/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-medium text-xs">
            {value.length === 0
              ? "Example API Response"
              : "Extracted Data Preview"}
          </p>
          {value.length === 0 && (
            <span className="text-muted-foreground text-xs">
              (Add fields above to see preview)
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <pre className="overflow-x-auto bg-background p-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
              {JSON.stringify(generatePreview(), null, 2)}
            </pre>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium text-xs">How it works</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                We extract the exact values at the paths you provide. To track
                service health, you should target specific <b>status</b>{" "}
                (string) and <b>latency</b> (number) fields.
              </p>
            </div>
            {value.length === 0 && (
              <div className="space-y-2">
                <p className="font-medium text-xs">Try these examples:</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: "Root status", path: "status" },
                    { label: "DB status", path: "services.database.status" },
                    {
                      label: "DB latency",
                      path: "services.database.latency",
                    },
                  ].map((example) => (
                    <button
                      className="flex w-fit items-center gap-2 bg-background px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      key={example.path}
                      onClick={() => addPath(example.path)}
                      type="button"
                    >
                      <PlusIcon className="size-3" />
                      <code className="font-mono text-[10px]">
                        {example.path}
                      </code>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

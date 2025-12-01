"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/elastic-slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Variant } from "@databuddy/shared/flags";

interface VariantEditorProps {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
}

export function VariantEditor({ variants, onChange }: VariantEditorProps) {
  // Per-variant type is now stored on each variant. Keep a local fallback for "Add Variant" control.
  const [defaultValueType, setDefaultValueType] = useState<
    "string" | "number" | "json"
  >("string");

  // Initialize with at least two variants if empty
  useEffect(() => {
    if (!variants || variants.length === 0) {
      onChange([
        {
          key: "control",
          value: "control",
          weight: 50,
          description: "Control group",
          type: "string",
        },
        {
          key: "variant-a",
          value: "variant-a",
          weight: 50,
          description: "Variant A",
          type: "string",
        },
      ]);
    }
  }, []);

  const handleAddVariant = () => {
    const newVariant: Variant = {
      key: `variant-${variants.length + 1}`,
      value: defaultValueType === "number" ? 0 : "",
      weight: undefined,
      description: "",
      type: defaultValueType,
    };

    // Redistribute weights if needed or just add with 0
    const newVariants = [...variants, newVariant];
    onChange(newVariants);
  };

  const handleRemoveVariant = (index: number) => {
    const newVariants = variants.filter((_, i) => i !== index);
    onChange(newVariants);
  };

  const handleUpdateVariant = (
    index: number,
    field: keyof Variant,
    value: any
  ) => {
    const newVariants = [...variants];

    if (field === "value") {
      const variantType = newVariants[index].type || "string";
      if (variantType === "number") {
        newVariants[index] = {
          ...newVariants[index],
          [field]: Number(value) || 0,
        };
      } else if (variantType === "json") {
        try {
          const parsed = JSON.parse(value);
          newVariants[index] = { ...newVariants[index], [field]: parsed };
        } catch (e) {
          newVariants[index] = { ...newVariants[index], [field]: value };
        }
      } else {
        newVariants[index] = { ...newVariants[index], [field]: value };
      }
    } else if (field === "type") {
      const newType = value as "string" | "number" | "json";
      let coercedValue: any = newVariants[index].value;
      switch (newType) {
        case "number":
          coercedValue = Number(coercedValue) || 0;
          break;
        case "json":
        case "string":
          coercedValue = "";
          break;
      }
      
      newVariants[index] = {
        ...newVariants[index],
        type: newType,
        value: coercedValue,
      };
    } else {
      newVariants[index] = { ...newVariants[index], [field]: value };
    }

    onChange(newVariants);
  };

  // Sum only defined weights
  const weightedVariants = variants.filter((v) => typeof v.weight === "number");
  const totalWeight = weightedVariants.reduce(
    (sum, v) => sum + (v.weight || 0),
    0
  );
  const isValidTotal =
    weightedVariants.length === 0 ? true : totalWeight === 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Variants</Label>
        <div className="flex items-center gap-2">
          <Select
            value={defaultValueType}
            onValueChange={(v: "string" | "number" | "json") =>
              setDefaultValueType(v)
            }
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Value Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddVariant}
            className="h-8"
          >
            <Plus className="mr-2 h-3 w-3" />
            Add Variant
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {variants.map((variant, index) => (
          <div
            key={index}
            className="rounded-lg border bg-card p-3 shadow-sm space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Key</Label>
                  <Input
                    value={variant.key}
                    onChange={(e) =>
                      handleUpdateVariant(index, "key", e.target.value)
                    }
                    placeholder="e.g., control"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Value</Label>
                  <Input
                    value={
                      typeof variant.value === "object"
                        ? JSON.stringify(variant.value)
                        : variant.value
                    }
                    onChange={(e) =>
                      handleUpdateVariant(index, "value", e.target.value)
                    }
                    placeholder="Value"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select
                    value={variant.type || "string"}
                    onValueChange={(v: "string" | "number" | "json") =>
                      handleUpdateVariant(index, "type", v)
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveVariant(index)}
                disabled={variants.length <= 1}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  className={`text-xs ${typeof variant.weight !== "number" && "text-muted-foreground"}`}
                >
                  Traffic Weight:{" "}
                  {typeof variant.weight === "number"
                    ? `${variant.weight}%`
                    : "— (unweighted)"}
                </Label>
                <div className="flex items-center gap-2">
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={typeof variant.weight === "number"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // enable weight with 0 (user can adjust)
                          handleUpdateVariant(index, "weight", 0);
                        } else {
                          // disable weight (set undefined)
                          handleUpdateVariant(index, "weight", undefined);
                        }
                      }}
                    />
                    <span className="ml-2 text-xs">Use weight</span>
                  </label>
                </div>
              </div>
              <Slider
                value={typeof variant.weight === "number" ? variant.weight : 0}
                min={0}
                max={100}
                step={1}
                onValueChange={(val) =>
                  handleUpdateVariant(index, "weight", val)
                }
                disabled={typeof variant.weight !== "number"}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        className={`text-sm flex items-center gap-2 ${
          totalWeight === 0 
            ? "text-blue-600" 
            : isValidTotal 
            ? "text-green-600" 
            : "text-amber-600"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            totalWeight === 0
              ? "bg-blue-600"
              : isValidTotal
              ? "bg-green-600"
              : "bg-amber-600"
          }`}
        />
        {totalWeight === 0 ? (
          <>
            <span className="font-medium">Even Distribution</span>
            <span className="text-muted-foreground">
              (Each variant covers ~{Math.round(100 / variants.length)}% of traffic)
            </span>
          </>
        ) : (
          <>
            Total Weight: {totalWeight}%{" "}
            {isValidTotal ? "(Valid)" : "(Must sum to 100%)"}
          </>
        )}
      </div>
    </div>
  );
}

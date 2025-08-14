'use client';

import { FunnelSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DynamicQueryFilter } from '@databuddy/shared';
import { normalizeCountryForFilter } from '@databuddy/shared';
import type { AutocompleteData } from '@/hooks/use-funnels';
import { AutocompleteInput } from '../../funnels/_components/funnel-components';
import { getBrowserIcon, getOSIcon } from '../../_components/utils/technology-helpers';
import Image from 'next/image';

export type FilterField = 'path' | 'referrer' | 'country' | 'browser_name' | 'os_name';

export type FilterItem = {
  id?: string;
  field: FilterField;
  value: string;
};

type Props = {
  filters: FilterItem[];
  onChange: (next: FilterItem[]) => void;
  browserOptions?: string[];
  osOptions?: string[];
  autocompleteData?: AutocompleteData;
};

const FIELD_LABELS: Record<FilterField, string> = {
  path: 'Page path',
  referrer: 'Referrer',
  country: 'Country',
  browser_name: 'Browser',
  os_name: 'OS',
};

export function buildSessionFilters(items: FilterItem[]): DynamicQueryFilter[] {
  const filters: DynamicQueryFilter[] = [];
  
  for (const item of items) {
    if (!item.value || !item.value.trim()) {
      continue;
    }
    
    if (item.field === 'path') {
      filters.push({ field: item.field, operator: 'like' as const, value: item.value.trim() });
      continue;
    }
    
    if (item.field === 'referrer') {
      const value = item.value.trim().toLowerCase();
      
      if (value === 'direct') {
        filters.push({ field: item.field, operator: 'eq' as const, value: '' });
        continue;
      }
      
      if (value === 'google') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'google.com' });
        continue;
      }
      if (value === 'facebook') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'facebook.com' });
        continue;
      }
      if (value === 'twitter') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'twitter.com' });
        continue;
      }
      if (value === 'instagram') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'instagram.com' });
        continue;
      }
      if (value === 'linkedin') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'linkedin.com' });
        continue;
      }
      if (value === 'youtube') {
        filters.push({ field: item.field, operator: 'like' as const, value: 'youtube.com' });
        continue;
      }
      
      filters.push({ field: item.field, operator: 'like' as const, value: item.value.trim() });
      continue;
    }
    
    if (item.field === 'country') {
      const normalizedCountry = normalizeCountryForFilter(item.value);
      const trimmedInput = item.value.trim();
      
      // Skip if normalization returns empty string (invalid input)
      if (!normalizedCountry) {
        continue;
      }
      
      // If normalization found a match (result is different from input), use exact match
      // If no normalization found (result equals input), use like match for partial searching
      const isNormalized = normalizedCountry !== trimmedInput;
      
      if (isNormalized) {
        filters.push({ field: item.field, operator: 'eq' as const, value: normalizedCountry });
      } else {
        filters.push({ field: item.field, operator: 'like' as const, value: normalizedCountry });
      }
      continue;
    }
    
    // Default case for other fields
    filters.push({ field: item.field, operator: 'eq' as const, value: item.value.trim() });
  }
  
  return filters;
}

export default function SessionsFilters({ filters, onChange, browserOptions = [], osOptions = [], autocompleteData }: Props) {
  const [localInputValues, setLocalInputValues] = useState<Record<string, string>>({});
  const [openSelectId, setOpenSelectId] = useState<string | null>(null);

  const normalizedBrowsers = useMemo(
    () => Array.from(new Set(browserOptions.filter(Boolean))).sort(),
    [browserOptions]
  );
  const normalizedOS = useMemo(
    () => Array.from(new Set(osOptions.filter(Boolean))).sort(),
    [osOptions]
  );

  const getPathSuggestions = useMemo(() => {
    return autocompleteData?.pagePaths || [];
  }, [autocompleteData]);

  // Migrate filters to have stable IDs if they don't already have them
  useEffect(() => {
    const hasFiltersWithoutIds = filters.some(filter => !filter.id);
    if (hasFiltersWithoutIds) {
      const filtersWithIds = filters.map(filter => 
        filter.id ? filter : { ...filter, id: crypto.randomUUID() }
      );
      onChange(filtersWithIds);
    }
  }, [filters, onChange]);

  // Debounced effect to apply input changes after user stops typing
  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];
    
    for (const [key, value] of Object.entries(localInputValues)) {
      const timeout = setTimeout(() => {
        const [indexStr, field] = key.split('-');
        const index = Number.parseInt(indexStr, 10);
        
        if (!Number.isNaN(index) && index < filters.length) {
          updateFilterImmediate(index, { value });
        }
      }, 800);
      
      timeouts.push(timeout);
    }
    
    return () => {
      for (const timeout of timeouts) {
        clearTimeout(timeout);
      }
    };
  }, [localInputValues, filters.length]);

  const getDisplayValue = useCallback((index: number, field: FilterField): string => {
    const key = `${index}-${field}`;
    return localInputValues[key] ?? filters[index]?.value ?? '';
  }, [localInputValues, filters]);

  const handleInputChange = useCallback((index: number, field: FilterField, value: string) => {
    const key = `${index}-${field}`;
    setLocalInputValues(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const updateFilterImmediate = useCallback((index: number, patch: Partial<FilterItem>) => {
    const next = [...filters];
    next[index] = { ...next[index], ...patch } as FilterItem;
    onChange(next);
  }, [filters, onChange]);

  const handleAutocompleteChange = useCallback((index: number, field: FilterField, value: string) => {
    // Check if the value exactly matches a suggestion (user clicked or typed complete path)
    const isExactMatch = getPathSuggestions.includes(value);
    
    if (isExactMatch || value.trim() === '') {
      // Apply immediately for exact matches or empty values
      updateFilterImmediate(index, { value });
      
      // Clear any pending debounced value for this field
      const key = `${index}-${field}`;
      setLocalInputValues(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      // For partial matches, use debouncing
      handleInputChange(index, field, value);
    }
  }, [getPathSuggestions, updateFilterImmediate, handleInputChange]);

  const cleanupLocalState = useCallback((removedIndex: number) => {
    setLocalInputValues(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const [indexStr] = key.split('-');
        const index = Number.parseInt(indexStr, 10);
        if (index === removedIndex) {
          delete next[key];
        } else if (index > removedIndex) {
          const [, field] = key.split('-');
          const newKey = `${index - 1}-${field}`;
          next[newKey] = next[key];
          delete next[key];
        }
      }
      return next;
    });
  }, []);

  const addFilter = (field: FilterField) => {
    onChange([...filters, { id: crypto.randomUUID(), field, value: '' }]);
  };

  const removeFilter = (index: number) => {
    const next = [...filters];
    next.splice(index, 1);
    cleanupLocalState(index);
    onChange(next);
  };

  return (
    <div className="space-y-4 px-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <FunnelSimpleIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Filters</h3>
            {filters.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {`${filters.length} active filter${filters.length === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {filters.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setLocalInputValues({});
                onChange([]);
                setOpenSelectId(null);
              }}
              className="h-9"
            >
              Clear all
            </Button>
          )}
          
          <Select
            onValueChange={(v) => {
              addFilter(v as FilterField);
              setOpenSelectId(null);
            }}
            onOpenChange={(open) => {
              if (open) {
                setOpenSelectId('add-filter');
              } else if (openSelectId === 'add-filter') {
                setOpenSelectId(null);
              }
            }}
            open={openSelectId === 'add-filter'}
            value=""
          >
            <SelectTrigger className="h-9 min-w-[140px]">
              <SelectValue placeholder="Add filter" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FIELD_LABELS) as FilterField[]).map((key) => (
                <SelectItem key={`add-${key}`} value={key}>
                  {FIELD_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters List */}
      {filters.length > 0 && (
        <div className="space-y-3">
          {filters.map((f, i) => (
            <div 
              key={f.id || `filter-${i}-${f.field}`} 
              className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
            >
              {/* Field Type Section */}
              <div className="flex min-w-0 flex-col gap-1 sm:w-48">
                <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Filter Type
                </label>
                <Select
                  value={f.field}
                  onValueChange={(v) => {
                    updateFilterImmediate(i, { field: v as FilterField, value: '' });
                    const key = `${i}-${f.field}`;
                    setLocalInputValues(prev => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                    setOpenSelectId(null);
                  }}
                  onOpenChange={(open) => {
                    if (open) {
                      setOpenSelectId(`field-${i}`);
                    } else if (openSelectId === `field-${i}`) {
                      setOpenSelectId(null);
                    }
                  }}
                  open={openSelectId === `field-${i}`}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_LABELS) as FilterField[]).map((key) => (
                      <SelectItem key={`field-${i}-${key}`} value={key}>
                        {FIELD_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value Section */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Value
                </label>
                
                {f.field === 'browser_name' ? (
                  <Select
                    value={f.value}
                    onValueChange={(v) => {
                      updateFilterImmediate(i, { value: v });
                      setOpenSelectId(null);
                    }}
                    onOpenChange={(open) => {
                      if (open) {
                        setOpenSelectId(`browser-${i}`);
                      } else if (openSelectId === `browser-${i}`) {
                        setOpenSelectId(null);
                      }
                    }}
                    open={openSelectId === `browser-${i}`}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select browser" />
                    </SelectTrigger>
                    <SelectContent>
                      {normalizedBrowsers.map((b) => (
                        <SelectItem key={`browser-${i}-${b}`} value={b}>
                          <span className="flex items-center gap-2">
                            <Image src={getBrowserIcon(b)} alt={b} title={b} width={16} height={16} />
                            <span>{b}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.field === 'os_name' ? (
                  <Select
                    value={f.value}
                    onValueChange={(v) => {
                      updateFilterImmediate(i, { value: v });
                      setOpenSelectId(null);
                    }}
                    onOpenChange={(open) => {
                      if (open) {
                        setOpenSelectId(`os-${i}`);
                      } else if (openSelectId === `os-${i}`) {
                        setOpenSelectId(null);
                      }
                    }}
                    open={openSelectId === `os-${i}`}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select OS" />
                    </SelectTrigger>
                    <SelectContent>
                      {normalizedOS.map((o) => (
                        <SelectItem key={`os-${i}-${o}`} value={o}>
                          <span className="flex items-center gap-2">
                            <Image src={getOSIcon(o)} alt={o} title={o} width={16} height={16} />
                            <span>{o}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.field === 'path' ? (
                  <AutocompleteInput
                    value={getDisplayValue(i, f.field)}
                    onValueChange={(value) => handleAutocompleteChange(i, f.field, value)}
                    suggestions={getPathSuggestions}
                    placeholder="e.g. /about, /docs"
                    className="h-9 w-full"
                  />
                ) : (
                  <Input
                    value={getDisplayValue(i, f.field)}
                    onChange={(e) => handleInputChange(i, f.field, e.target.value)}
                    placeholder={
                      f.field === 'referrer'
                        ? 'e.g. direct, google, facebook, twitter'
                        : f.field === 'country'
                          ? 'e.g. United States, US, UK, Canada, Germany'
                          : 'Enter value'
                    }
                    className="h-9 w-full"
                  />
                )}
              </div>

              {/* Remove Button */}
              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide opacity-0">
                  Action
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => removeFilter(i)}
                  title="Remove filter"
                  aria-label="Remove filter"
                  className="h-9 px-3 text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
}



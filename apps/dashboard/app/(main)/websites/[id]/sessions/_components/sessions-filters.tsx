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
import { getBrowserIcon, getOSIcon } from '../../_components/utils/technology-helpers';

export type FilterField = 'path' | 'referrer' | 'country' | 'browser_name' | 'os_name';

export type FilterItem = {
  field: FilterField;
  value: string;
};

type Props = {
  filters: FilterItem[];
  onChange: (next: FilterItem[]) => void;
  browserOptions?: string[];
  osOptions?: string[];
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
      
      if (!normalizedCountry) {
        continue;
      }
      
      const isExactMatch = normalizedCountry !== item.value.trim();
      
      if (isExactMatch) {
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

export default function SessionsFilters({ filters, onChange, browserOptions = [], osOptions = [] }: Props) {
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
    onChange([...filters, { field, value: '' }]);
  };

  const removeFilter = (index: number) => {
    const next = [...filters];
    next.splice(index, 1);
    cleanupLocalState(index);
    onChange(next);
  };

  const updateFilterImmediate = (index: number, patch: Partial<FilterItem>) => {
    const next = [...filters];
    next[index] = { ...next[index], ...patch } as FilterItem;
    onChange(next);
  };

  const updateFilter = (index: number, patch: Partial<FilterItem>) => {
    if (patch.field || (patch.value && filters[index]?.field !== 'path' && filters[index]?.field !== 'referrer' && filters[index]?.field !== 'country')) {
      updateFilterImmediate(index, patch);
      
      if (patch.field) {
        const oldKey = `${index}-${filters[index]?.field}`;
        setLocalInputValues(prev => {
          const next = { ...prev };
          delete next[oldKey];
          return next;
        });
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FunnelSimpleIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground text-sm">Filters</span>
        </div>

        {/* Active filter rows */}
        {filters.map((f, i) => (
          <div key={`filter-row-${i}-${f.field}`} className="flex items-center gap-2 rounded border border-border/40 bg-muted/10 px-2 py-1.5">
            <Select 
              value={f.field} 
              onValueChange={(v) => {
                updateFilter(i, { field: v as FilterField, value: '' });
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
              <SelectTrigger size="sm" className="h-8 min-w-[140px]">
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

            {f.field === 'browser_name' ? (
              <Select 
                value={f.value} 
                onValueChange={(v) => {
                  updateFilter(i, { value: v });
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
                <SelectTrigger size="sm" className="h-8 min-w-[160px]">
                  <SelectValue placeholder="Select browser" />
                </SelectTrigger>
                <SelectContent>
                  {normalizedBrowsers.map((b) => (
                    <SelectItem key={`browser-${i}-${b}`} value={b}>
                      <span className="flex items-center gap-2">
                        <img src={getBrowserIcon(b)} alt={b} className="h-4 w-4" />
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
                  updateFilter(i, { value: v });
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
                <SelectTrigger size="sm" className="h-8 min-w-[140px]">
                  <SelectValue placeholder="Select OS" />
                </SelectTrigger>
                <SelectContent>
                  {normalizedOS.map((o) => (
                    <SelectItem key={`os-${i}-${o}`} value={o}>
                      <span className="flex items-center gap-2">
                        <img src={getOSIcon(o)} alt={o} className="h-4 w-4" />
                        <span>{o}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={getDisplayValue(i, f.field)}
                onChange={(e) => handleInputChange(i, f.field, e.target.value)}
                placeholder={
                  f.field === 'path'
                    ? 'e.g. /about, /docs'
                    : f.field === 'referrer'
                      ? 'e.g. direct, google, facebook, twitter'
                      : f.field === 'country'
                        ? 'e.g. United States, US, UK, Canada, Germany'
                        : 'Enter value'
                }
                className="h-8 w-[220px]"
              />
            )}

            <Button variant="ghost" className="h-8 px-2 text-muted-foreground" type="button" onClick={() => removeFilter(i)} title="Remove filter">
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {/* Add filter control */}
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
          <SelectTrigger size="sm" className="h-8 min-w-[160px]">
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
      {filters.length === 0 && (
        <div className="pt-1 text-muted-foreground text-xs">Add a filter, then enter a value (or pick from dropdown) to refine sessions.</div>
      )}
    </div>
  );
}



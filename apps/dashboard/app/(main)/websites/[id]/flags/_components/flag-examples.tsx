'use client'
import {
  Lightning,
  Palette,
  CurrencyDollar,
  Layout,
  Bell,
  ShoppingCart,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getExamplesDisplayStrategy, getShouldShowExamples } from "@/lib/flags/get-examples-strategy";
import { useState } from "react";

interface FlagTemplate {
  icon: React.ElementType;
  title: string;
  description: string;
  flagKey: string;
  type: "multivariant";
  variants: Array<{
    key: string;
    value: any;
    weight: number;
    description: string;
  }>;
  useCase: string;
  codeExample: string;
}

const FLAG_TEMPLATES: FlagTemplate[] = [
  {
    icon: Palette,
    title: "Button Color A/B Test",
    description: "Test different button colors to see which converts better",
    flagKey: "cta-button-color",
    type: "multivariant",
    variants: [
      {
        key: "control",
        value: "gray",
        weight: 34,
        description: "Default gray",
      },
      {
        key: "blue",
        value: "#3B82F6",
        weight: 33,
        description: "Blue variant",
      },
      {
        key: "green",
        value: "#10B981",
        weight: 33,
        description: "Green variant",
      },
    ],
    useCase: "Landing pages, CTAs, conversion optimization",
    codeExample: `// Server Component (Next.js)
import { createServerFlagsManager } from '@databuddy/sdk/node';

const manager = createServerFlagsManager({ clientId: 'your-id' });
await manager.waitForInitialization();

const { value, payload } = await manager.getFlag("cta-button-color", {
  userId: user.id,
});
// value = "gray" | "#3B82F6" | "#10B981"
// Sticky assignment ensures same user gets same color

<button style={{ backgroundColor: value }}>Sign Up</button>`,
  },
  {
    icon: CurrencyDollar,
    title: "Pricing Experiment",
    description: "Test different price points to maximize revenue",
    flagKey: "pricing-tiers",
    type: "multivariant",
    variants: [
      {
        key: "standard",
        value: { monthly: 19.99, yearly: 199 },
        weight: 50,
        description: "Standard pricing",
      },
      {
        key: "discount",
        value: { monthly: 14.99, yearly: 149 },
        weight: 50,
        description: "20% discount",
      },
    ],
    useCase: "SaaS pricing, subscription optimization",
    codeExample: `const { value } = await flags.getFlag("pricing-tiers");
// value = { monthly: 19.99, yearly: 199 }
<div>
  <h3>$\{value.monthly}/mo</h3>
  <p>or $\{value.yearly}/year</p>
</div>`,
  },
  {
    icon: Layout,
    title: "Dashboard Layout Variants",
    description: "Test different dashboard layouts for user engagement",
    flagKey: "dashboard-config",
    type: "multivariant",
    variants: [
      {
        key: "classic",
        value: { sidebar: "left", widgets: ["sales", "users"] },
        weight: 34,
        description: "Classic left sidebar",
      },
      {
        key: "modern",
        value: { sidebar: "top", widgets: ["sales", "users", "analytics"] },
        weight: 33,
        description: "Modern top nav",
      },
      {
        key: "minimal",
        value: { sidebar: "collapsed", widgets: ["sales"] },
        weight: 33,
        description: "Minimal collapsed",
      },
    ],
    useCase: "Dashboard UX, feature discovery",
    codeExample: `const { value } = await flags.getFlag("dashboard-config");
// value = { sidebar: "left", widgets: ["sales", "users"] }
<Dashboard 
  sidebarPosition={value.sidebar}
  widgets={value.widgets}
/>`,
  },
  {
    icon: ShoppingCart,
    title: "Checkout Flow Test",
    description: "Compare single-step vs multi-step checkout conversion",
    flagKey: "checkout-flow",
    type: "multivariant",
    variants: [
      {
        key: "single-step",
        value: 1,
        weight: 50,
        description: "All in one page",
      },
      { key: "multi-step", value: 3, weight: 50, description: "3-step wizard" },
    ],
    useCase: "E-commerce, conversion optimization",
    codeExample: `const { value } = await flags.getFlag("checkout-flow");
// value = 1 | 3
{value === 1 ? <SinglePageCheckout /> : <MultiStepWizard steps={value} />}`,
  },
  {
    icon: Bell,
    title: "Notification Copy Test",
    description: "Test different notification messages for engagement",
    flagKey: "notification-message",
    type: "multivariant",
    variants: [
      {
        key: "friendly",
        value: "Hey! 👋 You have a new message",
        weight: 33,
        description: "Casual tone",
      },
      {
        key: "professional",
        value: "New message received",
        weight: 33,
        description: "Professional tone",
      },
      {
        key: "urgent",
        value: "⚡ New message - Reply now!",
        weight: 34,
        description: "Urgent tone",
      },
    ],
    useCase: "Push notifications, email subject lines",
    codeExample: `const { value } = await flags.getFlag("notification-message");
// value = "Hey! 👋 You have a new message" | ...
toast.success(value);`,
  },
  {
    icon: Lightning,
    title: "Feature Rollout Strategy",
    description: "Gradually roll out premium features to segments",
    flagKey: "premium-features",
    type: "multivariant",
    variants: [
      {
        key: "basic",
        value: { aiAssistant: false, analytics: false, exports: "csv" },
        weight: 60,
        description: "Basic tier",
      },
      {
        key: "pro",
        value: { aiAssistant: true, analytics: true, exports: "csv,pdf,xlsx" },
        weight: 40,
        description: "Pro tier with AI",
      },
    ],
    useCase: "Feature gating, tier management",
    codeExample: `const { value } = await flags.getFlag("premium-features");
// value = { aiAssistant: true, analytics: true, ... }
{value.aiAssistant && <AIAssistantButton />}
{value.analytics && <AnalyticsDashboard />}`,
  },
];

interface FlagExamplesProps {
  onCreateFromTemplate?: (template: FlagTemplate) => void;
  maxExamples?: number;
  variant?: string;
  showExamples?: boolean;
}

export function FlagExamples({
  onCreateFromTemplate,
}: FlagExamplesProps) {
  const [userId, setUserId] = useState("1aZtjWs4U4vQMa3Z2j5XA5PDy76fXNGE");

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["examples-display-strategy"],
    queryFn: async () => {
      console.log("Fetching examples display strategy");
      return await getExamplesDisplayStrategy("h3mH7S0t8_MIqPvjLeYCb", userId, "test")
    }
  });
  const { data: shouldShowExamples, refetch: refetchShouldShowExamples, isFetching: isFetchingShouldShowExamples } = useQuery({
    queryKey: ["should-show-examples"],
    queryFn: async () => {
      return await getShouldShowExamples("h3mH7S0t8_MIqPvjLeYCb", userId, "test")
    }
  });

  const displayedExamples = FLAG_TEMPLATES.slice(0, data?.exampleCount || 0)

  const handleRefetchAsNewUser = (isRefetchShouldShowExamples?: boolean) => {
    const newUserId = `test-user-${Math.random().toString(36).substring(2, 15)}`;
    console.log(`🔄 Switching to new user: ${newUserId}`);
    setUserId(newUserId);
    if (isRefetchShouldShowExamples) {
      refetchShouldShowExamples();
    } else {
      refetch();
    }
  };
  if (isFetching) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Advanced Features Status Banner */}
      <div className="rounded-lg border bg-card p-4 space-y-3">

        <p className="text-muted-foreground text-sm">
          Real-world use cases demonstrating advanced feature flag capabilities
        </p>

        {/* Feature Status Grid */}
        <div className="text-xs space-y-1">
          <div className="font-medium text-muted-foreground">Environment</div>
          <div className="font-mono text-primary">
            {data?.environment || "-"}
          </div>
        </div>

        {/* Test buttons */}
        <div className="flex justify-center gap-3 mt-4">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleRefetchAsNewUser()}
          >
            🔄 Test as Different User
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
          >
            🔄 Refetch
          </Button>
        </div>
      </div>

      {/* Should Show Examples Check */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-medium text-sm">Check "Enable Examples" Flag</h3>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchShouldShowExamples()}
              disabled={isFetchingShouldShowExamples}
            >
              Check for Current User
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRefetchAsNewUser(true)}
              disabled={isFetchingShouldShowExamples}
            >
              Check as New User
            </Button>
          </div>
          <div className={`text-sm font-medium ${shouldShowExamples ? 'text-green-600' : 'text-red-600'}`}>
            Result: {shouldShowExamples ? 'Enabled' : 'Disabled'}
          </div>
        </div>
      </div>

      {displayedExamples.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No examples to display, try changing environment
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedExamples.map((template) => {
            const Icon = template.icon;
            return (
              <Card
                key={template.flagKey}
                className="p-4 hover:shadow-lg transition-shadow"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-5 w-5 text-primary" weight="duotone" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">
                        {template.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {template.variants.length} Variants
                    </div>
                    <div className="space-y-1">
                      {template.variants.map((v) => (
                        <div
                          key={v.key}
                          className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                        >
                          <span className="font-mono">{v.key}</span>
                          <span className="text-muted-foreground">
                            {v.weight}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs">
                    <span className="font-medium">Use case: </span>
                    <span className="text-muted-foreground">
                      {template.useCase}
                    </span>
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-primary hover:underline">
                      View code example
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
                      <code>{template.codeExample}</code>
                    </pre>
                  </details>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onCreateFromTemplate?.(template)}
                  >
                    Use Template
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center mt-8">
        <a
          href="https://docs.databuddy.cc/features/multi-variant-flags"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Read full documentation →
        </a>
      </div>
    </div>
  );
}

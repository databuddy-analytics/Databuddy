"use client";

import React from "react";

type ExampleType = "saas" | "merch store";

interface PromptMap {
  [key: string]: string;
}

export const LeapComponent: React.FC = () => {
  // Handle button click
  const handleGenerateClick = (): void => {
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      const input = document.querySelector(
        ".leap-prompt-input",
      ) as HTMLInputElement;
      if (input && input.value) {
        // Append "use Databuddy for analytics" to the user's prompt
        const enhancedPrompt = `${input.value} use Databuddy for analytics`;
        window.location.href = `https://leap.new/?build=${encodeURIComponent(enhancedPrompt)}`;
      } else {
        window.location.href = "https://leap.new/";
      }
    }
  };

  // Handle example click
  const handleExampleClick = (exampleType: ExampleType): void => {
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      const input = document.querySelector(
        ".leap-prompt-input",
      ) as HTMLInputElement;
      if (input) {
        // Set specific prompts based on the example type
        const prompts: PromptMap = {
          saas: "Build me a trip planning tool",
          "merch store": "Build me a t-shirt store",
        };
        input.value = prompts[exampleType] || exampleType;
      }
    }
  };

  const examples: ExampleType[] = ["saas", "merch store"];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          border: "1px solid #222",
          borderRadius: "0px",
          padding: "20px",
          margin: "36px 0",
          backgroundColor: "#ffffff",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
          width: "100%",
          maxWidth: "680px",
          boxSizing: "border-box",
        }}
      >
        <h3
          style={{
            margin: "0 0 12px 0",
            color: "#000",
            fontSize: "18px",
            fontWeight: "600",
          }}
        >
          Try Databuddy with Leap
        </h3>
        <div>
          <p
            style={{
              marginBottom: "16px",
              color: "#666",
              fontSize: "15px",
              lineHeight: "1.5",
            }}
          >
            Let Leap generate a complete application that uses Databuddy for
            analytics.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "nowrap",
              alignItems: "center",
            }}
          >
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <input
                type="text"
                className="leap-prompt-input"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #333",
                  borderRadius: "0px",
                  fontSize: "14px",
                  backgroundColor: "#fff",
                  color: "#666",
                  boxSizing: "border-box",
                }}
                placeholder="What do you want to build with Databuddy analytics?"
              />
            </div>
            <div style={{ flexShrink: 0 }}>
              <button
                type="button"
                style={{
                  backgroundColor: "#fff",
                  color: "#000",
                  border: "1px solid #000",
                  borderRadius: "0px",
                  padding: "12px 20px",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                }}
                onClick={handleGenerateClick}
              >
                Generate
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "8px",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "#666", marginRight: "4px" }}>Examples:</span>
            {examples.map((example: ExampleType, index: number) => (
              <div
                key={index}
                onClick={() => handleExampleClick(example)}
                style={{
                  color: "#999",
                  cursor: "pointer",
                  borderBottom: "1px dotted #555",
                  padding: "0 2px",
                  transition: "color 0.2s ease",
                }}
                className="hover:text-[#d5db04]"
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleExampleClick(example);
                  }
                }}
              >
                {example}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeapComponent;

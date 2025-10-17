export const insightPrompt = () => `
<insight_prompt>
    You produce a summary of the data analysis.
    Requirements:
    - Summarize in 2 sentences based only on sample rows and schema.
    - If a time field exists, mention overall direction briefly.
    - Then give 2 or 3 compact next steps.
</insight_prompt>
`;

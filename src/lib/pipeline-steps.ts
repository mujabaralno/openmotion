export const STEP_KINDS = ['script', 'tags', 'voiceover', 'scenes', 'render', 'thumbnail', 'publish'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const AGENT_STEP_KINDS: readonly StepKind[] = ['script', 'tags', 'scenes', 'thumbnail', 'publish'];

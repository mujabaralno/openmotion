# Episode production instructions

`shorts-episode-parallax/` contains the portable skill and its reference files. `prompts/` contains the three app handoffs: episode package, narration tags, and Remotion assembly. The application seeds editable copies into WORKSPACE_DIR on first use and preserves existing copies. The episode-specific output contract in AGENTS.md takes precedence over generic delivery locations in the original skill.

The application uses the user's configured ACP coding agent. A `$skill` label alone does not install or load a skill in another agent: the prompts point to the copied SKILL.md and reference files explicitly.

No application task requires posting messages, publishing to YouTube, or calling additional paid models. Facts need sources and a human review. Settings and API credentials remain on the server.

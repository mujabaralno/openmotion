# Episode production instructions

`shorts-episode-parallax/` contains the portable skill and its reference files. `prompts/` contains the app handoffs for the episode package, narration tags, Remotion assembly, thumbnail, and publication pack. The application seeds editable copies into WORKSPACE_DIR on first use and preserves existing copies. The episode-specific output contract in AGENTS.md takes precedence over generic delivery locations in the original skill.

The application uses the user's configured ACP coding agent. A `$skill` label alone does not install or load a skill in another agent: the prompts point to SKILL.md and reference files explicitly. This README is not automatically injected into every agent session; the scene handoff explicitly instructs the agent to read it.

## Remotion scene assembly

Before editing an episode's scene source, read `remotion-best-practices/SKILL.md` next to this README, then the relevant references it points to, especially `remotion-markup/REFERENCE.md` for React/SVG composition and frame-based animation. Apply the timing, layering, animation, and composition guidance together with the approved episode package and parallax skill.

Work inside the existing shared `remotion/` project. Edit only the episode's `Episode.tsx` at the path supplied by the application. The app-owned project/output contract takes precedence when generic skill instructions suggest scaffolding, starting Studio, installing dependencies, or rendering: those tasks are handled by the application.

No application task requires posting messages, publishing to YouTube, or calling additional paid models. Facts need sources and a human review. Settings and API credentials remain on the server.

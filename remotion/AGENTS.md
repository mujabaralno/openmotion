# Shared Remotion project

This is the application's only Remotion project. Use the package.json, tsconfig.json, and node_modules here. Do not scaffold another project or install dependencies in an episode workspace.

Each episode has its own source folder under `src/episodes/<slug>/`. The application gives the exact output path in the task prompt. Edit only that episode's `Episode.tsx`; preserve every other episode.

The application owns each episode's `index.tsx`, `props.json`, and staged files in `public/episodes/<slug>/`. It supplies the complete voice-over and caption overlay. Leave those files and the shared configuration unchanged.

Read the episode package, narration, audio metadata, visual guide, and portable skill at the absolute paths in the task prompt. Their original copies remain in WORKSPACE_DIR. The application handles preview and final rendering.

Before assembling scenes, read `../agents/README.md`, then `../agents/remotion-best-practices/SKILL.md` and its relevant references, especially `remotion-markup/REFERENCE.md`. Apply its animation, timing, and composition guidance. The app-owned project/output contract above takes precedence over generic skill instructions to scaffold projects, install packages, start Studio, or render.

Creator direction: technical scene prompts are English, while spoken narration follows the creator's language setting (Bahasa Indonesia by default). Keep the single app-owned voice-over uninterrupted; synchronize visuals to it. The app overlays the text watermark "Mystery Lab" in the upper-right safe area. Do not add a duplicate. The component receives `sfx.whoosh`, `sfx.pop`, and `sfx.tap`; use these only for restrained, timed sound accents with volume at most 0.18, before the silent end card. Do not add another narration or music track. Follow the locally installed design-taste-frontend-v1/top-design guidance for component appearance, adapting motion to deterministic Remotion frames rather than web animation libraries.

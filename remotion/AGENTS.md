# Shared Remotion project

This is the application's only Remotion project. Use the package.json, tsconfig.json, and node_modules here. Do not scaffold another project or install dependencies in an episode workspace.

Each episode has its own source folder under `src/episodes/<slug>/`. The application gives the exact output path in the task prompt. Edit only that episode's `Episode.tsx`; preserve every other episode.

The application owns each episode's `index.tsx`, `props.json`, and staged files in `public/episodes/<slug>/`. It supplies the complete voice-over and caption overlay. Leave those files and the shared configuration unchanged.

Read the episode package, narration, audio metadata, visual guide, and portable skill at the absolute paths in the task prompt. Their original copies remain in WORKSPACE_DIR. The application handles preview and final rendering.

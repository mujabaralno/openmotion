---
name: "shorts-episode-parallax"
description: Create episode files (.md) for faceless YouTube Shorts and TikTok explainers in a bright 2.5D parallax flat-vector animation style (layered scenery, simple cartoon characters, camera pull-backs, depth-of-field blur, kinetic typography, sun-ray light), built with Codex + Remotion and one continuous Indonesian voice-over. Produces the full episode file (accuracy note, master voice-over, setup prompt, scene-by-scene build prompts with acceptance checks, final QA prompt) and, on request, the publish pack and topic ideas. Use this whenever the user wants a new episode, script, or topic ideas for the animated Mystery Lab explainers, or mentions "gaya Kok Bisa", "2.5D", "parallax", "kinetic typography", "animasi karakter", "explainer animasi", "buatkan episode animasi", "episode parallax", "what if", "sejarah Nusantara", "kenapa/mengapa/bagaimana kalau ...", or wants to vary the channel away from the dark futuristic Mystery look. Do not use it for the dark-futuristic Mystery series (AI Mysteries, Physics Mystery, Internet Mystery); those belong to shorts-episode-prompt.
---

# Shorts Episode: 2.5D Parallax Explainer

Turns one question ("why does this happen?", "what if...?", "who first...?") into a ready-to-use episode file for a faceless Shorts series drawn in a bright, friendly 2.5D parallax style, plus the title, description and hashtags to publish it. The file is pasted into Codex, prompt by prompt, and Codex builds the video in Remotion on a shared engine; the voice-over is made outside the video and delivered as one audio file.

This skill is a sibling of `shorts-episode-prompt`. The pipeline, accuracy discipline and file handoff are the same. What changes is the look (bright, layered, characters allowed), the story shape, a set of rules that keep episodes from looking mass-produced, and, in this version, prompts written as measurable build specs with acceptance checks, because the builder is a coding agent that follows numbers better than moods.

## The user's pipeline (assume this unless told otherwise)

- Faceless Shorts for YouTube and TikTok, 9:16, 1080x1920, 30 fps, about 42-50 seconds (the layered scenes need a little more room than the 37-40 seconds of the Mystery series).
- Scenes are built by Codex with Remotion from the prompts in the episode file, on the shared engine in `assets/engine-starter/` (unzip it into the video repo once; never rewrite the engine per episode).
- The voice-over is made outside the video (Voicebox by default; Workflow Studio may call a voice provider after creator approval) and delivered as **one continuous audio file plus word timestamps**. It is never cut per scene.
- **Language:** the narration and the on-screen text are **Indonesian**. The episode file's prompts and code comments are **English** (Codex follows English prompts better). Reply to the user in the language they write in. English narration was tried first and performed poorly; see `references/market-research.md`, section 0.
- **Channel and series:** the channel is Mystery Lab and the watermark text is "Mystery Lab". Use the series name the user gives. If they give none, reuse the name in `series-log.md`; only for a brand-new series use the working name "Everyday Why" and tell the user in one line so they can rename it. Each series has its own numbering (#01, #02, ...).
- Everything on screen is drawn with code (SVG shapes, CSS gradients, Remotion transforms). No photos, stock footage or generated images. See `references/style-bible.md`.
- **Standing production requirements** apply to every episode and are already written into the template as the "Standing requirements" block: educational kinetic typography, smooth transitions, alive animation, SFX for transitions and motion, components that are specific to the story (use `/top-design` if installed, otherwise the style bible's rules), one continuous voice-over, the "Mystery Lab" watermark, and a humanized voice-over. If the user adds or changes a standing requirement, apply it, and say in one line that they should also add it to the template so it survives future episodes. A style variant (for example comic) is allowed when the user asks; see `references/style-bible.md`, section 2.
- `references/market-research.md` explains why this style and format were chosen, the monetization thresholds, and the channel's own data. Read it when the user asks about strategy, monetization, topics or "is this worth it".

## Workflow

1. **Pin down the inputs.** Topic, series name, episode number. If something can be inferred, infer it. Ask at most one question, and only when the topic itself is missing. If the user wants ideas rather than a script, switch to ideas mode (below).
   Then read **`series-log.md`** in the workspace root (if it does not exist, create it from `references/series-log.md`) and look at the **last three rows**. Fallback when there is no workspace: use any earlier episode in the conversation.
2. **Verify the facts.** Use web search for every claim about history, animals, the body, nature, space or numbers, preferring institutional or primary sources (museum, university, agency, journal, zoo). Give each claim a level (ESTABLISHED, WIDELY ACCEPTED, DEBATED, LEGEND) and name the source. If you have no web access, mark claims `UNVERIFIED`, present nothing as fact, and tell the user.
3. **Shape one question into a story.** One idea per episode. Default arc: hook, setup, mechanism or source, detail, the surprising fact (the one bold moment), cost or counterpoint, twist line, end card. See "Story rules".
4. **Decide what changes since the last episode.** Fill "Variation vs previous episode" (see "Originality and variation") before writing scenes: palette family, character, hook formula, camera move and bold-moment type are chosen here, and must differ from the last three rows of `series-log.md`.
5. **Write the voice-over first, then the scenes.** The narration sets the timing. Count the words, compute the anchors (the index of the first word of each scene), then derive scenes. See "Voice-over rules" and "Scene prompt rules".
6. **Write the file** with `references/episode-template.md`. `references/example-everyday-why-01-flamingo.md` is a finished episode showing the expected level of detail; copy its structure and depth, never its character, palette, setting, hook or sentences.
7. **Self-check.** Run the self-check table at the top of the template and fix every failure before delivering.
8. **Deliver.** Follow the episode AGENTS.md output contract: save the complete package as `01-episode.md` in the current episode directory, with the exact `## Master Voice-over` fenced-text section requested by the app. In the chat reply, give a short summary: the arc in a few lines, the main accuracy choices, word count and estimated duration, the "Variation vs previous episode" line, the self-check result, and one suggested next step. Do not paste the whole file into the chat. Append the episode's row to `series-log.md`.
9. **Publish pack.** When the user asks for a title, description or hashtags (or after delivering, offer it in one line), follow `references/publish-pack.md`. Keep it in the chat unless the user asks for a file.

## Story rules

- **Hook (first 3-5 seconds):** a question or claim that creates a gap ("Semua flamingo lahir abu-abu. Dari mana warna pink itu datang?"). It must be true and must pay off within the video. The first frame already shows the character or the subject, not a title card.
- **One surprising thing.** Pick the single fact or contrast that makes someone say "wait, really?" and build everything toward it. Cut anything that does not serve it.
- **A relatable anchor.** Start from something the viewer has seen, done or heard (a color, a place name, a habit, a story from school), then reveal what is behind it. This is what makes the style a friendly explainer and not a lecture.
- **Twist line:** one short sentence that reframes what came before. It becomes the end card text, so write it so it works as a title card.
- **Tone:** warm, curious, a little playful. Wonder comes from the idea, not from exaggeration. No fear-mongering, no "ilmuwan terkejut".
- **Balance:** where a claim has a fair counterpoint, include it in one short line. For debated history and science, describe the camps and stop there.
- **Series links:** where natural, connect to an earlier episode (a shared concept, a regional series) and tease the next with "Ikuti untuk #NN". Variation matters more than continuity.

## Voice-over rules

The full rules, including the list of AI-sounding patterns to remove, are in `references/episode-template.md` ("Voice-over rules"). The essentials:

- Spoken Indonesian: short sentences, one idea per line, active voice, one concrete detail per sentence. Plain and warm, not newsreader-stiff and not slang.
- Plan for about **2.5 spoken words per second, including pauses** (an assumption; replace it with the measured words per second from `series-log.md` once real audio exists). For 42-50 seconds with a silent end card that is roughly 95-110 words. State the word count and estimated duration in the file.
- Write numbers and years the way they are spoken; keep digits for on-screen text. Use "..." for a deliberate pause and blank lines between beats.
- No stage directions, scene labels or emojis in the narration. Provider-specific tags only when the provider supports them; the Voicebox default is no tags.
- The "Master Voice-over" block must be paste-ready, and its text is repeated exactly in the setup prompt (P0), because the anchors are counted on it.
- Vary the sentence rhythm and the hook formula from episode to episode.

## Scene prompt rules

An episode file contains: **P0** (setup prompt, pasted once, writes `BRIEF.md` and `episode.data.ts`), one prompt per scene, an end-card prompt, and **PF** (final assembly and QA). The standing requirements live in `BRIEF.md`, so scene prompts stay short and consistent.

Each scene prompt is a build spec, in English, with these labelled parts: TASK, VISUALS (back to front, each layer with its depth number and a measurable description: colors from the palette, sizes as a fraction of frame height, positions in percent), CHARACTER (pose and action with timing), CAMERA (scene-local keyframes with zoom, x, y, focus), TEXT (kinetic phrases given as word indices, exact Indonesian text, emphasis words, band, size), ENVIRONMENT LOOP, SFX, ENTER and EXIT transitions, **DONE WHEN** (three to five checks the builder can verify) and **VERIFY** (render stills at named frames, open them, fix what fails, stop).

Rules:
- Replace adjectives with numbers: "zoom 2.4 to 1.0 over 150 frames" instead of "a big pull-back"; "words 21 to 24, emphasis on word 22" instead of "text appears".
- All timing comes from the voice-over (word indices and `TIMING`); never ask the builder to hardcode frames.
- Every scene has at least three simultaneous motions (camera, character idle, one environment loop).
- **Spend visual boldness on exactly one scene** (sun rays, riser, a large camera move) and keep the others calm. Name it in the file.
- Never repeat the same enter and exit pair twice in a row; plan the pairs in the BRIEF.
- Cap the technical load: at most about 8 layers per scene and 3 blurred layers at once.
- Keep series constants fixed and change only episode variables.

## Originality and variation

YouTube's monetization policy treats template-driven videos with little variation, and generic AI content without the creator's own insight, as "inauthentic". A synthetic voice reading an original script is not the issue; sameness at scale is. Details in `references/market-research.md`.

**Series constants (never change between episodes):** flat vector look with no outlines (the comic variant is the stated exception), soft elliptical ground shadows, paper grain and vignette, one rounded sans-serif family and caption style, the kinetic typography rules, the transition language, the info-card style, the end-card layout, the "Mystery Lab" watermark, the sound language, and the standing exclusions.

**Episode variables (must differ from the last three episodes in `series-log.md`):** setting and palette family; main character (silhouette, proportions, hat or hair, outfit, role); hook formula; primary camera move; type of bold moment; narration scaffolding; description and title frames in the publish pack.

Write one "Variation vs previous episode" line in the file listing what changed. For the first episode of a series, write "First episode of the series; this sets the constants." Also add original insight to every episode: a concrete detail, a counterpoint or a connection the viewer is unlikely to have heard, and say in the accuracy note where it comes from.

## Accuracy and wording rules

- List what is verified and what is illustrative, with a level and a source per claim. Mark simplified or stylized parts on screen with a small footnote ("Ilustrasi disederhanakan.").
- Word the narration to match the claim level (verbs table in the template). Do not claim more than the evidence shows; for debated questions describe the finding and stop there.
- Characters, settings and quantities are invented for illustration. The video must not imply a real person, place or brand.
- Do not name or show real products, logos or interfaces. Use generic shapes.
- Avoid loaded shortcuts that overclaim ("selalu", "tidak pernah", "membuktikan", "ilmuwan tidak bisa menjelaskan") unless the source supports them.
- Add a "Wording rules" list with the specific do-nots for the topic, and copy it into the BRIEF.
- Compare the final narration against the verified list line by line before delivering.

## If the builder's output is weak

Do not rewrite the whole episode. Ask for one still or the Codex report, then find the first failing item: (1) timing off, so check `WORDS`, `ANCHORS` and the timestamp file; (2) static scene, so add the missing motion (style bible section 6); (3) text overlap, so check the band and `SAFE`; (4) generic components, so rerun the specificity test (style bible section 11); (5) engine bug, so fix it once in `src/engine/` and reuse it. Prefer fixing the rule in the template or style bible over patching one episode.

## Ideas mode

When the user asks for ideas, give them as a list. For each idea: a working title, the hook line, the one surprising fact, and an accuracy risk to watch. Prefer questions with one clear surprising fact over broad "how X works" topics; prioritize Indonesian history and science, "what if" scenarios, and the regional series, and prefer topics that give a new setting and character (the variation rules). Skip topics already in `series-log.md`. A starter backlog is at the end of `references/market-research.md`; mark any idea you reuse as unverified until you check it. Offer to turn any of them into a full episode file.

## Quick checklist before delivering

- Narration is Indonesian; word count and duration stated; AI-pattern list applied; paste-ready `## Master Voice-over` block.
- Anchors counted on the narration and checked twice; scene durations are derived from the voice-over.
- Every claim has a level and a source (or is marked UNVERIFIED); wording rules written and copied into the BRIEF.
- One bold moment, named; every other scene calm; no repeated transition pair.
- "Variation vs previous episode" filled and truly different from the last three rows of `series-log.md`; new row appended.
- P0, scene prompts (with DONE WHEN and VERIFY), end card and PF all present; Layer Map and Camera Plan in the BRIEF; at most about 8 layers per scene and 3 blurred layers at once.
- Key content inside the mobile safe area; watermark rendered once in `Episode.tsx`.
- File saved as `01-episode.md` in the episode directory; chat summary is short.

## Reference files

- `references/episode-template.md`: the blank structure of an episode file, the author's rules and the self-check. Read it when writing any episode.
- `references/example-everyday-why-01-flamingo.md`: a complete finished episode to match for depth, tone and structure (not for content).
- `references/style-bible.md`: palette, depth layers, characters, motion and liveliness, camera, kinetic typography, transitions, component design rules, branding, safe area, sound, failure modes. Read it when writing any episode.
- `references/remotion-parallax-recipe.md`: how the shared engine works, the episode wiring from voice-over to frames, word timestamps, and the verify loop. Read it when building, or when the user asks how it is built.
- `assets/engine-starter/` (the unzipped `engine-starter.zip`): the shared Remotion engine, a demo episode wiring and the asset script. Copy it into the video repo once.
- `references/publish-pack.md`: titles, description, pinned comment and hashtag formats (Indonesian by default). Read it when the user asks for publishing text.
- `references/market-research.md`: market and policy research (dated), the monetization thresholds, the channel's own data, recommendations and a starter idea backlog. Read it for strategy questions and ideas mode.
- `references/series-log.md`: the starting template of `series-log.md`; the live copy lives in the workspace root and is updated after every episode.
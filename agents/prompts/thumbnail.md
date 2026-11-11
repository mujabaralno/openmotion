Create a PNG thumbnail for this finished animated short, using the episode’s existing visual design.

Topic: {{topic}}
Language: {{language}}
Series: {{series}}

Read the approved episode packet at {{package}} and narration at {{narration}}.
Read the existing visual source at {{composition}}. The approved final video is at {{video}}.

Reuse or adapt the episode’s shapes, characters, colors, and visual composition into a strong, representative still. Preserve the established style and factual meaning.

Create a portrait thumbnail with:
- Exact dimensions: 1080×1920 pixels.
- One clear focal subject that remains recognizable at small sizes.
- A short, readable hook in the episode language.
- Strong text/background contrast and generous safe margins.
- A complete, opaque background.

You may construct the artwork from static SVG or adapt the existing scene code, then rasterize it using an available local rendering tool. Use installed dependencies only. Keep the artwork self-contained without remote assets, external fonts, or network requests.

Save the final image as a valid PNG at {{thumbnail}}. This output path must end in .png. The file must contain actual PNG image data, not SVG markup or JSX with a renamed extension.

Verify that the saved file can be decoded as PNG and has dimensions of exactly 1080×1920 pixels. If rendering fails, report the failure clearly instead of claiming the thumbnail is complete.

Do not change the video, scene source, audio, metadata, configuration, or other episodes. Do not run another agent, scaffold a project, install packages, or render another MP4.

{{notes}}

Finish by naming the saved PNG file.
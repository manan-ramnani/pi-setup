---
name: remotion-video-toolkit
description: "Build Remotion rendering pipelines, server integrations, and parameterised video templates."
---

# Remotion Video Toolkit

Use this skill for rendering pipelines, server integrations, and reusable parameterised video templates. Use `remotion-best-practices` for ordinary composition and animation work. Do not load both rule catalogs for the same basic task.

## Select the needed references

- Rendering through the CLI, Node API, or a server: [rules/rendering.md](rules/rendering.md).
- Template inputs and composition registration: [rules/compositions.md](rules/compositions.md).
- Duration, dimensions, or metadata derived from props: [rules/calculate-metadata.md](rules/calculate-metadata.md).
- Caption ingestion or conversion: [rules/transcribe-captions.md](rules/transcribe-captions.md) or [rules/import-srt-captions.md](rules/import-srt-captions.md).
- Read another rule only when a pipeline needs that feature. Existing animation and media references remain available.

Preserve the project's supported dependency versions and use its existing render commands. Confirm provider, credentials, deployment target, and cost authority before invoking external rendering or transcription services. In an offline task, use local fixtures and local rendering only.

Verify the requested output format, dimensions, duration, parameter mapping, and a representative rendered result. Do not treat successful job submission as a completed render.

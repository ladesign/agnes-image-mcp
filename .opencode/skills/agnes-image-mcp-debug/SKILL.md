---
name: agnes-image-mcp-debug
description: Diagnose OpenCode agnes-image MCP image-analysis failures, especially cases where agnes-image_analyze_image is called but no Tool Result is returned. Designed for Agnes Vision agnes-2.5-flash with agnes-2.0-flash fallback.
---

# Agnes Image MCP Debug V1.1

## Purpose

Diagnose the complete execution chain:

OpenCode → agnes-image MCP → agnes-image_analyze_image → Agnes Vision API → Tool Result → OpenCode model context.

This skill is specifically for Vision analysis. Do not use another vision model as a comparison unless the user explicitly requests it.

## Known project configuration baseline

Expected `.opencode/opencode.json` configuration:

- MCP name: `agnes-image`
- type: `local`
- command: `node ./mcp/agnes-image-mcp/src/server.mjs`
- cwd: `.`
- `AGNES_VISION_MODEL`: `agnes-2.5-flash`
- `AGNES_VISION_FALLBACK_MODEL`: `agnes-2.0-flash`
- `AGNES_VISION_TIMEOUT_MS`: `180000`
- `AGNES_IMAGE_TIMEOUT_MS`: `300000`
- MCP timeout: `620000` ms

Do not confuse these Vision models with the separate image-generation models:

- `AGNES_IMAGE_MODEL`: `agnes-image-2.5-flash`
- `AGNES_IMAGE_FALLBACK_MODEL`: `agnes-image-2.1-flash`

## Diagnostic priorities

### P0 — Tool Result / execution completion

The most important symptom is:

```text
Tool Call
  ↓
等待回傳分析結果...
  ↓
no Tool Result
```

Determine whether:

1. The MCP process started.
2. The tool was discovered.
3. The tool call was accepted.
4. The MCP server began execution.
5. Agnes API was contacted.
6. Agnes API returned.
7. The MCP server serialized a valid Tool Result.
8. OpenCode received that Tool Result.
9. The model received the Tool Result.

If no Tool Result is visible, do not classify the problem as model post-processing.

### P1 — Timeout

The configured MCP timeout is 620000 ms.

The MCP `timeout` is a single server-wide ceiling, not a per-tool value, so it must exceed the theoretical worst case of the slowest tool path: Image fallback = `AGNES_IMAGE_TIMEOUT_MS` + `AGNES_IMAGE_TIMEOUT_MS` = 300000 + 300000 = 600000 ms. Vision fallback worst case is 180000 + 180000 = 360000 ms.

The API-level timeouts (`AGNES_VISION_TIMEOUT_MS` 180000 ms, `AGNES_IMAGE_TIMEOUT_MS` 300000 ms) always fire before the MCP ceiling, so a large MCP timeout does not make hangs worse in practice. This ordering matters:

- With this ordering the API layer aborts first and the server returns a real `isError` Tool Result, so a hung call is visible as an error rather than a missing Tool Result.
- If the MCP timeout is ever set below an API timeout (for example back to 120000 ms vs Vision 180000 ms), the MCP layer expires first and produces exactly the `Tool Call → no Tool Result` symptom. Treat that specific mismatch as the primary hypothesis for that symptom.

Record whether the call:

- returns before timeout,
- hangs until approximately 620 seconds (MCP ceiling, i.e. no `isError` was produced at all),
- hangs until approximately 180 seconds (Vision API abort) then returns an `isError` Tool Result,
- fails earlier with an error.

If it reaches the MCP timeout boundary without a Tool Result, classify as `TIMEOUT` unless stronger evidence identifies the underlying cause.

### P2 — Agnes Vision model

For image analysis, the expected primary model is:

`agnes-2.5-flash`

The configured fallback is:

`agnes-2.0-flash`

Determine from server output/logs whether fallback occurred. Never assume fallback merely because the primary model failed.

### P3 — Image path

Because MCP has:

```json
"cwd": "."
```

and the MCP command is launched from the OpenCode project context, treat:

```text
./reference/dashboard.jpg
```

as expected to resolve from the project root.

Do not make relative-path failure the primary hypothesis.

If needed, compare with the absolute path resolved from the actual project root, for example:

```text
D:\project_GitHub\mcp\agnes-image-mcp-main\reference\dashboard.jpg
```

Only classify `PATH_RESOLUTION` when evidence supports it.

### P4 — Result serialization / propagation

Inspect whether Agnes returns data that the MCP server cannot serialize into a valid MCP Tool Result.

Possible classification:

`RESULT_SERIALIZATION`

If the MCP server has a valid result but OpenCode does not expose it to the model:

`RESULT_PROPAGATION`

### P5 — Model post-processing

Only use `MODEL_POSTPROCESSING` if a valid Tool Result is demonstrably present in the model context but the model fails to produce the requested final response.

## Diagnostic procedure

Run tests in this order.

### Test 1 — MCP/tool discovery

Confirm:

- `agnes-image` is connected.
- `agnes-image_analyze_image` exists.
- No unrelated MCP is being selected.

### Test 2 — Minimal Vision call

Use:

```text
請使用 agnes-image MCP 的 agnes-image_analyze_image。
分析：
./reference/dashboard.jpg

Prompt：
簡述此畫面的主要 UI 元件與佈局。

取得 Tool Result 後直接輸出分析結果。
不要再次呼叫工具。
```

### Test 3 — Observe Tool Result

The expected trace is:

```text
Tool Call
→ MCP execution
→ Tool Result
→ final model response
```

If the trace stops after Tool Call, investigate server/API/timeout rather than model reasoning.

### Test 4 — Absolute path

If necessary, repeat using the absolute image path.

### Test 5 — Log inspection

Inspect the MCP server process/logs for:

- image file read errors,
- API authentication errors,
- HTTP status,
- request timeout,
- Agnes API response body,
- model name,
- fallback activation,
- JSON/MCP serialization errors.

Never expose the actual `AGNES_API_KEY` in the report.

## Classification

Use exactly one primary classification when possible:

- `MCP_DISCOVERY`
- `TOOL_EXECUTION`
- `PATH_RESOLUTION`
- `AGNES_API`
- `AGNES_AUTH`
- `AGNES_MODEL`
- `TIMEOUT`
- `RESULT_SERIALIZATION`
- `RESULT_PROPAGATION`
- `MODEL_POSTPROCESSING`
- `UNKNOWN`

Also provide secondary evidence when useful.

## Required final report

Output:

```text
=== Agnes Image MCP Debug Report V1.1 ===

Project:
MCP:
Tool:
Vision primary model:
Vision fallback model:
MCP timeout:

[1] MCP Discovery:
PASS / FAIL

[2] Tool Call:
PASS / FAIL

[3] Image Path:
PASS / FAIL / NOT_TESTED

[4] Agnes API:
PASS / FAIL / UNKNOWN

[5] Vision Model:
agnes-2.5-flash / fallback / UNKNOWN

[6] Tool Result:
RECEIVED / NOT_RECEIVED / UNKNOWN

[7] Result Serialization:
PASS / FAIL / UNKNOWN

[8] Result Propagation:
PASS / FAIL / UNKNOWN

[9] Model Postprocessing:
PASS / FAIL / NOT_REACHED

Primary Classification:
...

Evidence:
...

Recommended Next Action:
...
```

## Important constraints

- Do not use MiMo, Gemini, or another model as a diagnostic comparison unless explicitly requested.
- Do not generate images.
- Do not modify application source code during diagnosis unless explicitly requested.
- Never print API keys.
- Distinguish evidence from hypotheses.
- If the Tool Result is absent, prioritize MCP execution/API/timeout/result serialization/propagation.

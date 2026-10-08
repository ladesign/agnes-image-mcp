# Diagnostic Matrix

| 現象 | 優先分類 | 判斷 |
|---|---|---|
| Tool 找不到 | MCP_DISCOVERY | MCP/Tool discovery 問題 |
| Tool Call 根本沒有發生 | TOOL_EXECUTION | 模型沒有成功執行工具 |
| Tool Call 後長時間無 Result | TIMEOUT / AGNES_API / TOOL_EXECUTION | 需看 MCP server log |
| 約 620 秒後無 Result | TIMEOUT | MCP timeout 到期，Result 完全沒回來 |
| 約 180 秒後回傳錯誤 | AGNES_API | Vision API 層 abort，已正常回傳 isError |
| 圖片不存在 | PATH_RESOLUTION | 檢查 cwd 與路徑 |
| Agnes HTTP 401/403 | AGNES_AUTH | API Key/權限 |
| Agnes HTTP 4xx/5xx | AGNES_API | API request/服務端問題 |
| 2.5 失敗並明確切換 2.0 | AGNES_MODEL | fallback 已發生 |
| API 有結果但 MCP 無合法 Result | RESULT_SERIALIZATION | MCP response 格式問題 |
| MCP 有 Result 但 OpenCode 看不到 | RESULT_PROPAGATION | Result 沒進模型 context |
| Model 收到 Result 卻不回答 | MODEL_POSTPROCESSING | 最後一層問題 |

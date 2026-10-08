使用 agnes-image-mcp-debug Skill。

請診斷：
./reference/dashboard.jpg

使用：
- agnes-image MCP
- agnes-image_analyze_image
- Agnes Vision primary: agnes-2.5-flash
- fallback: agnes-2.0-flash

不要使用 MiMo 或其他模型作比較。

請特別確認：
1. Tool Call 是否成功
2. Agnes API 是否實際回應
3. 是否使用 agnes-2.5-flash
4. 是否 fallback 到 2.0
5. Tool Result 是否真的回到 OpenCode
6. 是否發生 620 秒 MCP timeout 或 180 秒 Vision API timeout
7. 是否有 serialization / propagation 問題

最後輸出完整 Debug Report。

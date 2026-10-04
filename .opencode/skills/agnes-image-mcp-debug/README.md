# agnes-image-mcp-debug V1.1

專門診斷 OpenCode + `agnes-image` MCP + Agnes Vision `agnes-2.5-flash` 的圖片分析問題。

## 針對目前專案配置

```json
{
  "mcp": {
    "agnes-image": {
      "type": "local",
      "command": [
        "node",
        "./mcp/agnes-image-mcp/src/server.mjs"
      ],
      "cwd": ".",
      "timeout": 120000,
      "environment": {
        "AGNES_VISION_MODEL": "agnes-2.5-flash",
        "AGNES_VISION_FALLBACK_MODEL": "agnes-2.0-flash"
      }
    }
  }
}
```

## 本版重要修正

V1.1 不再把相對路徑視為首要問題。

由於 MCP `cwd` 是 `.`，`./reference/...` 預期應由專案根目錄解析。

診斷優先級改為：

1. Tool Result 是否真的回來
2. MCP 是否執行完成
3. Agnes API 是否返回
4. 是否接近 120 秒 timeout
5. Result serialization
6. Result propagation
7. 最後才檢查 model post-processing

## 使用

將此資料夾放到：

```text
D:\project_ILS\SGMS\.opencode\skills\agnes-image-mcp-debug\
```

重新啟動 OpenCode 後使用：

```text
使用 agnes-image-mcp-debug Skill，
診斷目前專案的 agnes-image MCP。

目標 Vision 模型：agnes-2.5-flash
Fallback：agnes-2.0-flash
圖片：D:\project_ILS\SGMS\reference\補光設備操作畫面.png

不要使用其他模型比較。
重點確認 agnes-image_analyze_image 的 Tool Call
之後是否真的收到 Tool Result。

最後輸出完整 Agnes MCP Debug Report。
```

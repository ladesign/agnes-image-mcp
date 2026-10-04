# agnes-image-mcp

使用 `Agnes AI` 為終端機 AI Agent 的非視覺編碼模型提供 Vision 能力，使其能夠通過將它們連結到到具有視覺功能的模型來查看圖像。

當用戶將圖像附加到純文本模型時，opencode 會拒絕該圖像，並返回 " this model does not support image input "。 此 `agnes-image-mcp` 註冊了一個 " vision " 工具，該工具會處理圖像並將其發送到視覺模型，從而返回一個詳細的文本描述，供主要的模型進行推理。

> 讓沒有 Vision 能力的 AI Agent 也能「看懂UI設計圖片」並實現編碼，讓沒有 Vision 能力的 AI Agent（例如純文字模型）也能「看懂商品圖片」並產出電商圖片的 MCP Server。

`agnes-image-mcp` 是一個以 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 標準實作的 **stdio 本機 MCP Server**，將 [Agnes AI](https://app.agnes-ai.com/) 的 **Vision（圖片理解）** 與 **Image（圖片生成／編輯）** 兩組模型封裝成 5 個工具，讓 OpenCode 等 Agent 在**不具備原生視覺能力**的情況下，也能完成「看懂商品照 → 規劃版面 → 人工確認 → 生成電商圖」的完整流程。

- **套件版本**：v2.1.0
- **傳輸方式**：stdio（標準輸入／輸出）
- **執行環境**：Node.js 18+
- **相依套件**：`@modelcontextprotocol/sdk` ^1.18.2

---

## 為什麼需要這個 MCP

有些免費終端機 AI Agent 提供的模型是**純文字模型**，無法直接讀取圖片。傳統做法要嘛換成有視覺的模型、要嘛手動把圖片內容抄給 Agent。

本專案的解法是：**把「看圖」這件事交給 Agnes Vision，並以標準 MCP Tool 的形式回傳結構化 Markdown**。Agent（不論本身有無視覺能力）都能：

1. 用 `agnes-image_analyze_image` 取得圖片的視覺分析 Markdown。
2. 依據分析結果撰寫生圖計畫（image plan）。
3. 在**人工確認**後，用 `agnes-image_generate_image` / `_edit_image` / `_compose_images` 產出圖檔。

重點是可使用 Agnes 官方提供的**免費 API**來完成所有工作。

---

## 核心概念：Vision 與 Image 是兩個模型角色

這是本專案最重要的設計前提 —— **Vision 分析模型與 Image 生圖模型是不同的模型，不要混用**：

| 角色 | 用途 | 主要模型 | Fallback 模型 |
| --- | --- | --- | --- |
| **Vision**（圖片視覺分析） | 讀懂參考圖，回傳結構化 Markdown | `agnes-2.5-flash` | `agnes-2.0-flash` |
| **Image**（圖片生成／編輯） | 依 prompt 產出或修改圖片 | `agnes-image-2.5-flash` | `agnes-image-2.1-flash` |

**Fallback 觸發條件**：當主要模型收到 HTTP `400` / `404` / `422`（模型不存在、不支援該參數、請求格式錯誤）**且**目前使用的並非 fallback 模型本身時，會自動改用 fallback 模型重試一次。因此若你手動指定了 fallback 模型，失敗時不會再重試。

> 程式碼位置：[`mcp/agnes-image-mcp/src/agnes-api.mjs`](mcp/agnes-image-mcp/src/agnes-api.mjs) 的 `analyzeImage()` 與 `generateImage()`。

---

## 工具列表

MCP Server 註冊名稱為 **`agnes-image-mcp`**（在 `server.mjs` 中宣告），在 OpenCode 設定檔中的 **MCP 設定鍵名為 `agnes-image`** —— 也就是說工具名稱會以 `agnes-image_` 為前綴：

| 工具名稱 | 說明 | 必填參數 | 選填參數 |
| --- | --- | --- | --- |
| `agnes-image_analyze_image` | 用 Agnes Vision 分析本機參考圖，回傳結構化視覺分析文字（未指定 `prompt` 時為 Markdown） | `image_path` | `prompt`, `model` |
| `agnes-image_generate_image` | 以文字 prompt 生成電商圖片（可帶本機參考圖） | `prompt` | `size`, `ratio`, `reference_images`, `model`, `output_path` |
| `agnes-image_edit_image` | 以圖生圖（Image-to-Image）方式編輯既有商品圖 | `prompt`, `image_path` | `size`, `ratio`, `model`, `output_path` |
| `agnes-image_compose_images` | 將多張本機參考圖合成為一張生成圖 | `prompt`, `image_paths` | `size`, `ratio`, `model`, `output_path` |
| `agnes-image_agnes_status` | 顯示目前 MCP 設定狀態（**不會洩漏 API Key**） | — | — |

### 參數細節

- **`image_path` / `image_paths` / `reference_images`**：本機圖檔路徑，支援 `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`，會自動轉為 **Base64 Data URI** 後送出。
- **`prompt`（分析用）**：若未指定，內建 prompt 會要求模型回傳 Markdown，涵蓋：商品身份、款式變體、可見文字、形狀比例、顏色、材質、構圖、光線、背景、道具、品牌／包裝元素、必須保留的細節、以及不確定之處（並要求**不要編造**細節）。若自行指定 `prompt`，回傳格式則由你的 prompt 決定。
- **`model`**：可指定單次呼叫要使用的模型，覆蓋環境變數的預設值。
- **`size`**：預設 `2K`。
- **`ratio`**：預設 `9:16`（適合電商直式主圖）。若觸發 Image fallback，程式會自動移除 `ratio` 欄位再重試。
- **`output_path`**：指定後，Server 會改以 `response_format: "b64_json"` 請求，並將圖檔**自動寫入該路徑**（自動建立目錄），回傳結果中以 `[saved to file]` 取代 base64 內容以避免爆量；未指定則回傳圖片 URL。
  > 若 API 未回傳 base64 資料，Server 會略過寫檔並直接回傳原始結果（不會報錯）。

### 逾時設定

| 作業 | 單次請求逾時 |
| --- | --- |
| Vision 分析 | 180 秒 |
| Image 生成／編輯 | 300 秒 |
| OpenCode MCP `timeout`（建議值） | 120000 ms |

> 每個 HTTP 請求都有獨立計時器；若觸發 fallback，會再發一次新請求，因此理論最壞時間約為 Vision 360 秒 / Image 600 秒。若工作流較長，建議調高 OpenCode 的 MCP `timeout`。

---

## 環境需求

- **Node.js 18 以上**（需原生支援 `fetch` 與 `AbortController`）
- **npm**
- **Agnes AI API Key** —— **可以用免費 API 完成所有工作**
- 一個 **OpenCode 專案目錄**（或其他支援 MCP 的 AI Agent 客戶端）

---

## 安裝

### Step 1 — 複製 MCP 目錄

將本專案的 `mcp` 目錄複製到你的 OpenCode 專案下：

```text
<你的專案>/
└── mcp/
    └── agnes-image-mcp/
        ├── package.json
        └── src/
            ├── agnes-api.mjs
            └── server.mjs
```

或者直接複製 `agnes-image-mcp` 資料夾到 `<你的專案>/mcp/`。

### Step 2 — 安裝相依套件

```bash
cd mcp/agnes-image-mcp
npm install
cd ../..
```

> `npm install` 會產生 `mcp/agnes-image-mcp/node_modules`。由於 Node 的相依套件解析是從**檔案所在位置**向上搜尋，請確認 `opencode.json` 中的 `command` 路徑指向實際的 `src/server.mjs`，且 `node_modules` 存在於 `mcp/agnes-image-mcp/` 之下。

### Step 3 — 設定環境變數

**只有 API Key 需要設成系統環境變數**（避免 Key 寫進檔案而外洩）；其餘參數無安全疑慮，可直接寫在 `opencode.json`。

```cmd
:: 必要：API Key 走系統環境變數，避免洩漏
setx AGNES_API_KEY "你的 Agnes API Key"

:: 以下皆為選填，且與 opencode.json 中的預設值相同
setx AGNES_BASE_URL "https://apihub.agnes-ai.com"
setx AGNES_VISION_MODEL "agnes-2.5-flash"
setx AGNES_VISION_FALLBACK_MODEL "agnes-2.0-flash"
setx AGNES_IMAGE_MODEL "agnes-image-2.5-flash"
setx AGNES_IMAGE_FALLBACK_MODEL "agnes-image-2.1-flash"
```

> `setx` 僅影響**新啟動**的程序，設定後務必重新開啟終端機或 VS Code。

確認 API Key 已寫入系統環境變數：
```text
echo %AGNES_API_KEY%
```

### Step 4 — 設定 OpenCode

在 **`<專案>/.opencode/opencode.json`** 新增：

```json
{
  "$schema": "https://opencode.ai/config.json",

  "mcp": {
    "agnes-image": {
      "type": "local",
      "command": [
        "node",
        "./mcp/agnes-image-mcp/src/server.mjs"
      ],
      "cwd": ".",
      "environment": {
        "AGNES_API_KEY": "{env:AGNES_API_KEY}",
        "AGNES_BASE_URL": "https://apihub.agnes-ai.com",
        "AGNES_VISION_MODEL": "agnes-2.5-flash",
        "AGNES_VISION_FALLBACK_MODEL": "agnes-2.0-flash",
        "AGNES_IMAGE_MODEL": "agnes-image-2.5-flash",
        "AGNES_IMAGE_FALLBACK_MODEL": "agnes-image-2.1-flash"
      },
      "timeout": 120000
    }
  }
}
```

重點說明：

- `"{env:AGNES_API_KEY}"` 讓 OpenCode 從環境變數讀取金鑰，**金鑰不會寫進版控檔案**。
- `"cwd": "."` 表示 MCP 由**專案根目錄**啟動，因此 `./reference/xxx.png` 這類相對路徑會從專案根目錄解析。
- `"timeout": 120000` 為建議值；由於 Vision API 最長可能跑到 180 秒，若頻繁逾時可依需求調高。

---

## 驗證安裝

**1. 重新啟動終端機或 VS Code**（讓 `setx` 生效），再確認 MCP 連線狀態：

```cmd
opencode mcp list
```

應看到 `agnes-image` MCP 為 connected 狀態。

**2. 進入 OpenCode，檢查 MCP 自我狀態：**

```text
use the agnes-image MCP to check its status
```

這會呼叫 `agnes-image_agnes_status`，輸出如下 JSON（`apiKey` 只顯示布林值，不會洩漏金鑰）：

```json
{
  "apiKey": true,
  "baseUrl": "https://apihub.agnes-ai.com",
  "visionModel": "agnes-2.5-flash",
  "visionFallback": "agnes-2.0-flash",
  "imageModel": "agnes-image-2.5-flash",
  "imageFallback": "agnes-image-2.1-flash"
}
```

**3. 測試圖片分析：**

```text
請分析 "./reference/dashboard.png" 這張圖片，告訴我畫面中的主要 UI 元件、Layout、文字、顏色與間距。
```

---

## 用法

### 用法一：讓 Agent 自行選用工具

最簡單的方式 —— 直接用自然語言描述需求，Agent 會自行挑選合適的 MCP 工具：

```text
請用 agnes-image MCP 分析 ./reference/CheesePizza.jpg，依照電商圖片工作流的需求，
整理商品外觀、包裝、材質與配色，輸出 Markdown。
```

### 用法二：明確指定工具與輸出路徑

```text
請使用 agnes-image_analyze_image 分析 ./reference/手工披薩.png，
並把分析結果存成 products/手工披薩/planning/visual-analysis.md。
```

### 用法三：圖生圖編輯（保留商品外觀）

```text
請使用 agnes-image_edit_image，以 ./reference/手工披薩.png 為基礎，
把它改成溫暖米色調的電商主圖，size 用 2K、ratio 用 4:5，
輸出到 ./output/手工披薩-v2.png。
```

### 用法四：多圖合成

```text
請使用 agnes-image_compose_images，把 ./reference/正面.jpg 與 ./reference/側面.jpg
合成為一張白底電商商品圖，輸出到 ./output/合成圖.png。
```

### 用法五：純文字生成

```text
請使用 agnes-image_generate_image 生成一張 9:16 的電商形象圖：
「在米白大理石桌面上擺放手工披薩，柔和自然光，淺景深」，
輸出到 ./output/手工披薩-形象圖.png。
```

---

## 用於電商圖片工作流程

本 MCP 可服務於 **電商圖片工作流**(此專案未包含)，完整流程為四個階段，**視覺分析與生圖是兩個分離的模型角色，中間一定要經過人工確認**：

```text
┌──────────────────────────────────────────────────────────────┐
│  階段 1：Vision 分析（讀圖）                                  │
│                                                              │
│  本機 PNG/JPG                                                │
│      ↓  轉 Base64 Data URI                                   │
│  agnes-2.5-flash（fallback: agnes-2.0-flash）                │
│      ↓  POST /v1/chat/completions                            │
│  視覺分析 Markdown                                           │
└──────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────┐
│  階段 2：電商規劃（Agent 規劃）                                │
│                                                              │
│  Agent 依視覺分析結果 + 商品資料                              │
│  產出 image-plan.md（版面、留白、道具、光線、必留元素）         │
└──────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────┐
│  階段 3：人工確認 ★關卡★                                      │
│                                                              │
│  人員檢查 image-plan.md 與原圖是否吻合                        │
│  必要時修正 prompt、比例、保留元素                            │
└──────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────┐
│  階段 4：Agnes 生圖                                           │
│                                                              │
│  agnes-image-2.5-flash（fallback: agnes-image-2.1-flash）    │
│      ↓  POST /v1/images/generations                          │
│  產出電商圖檔（自動存檔到 output_path）                        │
└──────────────────────────────────────────────────────────────┘
```

### 產出檔案結構

```text
products/
└── 手工披薩/
    └── planning/
        ├── visual-analysis.md   ← 階段 1：Vision 分析結果
        └── image-plan.md        ← 階段 2：生圖計畫
```

### 為什麼需要人工確認關卡？

Agent 對圖片的「理解」與設計師的「審美」之間存在落差；且 Vision 模型有時會推測不存在的細節（內建 prompt 已明確要求標註不確定處）。階段 3 讓人在花費生圖額度前先審核計畫，避免產生一批不符需求的圖檔後重來。

### 模型分工的意義

| | Vision | Image |
| --- | --- | --- |
| 問題類型 | 「這張圖看起來是什麼？」 | 「照這個描述畫一張圖」 |
| 輸入 | 圖片（Data URI）+ 分析 prompt | 文字 prompt（+ 可選參考圖） |
| 輸出 | 文字 Markdown | 圖片（URL 或 base64） |
| 角色 | 分析者 / 規劃者 | 執行者 |
| 對應工具 | `agnes-image_analyze_image` | `agnes-image_generate_image` / `_edit_image` / `_compose_images` |

---

## 專案結構

```text
.
├── README.md
├── mcp/
│   └── agnes-image-mcp/
│       ├── package.json          # v2.1.0，依賴 @modelcontextprotocol/sdk
│       └── src/
│           ├── server.mjs        # MCP Server：工具註冊 + stdio 傳輸
│           └── agnes-api.mjs     # Agnes API 封裝：Data URI、fallback、逾時
└── .opencode/
    ├── .gitignore                # 排除 node_modules 與本地套件檔
    ├── opencode.json             # MCP 設定範例（本專案自身即已註冊 agnes-image）
    └── skills/
        └── agnes-image-mcp-debug/  # 除錯用 Skill（選用）
            ├── SKILL.md
            ├── README.md
            ├── examples/test-prompt.md
            └── references/diagnostic-matrix.md
```

### 原始碼結構

**`src/server.mjs`** —— 建立 MCP Server、註冊 5 個工具、以 `StdioServerTransport` 啟動。所有錯誤都會被 `try/catch` 捕捉並以 `isError: true` 回傳錯誤堆疊。

**`src/agnes-api.mjs`** —— 環境變數讀取與 API 溝通：

| 匯出函式 | 職責 |
| --- | --- |
| `fileToDataUri(file)` | 讀本機圖檔並轉 Base64 Data URI（依副檔名判斷 MIME） |
| `analyzeImage(file, prompt, model)` | 呼叫 `/v1/chat/completions`，失敗時自動 fallback |
| `generateImage({ prompt, size, ratio, images, model, responseFormat })` | 呼叫 `/v1/images/generations`；`size`／`ratio` 直接送出，`images` 與 `responseFormat` 會包裝進 `extra_body.image` 與 `extra_body.response_format`；失敗時自動 fallback |
| `extractText(response)` | 取 `choices[0].message.content` |
| `extractImages(response)` | 取 `data[]` |
| `configSummary()` | 回傳不含金鑰的設定摘要 |

---

## 除錯

當圖片分析失敗（例如畫面只顯示「等待回傳分析結果…」卻看不到分析內容），可使用內附的 **`agnes-image-mcp-debug` Skill** 進行標準化診斷。

### 安裝 Skill

將 `.opencode/skills/agnes-image-mcp-debug` 複製到目標專案：

```text
<你的專案>/.opencode/skills/agnes-image-mcp-debug/
```

### 執行診斷

在 OpenCode 中輸入（把圖片路徑換成真實路徑）：

```text
使用 agnes-image-mcp-debug Skill，診斷目前專案的 agnes-image MCP。

目標 Vision 模型：agnes-2.5-flash
Fallback：agnes-2.0-flash
圖片：D:\your-project\reference\product.png

不要使用其他模型比較。

重點確認 agnes-image_analyze_image 的 Tool Call
之後是否真的收到 Tool Result。

最後輸出完整 Agnes MCP Debug Report。
```

### 診斷優先順序

Skill 依 **P0 → P5** 順序排查，重點是**先確認 Tool Result 有沒有回來**，而不是先怪模型：

| 優先級 | 檢查項目 |
| --- | --- |
| **P0** | Tool Result / 執行是否完成（9 步鏈路追蹤） |
| **P1** | 逾時（對照 MCP `timeout: 120000`） |
| **P2** | Agnes Vision 模型（是否真的發生 fallback） |
| **P3** | 圖片路徑解析（`cwd: "."` 從專案根目錄解析） |
| **P4** | Result serialization / propagation |
| **P5** | Model post-processing（最後才檢查） |

完整追蹤鏈路：

```text
OpenCode → agnes-image MCP → agnes-image_analyze_image
        → Agnes Vision API → Tool Result → OpenCode 模型 context
```

### 診斷分類速查表

| 症狀 | 主要分類 | 判斷方向 |
| --- | --- | --- |
| 找不到 Tool | `MCP_DISCOVERY` | MCP / Tool discovery |
| Tool Call 根本沒發生 | `TOOL_EXECUTION` | 模型未成功執行工具 |
| Tool Call 後長時間無 Result | `TIMEOUT` / `AGNES_API` / `TOOL_EXECUTION` | 需查看 MCP server log |
| 約 120 秒後失敗 | `TIMEOUT` | 對應 MCP `timeout` 設定 |
| 圖片不存在 | `PATH_RESOLUTION` | 檢查 `cwd` 與路徑 |
| Agnes HTTP 401 / 403 | `AGNES_AUTH` | API Key / 權限問題 |
| Agnes HTTP 4xx / 5xx | `AGNES_API` | API request 或服務端問題 |
| 2.5 失敗且明確切換 2.0 | `AGNES_MODEL` | fallback 已發生 |
| API 有結果但 MCP 無合法 Result | `RESULT_SERIALIZATION` | MCP response 格式問題 |
| MCP 有 Result 但 OpenCode 看不到 | `RESULT_PROPAGATION` | Result 未進入模型 context |
| Model 收到 Result 卻不回答 | `MODEL_POSTPROCESSING` | 最後一層問題 |

> **實測心得**：部分模型（例如 Big Pickle）確實能取得 Agnes 的分析結果，只是終端畫面未完整顯示。若要確認結果，請要求 Agent 將分析內容寫入檔案，或輸出成靜態 HTML 檢視。

---

## 常見問題

<details>
<summary><b>Q：設定了 AGNES_API_KEY 卻仍報「AGNES_API_KEY is not configured.」</b></summary>

`setx` 只對**新啟動**的程序生效。請完全關閉並重新開啟終端機或 VS Code，再執行 `opencode mcp list` 確認。同時確認 `opencode.json` 中有寫入 `"AGNES_API_KEY": "{env:AGNES_API_KEY}"`。
</details>

<details>
<summary><b>Q：Tool Call 成功，但畫面只顯示「等待回傳分析結果...」看不到分析文字</b></summary>

這通常**不是 MCP 沒回傳**的問題。可要求 Agent 把 Tool Result 寫成檔案確認：

```text
請將剛才的分析結果存成 ./output/visual-analysis.md
```

或輸出成網頁檢視：

```text
將分析結果生成靜態 html + bootstrap 4.6.2，放在 ./app
```

完整排查流程請使用 `agnes-image-mcp-debug` Skill。
</details>

<details>
<summary><b>Q：相對路徑找不到圖片</b></summary>

由於 MCP 設定 `"cwd": "."`，相對路徑會**從專案根目錄**解析。`./reference/xxx.png` 應指向 `<專案根>/reference/xxx.png`。若仍失敗，請改用絕對路徑，並注意 Windows 路徑在 JSON 中需使用雙反斜線 `\\`。
</details>

<details>
<summary><b>Q：何時會自動 fallback？</b></summary>

僅當主要模型回傳 HTTP `400` / `404` / `422` 時才 fallback。其他錯誤（如 `401` 驗證失敗、`500` 服務端錯誤）會直接回報，不會切換模型。因此 fallback 通常代表**模型名稱錯誤或參數不被支援**，而非額度或網路問題。
</details>

<details>
<summary><b>Q：怎麼確認實際用的是哪個模型？</b></summary>

`agnes-image_analyze_image` 的回傳結果第一行會標示實際使用的模型，例如：

```text
Model: agnes-2.5-flash

（以下為分析內容）
```

三個 Image 類工具則在回傳 JSON 的 `model` 欄位顯示：

```json
{ "model": "agnes-image-2.5-flash", "output_path": "./output/主圖.png", ... }
```

`agnes-image_agnes_status` 則會同時列出主要與 fallback 模型（但不會顯示金鑰）。
</details>

<details>
<summary><b>Q：圖片檔案有大小限制嗎？</b></summary>

本專案將圖片轉為 Base64 Data URI 內嵌於 JSON request，因此有效 payload 會比原始檔案大約 33%。Agnes 端的上限請參考 [Agnes AI 官方網站](https://app.agnes-ai.com/)。若遇到 `413` 或 `400`，可先對圖片做等比縮小。
</details>

---

## 安全注意事項

- **絕對不要把 API Key 寫進 `opencode.json` 或提交到版控庫。** 請使用 `{env:AGNES_API_KEY}` 搭配系統環境變數。
- 若不幸將金鑰外洩，請立即至 [platform.agnes-ai.com/settings/apiKeys](https://platform.agnes-ai.com/settings/apiKeys) 撤銷並重新申請。
- `agnes-image_agnes_status` 只回傳 `apiKey: true/false` 布林值，**不會**回傳金鑰內容，可安全用於除錯。
- 本專案圖片是以 Base64 內嵌送出的**文字 request**，未使用 multipart 上傳。
- 除錯報告與 log 中請勿印出 `AGNES_API_KEY`。

---

## 相關資源

| 資源 | 網址 |
| --- | --- |
| Agnes AI 官網 | https://app.agnes-ai.com/ |
| Agnes API Key 申請 | https://platform.agnes-ai.com/settings/apiKeys |
| Agnes API Hub | https://apihub.agnes-ai.com |
| MCP 官方網站 | https://modelcontextprotocol.io |
| OpenCode 設定 Schema | https://opencode.ai/config.json |

- Agnes AI 服務之使用條款與計費請以其官方網站公告為準。
- Agnes AI 官方標示提供 **Free API**，免費 API 與付費 Token Plan 分開計算。

---

## License

MIT。

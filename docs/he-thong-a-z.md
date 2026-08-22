# Acrylic Production — Toàn cảnh hệ thống A–Z + Target Contract

> Tài liệu để nắm toàn bộ dự án từ đầu đến cuối: nó làm gì, gồm những phần nào, dữ liệu chạy ra sao, phần nào đã thật và phần nào còn giả, muốn sửa gì thì vào đâu.
> **Phần A–M mô tả hệ thống ĐANG CÓ hôm nay. Phần N–AC là TARGET CONTRACT — trạng thái đích cần triển khai.**
> Đọc kèm: `codebase-memory.md` (chi tiết Tool), `tool-web-contract.md` (khuôn vận hành), `runner-mapping.md`, `tool-telemetry-gap.md` (gap telemetry), `repository-audit.md` (audit web).

---

## A. Hệ thống này làm gì

Hai nửa:

1. **Tool sản xuất (đã hoàn chỉnh, chạy thật):** tự động điều khiển Adobe Illustrator để **dàn (nesting) ảnh acrylic keychain lên tấm 30.48cm, rồi xuất file in (FRONT/BACK PNG 600 DPI) và file cắt laser (LAZER .ai Illustrator 8).** Đây là phần lõi, chạy bằng `npm start` trong thư mục `Tool`.

2. **Nền tảng giám sát/điều khiển (đang xây, phần lớn mới là khung):** một bộ Local Agent + Control API + SQLite + Web dashboard + NocoDB để **theo dõi** Tool đang chạy gì, hàng chờ, lỗi, thành phẩm — và *về sau* mới điều khiển (Start/Check/Export) từ web.

Trạng thái hiện tại một câu: **Tool = thật và mạnh; Nền tảng = mới ở mức "chỉ đọc", Web phần lớn là giao diện mẫu.**

---

## B. Bản đồ monorepo

```
D:\FFactory\Arcylic\
├── Tool\                     ★ RUNNER SẢN XUẤT (độc lập, TS + JSX + Python + VBS)
│   ├── src\index.ts          orchestrator chính
│   ├── src\nesting\engine.ts  nesting TS (chỉ demo)
│   ├── scripts\*.jsx|py|vbs   ExtendScript + Python + VBScript
│   └── .runtime\             file tạm: progress.json, result.json, pending-commit.json
├── apps\
│   ├── local-agent\          Observer: quét folder + tiến trình → SQLite   (chỉ đọc)
│   ├── control-api\          Fastify REST + SSE, cổng 4320                  (chỉ đọc)
│   ├── web\                  React dashboard (8 trang)
│   └── desktop\              Electron bọc web
├── packages\
│   ├── contracts\            Kiểu dữ liệu dùng chung (TS types)
│   ├── telemetry\            Nhà máy tạo event
│   ├── database\             Bọc SQLite (node:sqlite) + schema SQL
│   ├── nocodb\               Client đẩy dữ liệu lên NocoDB
│   └── ui\                   (rỗng, ~186 byte)
├── docs\                     Tài liệu (contract, mapping, gap, audit, file này)
├── template\                 Template_UVDTF.ai, Template_Lazer.ai
├── Images, images_error, imgaes_done, wait,
│   output_ai, output_front, output_back, output_lazer   ← FOLDER SẢN XUẤT
├── .platform-data\           platform.sqlite (DB của nền tảng)
└── packages/... , node_modules, ...
```

Đây là monorepo dùng workspace: các app import package bằng tên `@acrylic/contracts`, `@acrylic/database`, `@acrylic/telemetry`, `@acrylic/nocodb`.

---

## C. Kiến trúc & luồng dữ liệu (grounded theo code thật)

```text
        [Tool sản xuất]  ──ghi──▶  Tool/.runtime/*.progress.json  (1 file, ghi đè)
              │                     + thay đổi folder (Images/wait/output/...)
              │ (không gọi telemetry, không biết Agent tồn tại)
              ▼
        [Local Agent]  mỗi 3s:
           • quét 8 folder (đệ quy) → danh sách file
           • PowerShell liệt kê tiến trình Illustrator/cscript/node
           • đọc *.progress.json mới nhất
           → dựng AgentSnapshot → chống trùng (fingerprint) → ghi
              ▼
        [SQLite platform.sqlite]  bảng: agent_snapshots, platform_events, sync_outbox
              │                                         │
              ▼                                         ▼
        [Control API :4320]  đọc latestSnapshot   [NocoDB sync nền] (nếu bật env)
           REST /api/v1/*  +  SSE /events (3s)
              ▼
        [Web React]  React Query (15s) + SSE  →  8 trang
              ▼
        [Desktop Electron]  chỉ mở cửa sổ trỏ vào web
```

**Điểm mấu chốt phải hiểu đúng:**

- **Tool và Agent KHÔNG nói chuyện trực tiếp.** Cầu nối duy nhất là *file trên đĩa*: `progress.json` (Agent đọc) + nội dung folder. Tool không phát event, không biết có Agent.
- **Agent chỉ QUAN SÁT.** Nó phát hiện "runner đang chạy" bằng cách **quét tiến trình Windows** (có process `node ...Tool...src/index.ts` hoặc `cscript.exe`, hoặc progress cập nhật < 60s). Nó **không** tự khởi động Tool.
- **Control API và Agent đều chỉ có GET.** Không có endpoint POST nào → **chưa có đường bấm Start/Check/Export từ web.** Mọi nút điều khiển trên web hiện là nút chết.
- **Freshness thực tế:** Agent 3s + Control API SSE 3s + Web React Query 15s. Nên "real-time" hiện tại là ~3–6s, không phải tức thời.

---

## D. Tầng 1 — Tool sản xuất (tóm tắt; chi tiết ở codebase-memory.md)

Chạy bằng Node + `tsx`. Vòng lặp `main()` theo từng sheet:

1. Có `wait_{cap}.ai` chưa? Có → mở lại nó, chỉ nhận item ≤ cap. Không → mở template.
2. Đọc PNG trong `Images`, parse tên (size/side/qty), **sort size↓ → qty↓ → tên**.
3. Bung theo qty thành các "run unit", chia batch (mặc định 90/lần = ~1 sheet).
4. Mỗi item: normalize PNG (Python `normalize-png.py`) → phân tích pixel màu (`pngjs`) → sinh `.runtime/*.jsx` (nhồi biến `CODEX_*`) → gọi `cscript launch-illustrator-and-run.vbs` → **Illustrator chạy `import-image.jsx`**: import ảnh, tạo mask 30.48cm, trace laser, check FRONT/BACK, scale, **pack**, chuyển sang layer output `EYE/FRONT/BACK/LAZER/BORDER`.
5. Sheet đầy/đủ checkpoint → lưu `wait_{cap}.ai` (còn chỗ) **hoặc** lưu `output_ai` + export FRONT/BACK PNG (600 DPI) + LAZER .ai (Illustrator 8).
6. **Commit sau khi save thành công:** cộng dồn `imgaes_done` + giảm qty file trong `Images` (hoặc xoá) — bọc bằng `pending-commit.json` để crash-safe.

Telemetry Tool phát ra: chỉ `writeProgress(index,total,state,imageBaseName,message)` vào **một** file `*.progress.json` (ghi đè), và batch-result JSON cuối mỗi batch (chứa `results[]`, `remainingFitCapInch`, `reports`). Không có id, không tọa độ packing, không event stream.

---

## E. Tầng 2 — Packages dùng chung

### `@acrylic/contracts` (packages/contracts/src/index.ts)
Kho kiểu dữ liệu dùng chung cho cả Agent/API/Web. Định nghĩa: `RunnerStatus` (idle/starting/running/paused/checkpoint/stopping/error/offline), `ItemStatus`, `OutputKind`, và các struct `RunRef, SheetSnapshot, ItemSnapshot, ErrorSnapshot, OutputSnapshot, FolderFileEntry, RunnerProgress, AgentSnapshot`.
**Lưu ý:** phần lớn struct (RunRef/SheetSnapshot/ItemSnapshot/ErrorSnapshot) đã **định nghĩa sẵn nhưng CHƯA được điền** — `AgentSnapshot` hiện chỉ có `folders + runnerProgress + status`; `activeRun/activeSheet` để trống. Đây là "khuôn cho tương lai".

### `@acrylic/telemetry` (packages/telemetry/src/index.ts)
`createEvent(identity, type, payload, refs)` → sinh `TelemetryEvent` có `eventId(uuid), occurredAt`. Danh sách type đã liệt kê đủ (`runner.*, sheet.*, item.*, output.*`) **nhưng thực tế chỉ `agent.started` và `agent.snapshot` được phát** (bởi Agent). Chưa có gì phát `item.placed`, `sheet.saved`... vì Tool không gọi telemetry.

### `@acrylic/database` (packages/database/src/index.ts + schema/001_initial.sql)
Bọc **`node:sqlite`** (module built-in của Node 22+, `DatabaseSync`) — không cần cài server DB, chỉ một file `platform.sqlite`. Ba bảng:
- `platform_events` (event_id PK, tool/machine, event_type, occurred_at, run/sheet/item id, payload_json)
- `agent_snapshots` (snapshot_id, tool/machine, captured_at, snapshot_json)
- `sync_outbox` (hàng chờ đẩy NocoDB: event_id, destination, status, attempts, payload_json)

Method: `appendEvent, enqueueSync, pendingSync, markSyncSuccess/Failure, recentEvents, saveSnapshot, listSnapshots, latestSnapshot`.
**Chưa có:** bảng run/sheet/item riêng, chưa bật WAL mode. "Lịch sử" hiện = danh sách snapshot + event `agent.snapshot`, chứ chưa phải run/sheet/item có cấu trúc.

### `@acrylic/nocodb` (packages/nocodb/src/index.ts)
Client mỏng: `insert(tableId, record)` POST lên `{baseUrl}/api/v2/tables/{id}/records` với header `xc-token`. `enabled` khi có baseUrl+token. Chỉ đồng bộ nền; tắt/lỗi không ảnh hưởng Tool hay Agent.

### `@acrylic/ui`
Rỗng (186 byte) — placeholder.

---

## F. Tầng 3 — Local Agent (apps/local-agent/src/index.ts)

Vai trò: **observer chỉ đọc**, chạy nền mỗi `intervalMs` (mặc định 3000ms).

Mỗi vòng (`captureSnapshot`):
- `scanFolder` đệ quy 8 folder sản xuất → `FolderFileEntry[]` (path, name, size, mtime), sort tên tự nhiên.
- `listWindowsProcesses` bằng PowerShell `Get-CimInstance Win32_Process` lọc `Illustrator|cscript|node` → lấy Name, PID, CommandLine.
- `latestProgress` đọc `*.progress.json` mới nhất trong `Tool/.runtime`.
- `detectRunnerStatus`: `running` nếu có process node trỏ vào `Tool...src/index.ts`, hoặc có `cscript.exe`, hoặc progress cập nhật < 60s; ngược lại `idle`.
- `illustratorConnected`: có process tên chứa "illustrator".
- Gộp thành `AgentSnapshot`.

Chống ghi thừa: tính `fingerprint` (status + illustrator + progress + danh sách file). Chỉ ghi SQLite khi fingerprint đổi **hoặc** đã 30s. Khi ghi: `saveSnapshot` + `appendEvent('agent.snapshot')` + `enqueueSync` NocoDB (nếu bật). `syncNocoDb` rút 20 dòng outbox/lần đẩy đi.

Cờ: `ACRYLIC_AGENT_ONCE=1` chạy một lần rồi thoát. Biến môi trường: `ACRYLIC_FACTORY_ROOT, ACRYLIC_TOOL_ROOT, ACRYLIC_PLATFORM_DATA, ACRYLIC_TOOL_ID, ACRYLIC_MACHINE_ID, ACRYLIC_AGENT_INTERVAL_MS, NOCODB_*`.

**Giới hạn quan trọng:** Agent **không** spawn Tool, **không** có command worker. Toàn bộ "tầng lệnh an toàn" trong hợp đồng (mục 8) *chưa tồn tại trong code*.

---

## G. Tầng 4 — Control API (apps/control-api/src/index.ts)

Fastify + CORS, cổng **4320**, base `/api/v1`. Đọc dữ liệu từ **SQLite `latestSnapshot`** (không tự quét folder — phục vụ lại snapshot của Agent).

Endpoint (tất cả GET):
- `/health`
- `/api/v1/status` → full AgentSnapshot
- `/api/v1/dashboard` → summary + kpi (queue/errors/wait/output*) — *chú ý: kpi ở đây KHÔNG có `done`/`processing`; Web tự bù từ folders*
- `/api/v1/queue | /errors | /wait` → danh sách file folder tương ứng
- `/api/v1/outputs` → `{ai, front, back, lazer}`
- `/api/v1/history/snapshots` (100) | `/history/events` (200)
- `/api/v1/integrations/nocodb` → cờ cấu hình
- `/api/v1/files/:scope?path=` → **stream preview PNG/JPG** (có chặn path traversal); PNG full-res, chưa có thumbnail
- `/api/v1/events` → **SSE**, đẩy `dashboard(snapshot())` mỗi 3s

**Giới hạn:** không endpoint POST → không điều khiển được gì. Dữ liệu "cũ" bằng nhịp Agent (dữ liệu API = snapshot Agent lưu gần nhất).

---

## H. Tầng 5 — Web (apps/web)

React + Vite + React Router + React Query + Tailwind + lucide-react. Vào `main.tsx`: `getDashboardData()` (REST, refetch 15s) trộn với `subscribeDashboard()` (SSE). 8 route → 8 trang. `AppShell` là header (trạng thái runner/Illustrator + 8 nav) + khung.

Lớp dữ liệu (`api/`): `client.ts` (fetch, `parseItemName`, `previewUrl`, format), `types.ts` (kiểu view), `repository.ts` (map API → view), `mock.ts` (dữ liệu giả fallback).

8 trang (`pages/`): Tổng quan, Hàng chờ, Sheets, Đã xong, Ảnh lỗi, Thành phẩm, Lịch sử, Cấu hình. Component tái dùng trong `components/` (MetricCard, DataTable, Panel, StatusBadge, ProgressBar, FileThumbnail, Filters, ActionButton...).

### Thật vs giả trong Web (rất quan trọng)

**Thật (chạy từ dữ liệu Agent):**
- Trạng thái runner + Illustrator (header).
- KPI đếm: số file Images/wait/error/output/done.
- Danh sách file: hàng chờ, wait, ảnh lỗi, thành phẩm, đã xong.
- Gom nhóm thành phẩm theo base name + trạng thái asset (exported/processing theo file có tồn tại).
- Preview ảnh PNG (qua `/files/:scope`).
- `progress.index/total/state` (item đang xử lý, state thô).

**Giả / hard-code (mockup):**
- **"18:42"** trong Tổng quan — chuỗi cứng.
- **Lưới preview sheet** trong trang Sheets — `Array.from({length:27})` ô màu ngẫu nhiên, hoàn toàn giả.
- **Danh sách bước** (Import/Check/Packing/Reclip/Save/Export với "Hoàn thành/Đang chạy") — cứng theo index.
- `placed/remaining`, `rotation/position`, chi tiết lỗi (expected/actual/delta), số sheet, duration lịch sử, nhiều MetricCard ("342", "12", "2h 46m", "Runs 8", "10/10"...).
- Thứ tự hàng chờ đang sort theo ngày, **sai** so với Tool.
- Nếu **bất kỳ** API lỗi → `getDashboardData` trả về **toàn bộ `mockData`** (cả trang thành giả, không cảnh báo).

→ Danh sách đầy đủ từng field: xem `repository-audit.md`. Ranh giới thật/giả theo trang: xem `tool-telemetry-gap.md`.

---

## I. Tầng 6 — Desktop (apps/desktop)

Electron. `main.cjs` mở `BrowserWindow` 1440×960 trỏ vào `ACRYLIC_WEB_URL` (mặc định `http://127.0.0.1:5173`), `contextIsolation:true`, link ngoài mở bằng trình duyệt hệ thống. Chỉ là vỏ bọc web thành app desktop, không có logic riêng.

---

## J. Vòng đời một ảnh — từ A đến Z (dữ liệu thực tế)

1. **Thả PNG** vào `Images`, đặt tên đúng quy ước, ví dụ `48211_item1_...-2-side-3in-ac_qty_5.png`.
2. **`npm start`** trong `Tool` (hôm nay chạy tay; web chưa bấm được).
3. Tool parse + sort + bung theo qty (5 bản) + normalize + phân tích pixel.
4. Với từng bản: Illustrator import → mask 30.48cm → trace lazer → check FRONT/BACK → scale → **pack** vào sheet. Mỗi bước ghi `progress.json` (Agent thấy state thô).
   - Check fail → chuyển đúng file đó sang `images_error`, dọn artifact, chạy tiếp file khác.
   - Không fit → giữ trong `Images`, đợi sheet mới.
5. Sheet đầy chỗ trên 3in → lưu `wait_{cap}.ai`; đầy hẳn → lưu `output_ai/thangM/ngay/Acrylic_d_m_NN.ai` rồi **export** FRONT.png + BACK.png (600 DPI) + LAZER.ai (AI8).
6. **Commit** sau save: nếu đặt 3/5 → `imgaes_done` cộng 3, file trong `Images` đổi thành `..._qty_2`. Xong hẳn (qty về 0) → xoá khỏi `Images`. `pending-commit.json` đảm bảo không mất/không đếm trùng nếu crash giữa chừng.
7. Suốt quá trình, mỗi 3s Agent chụp snapshot → SQLite → API → Web thấy: Images giảm, done tăng, output tăng, progress nhảy state.

Ai thấy gì: **người vận hành** nhìn folder giảm/tăng thật + state thô; **preview packing/tọa độ/bước mịn** thì Web *chưa* có dữ liệu thật (cần sửa runner — xem gap doc mục 4).

---

## K. Cách chạy (thứ tự & cổng)

- **Tool sản xuất:** `cd Tool && npm start` (hoặc `npm run check` / `error` / `debug` — xem codebase-memory.md). Chạy độc lập, không cần nền tảng.
- **Local Agent:** chạy nền, ghi `.platform-data/platform.sqlite`. Cần Node 22+ (dùng `node:sqlite`). Env NocoDB tuỳ chọn.
- **Control API:** cổng 4320, đọc cùng file SQLite. Phải chạy *sau/hoặc cùng* Agent để có snapshot.
- **Web:** Vite dev cổng 5173 (`VITE_ACRYLIC_API_BASE` mặc định `http://127.0.0.1:4320/api/v1`). Có sẵn `web/dist` đã build.
- **Desktop:** Electron mở `http://127.0.0.1:5173`.
- **NocoDB (tuỳ chọn):** đặt `NOCODB_BASE_URL, NOCODB_API_TOKEN, NOCODB_EVENTS_TABLE_ID, NOCODB_SNAPSHOTS_TABLE_ID` thì Agent mới đẩy.

Thứ tự khởi động hợp lý: Agent → Control API → Web (→ Desktop). Tool chạy riêng khi cần sản xuất.

---

## L. "Muốn sửa X thì vào đâu"

| Muốn sửa | File / hàm |
|---|---|
| Logic dàn/pack, mask, trace laser | `Tool/scripts/import-image.jsx` (`packImagesOnSheet`, `runCase`, `traceLazerSilhouette`) |
| Luồng sheet/wait/commit, sort hàng chờ | `Tool/src/index.ts` (`main`, `processQueue`, `updateDoneHistory`, `updateRemainingImage`) |
| Export FRONT/BACK/LAZER | `Tool/scripts/export-output-assets.jsx` |
| Lưu .ai | `Tool/scripts/save-ai.jsx` |
| Parse tên file (web) khớp Tool | `apps/web/src/api/client.ts:parseItemName` |
| Bỏ mock, map dữ liệu thật | `apps/web/src/api/repository.ts` |
| Thêm endpoint API | `apps/control-api/src/index.ts` |
| Cách Agent quan sát/telemetry | `apps/local-agent/src/index.ts` |
| Kiểu dữ liệu dùng chung | `packages/contracts/src/index.ts` |
| Bảng/DB | `packages/database/*` |
| Giao diện từng trang | `apps/web/src/pages/* + components/*` |

---

## M. Trạng thái hiện tại & việc tiếp theo (tóm tắt roadmap)

**Đã có, chạy thật:** toàn bộ Tool sản xuất; Agent quan sát folder + tiến trình + progress; SQLite lưu snapshot/event; Control API phục vụ đọc + SSE + preview ảnh; Web hiển thị KPI/danh sách/preview thật; Desktop bọc web.

**Chưa có / còn giả:** tầng lệnh (Start/Check/Export — chưa có POST, chưa có command worker); telemetry mịn từ Tool (id run/sheet/item, event JSONL, tọa độ packing) — mới là kiểu định nghĩa sẵn; nhiều field Web hard-code; WAL mode; bảng run/sheet/item; reconciliation khi khởi động; phân quyền; NocoDB tables.

**Thứ tự chậm–chắc đề xuất** (theo hợp đồng mục 10 + 2 doc gap/audit):
1. Làm sạch Web đọc-thật (sửa `parseItemName`, sort, bỏ mock, bỏ `catch→mockData` toàn cục, gắn nhãn nguồn) — **không đụng runner**.
2. Thêm append-JSONL telemetry tối thiểu + id trong Agent/Tool (có test, benchmark <3–5%).
3. Thêm command table + Local Agent command worker → mở nút Start/Check/Export.
4. Safe Pause/Resume, Retry, phân quyền, NocoDB — sau cùng.

---
---

# TARGET CONTRACT (N–AC)

## N. TARGET CONTRACT — trạng thái tối ưu cần đạt

Phần A–M phía trên mô tả hệ thống đang có hôm nay. Phần N trở đi là hợp đồng đích cần triển khai.

**Mục tiêu cuối:**

```text
Người dùng bấm Bắt đầu
→ Control API tạo command duy nhất
→ Local Agent kiểm tra runner + Illustrator
→ nếu Illustrator chưa mở thì mở Illustrator
→ đợi Illustrator sẵn sàng
→ spawn Tool đúng một lần
→ Tool phát progress/event
→ Local Agent chuẩn hoá + lưu SQLite
→ Control API đẩy SSE
→ Web tự cập nhật không cần refresh
→ save sheet thành công mới commit qty/done
→ output xuất tới đâu Web cập nhật tới đó
```

**Các nguyên tắc bắt buộc:**

- Tool vẫn là production engine và là thành phần duy nhất thay đổi tài liệu Illustrator.
- Web không gọi `cscript.exe`, không đọc/ghi `.ai`, không move/rename file.
- Local Agent là thành phần duy nhất được spawn Tool và thực thi command allowlist.
- Chỉ một production run được hoạt động trên một máy.
- Double-click, refresh hoặc gửi lại request không được tạo run thứ hai.
- Folder là sự thật vật lý; telemetry là sự thật quá trình; SQLite là index/lịch sử.
- Không được hiển thị mock như dữ liệu production thật.
- Runner phải tiếp tục chạy nếu Web, Control API, SQLite hoặc NocoDB tạm mất kết nối.
- NocoDB chỉ đồng bộ nền, không nằm trên critical path.
- Tất cả thao tác ảnh Done/Error/Remaining vẫn phải tuân theo `pending-commit.json`.

---

## O. Nguồn dữ liệu thật và trách nhiệm từng tầng

### O.1. Tool
**Chịu trách nhiệm:** Parse filename; Sort và chọn item; Mở wait/template; Điều khiển Illustrator; Check, packing, reclip, save; Quyết định wait/output; Commit qty sau save thành công; Move file lỗi; Export output; Ghi progress/event kỹ thuật.
**Không chịu trách nhiệm:** Auth; UI; SSE; NocoDB; Điều khiển nhiều máy.

### O.2. Local Agent
**Chịu trách nhiệm:** Giữ machineId, toolId; Tạo runId khi spawn Tool; Nắm PID process con; Process lock; Command queue; Kiểm tra/mở Illustrator; Đọc progress/event; Watch folder; Chuẩn hoá snapshot; Ghi SQLite; Reconciliation; Gửi event cho Control API.
**Không được:** Thay đổi logic packing; Tự commit qty; Tự chuyển ảnh Done trước Tool; Tự sửa file AI; Chạy hai command Illustrator đồng thời.

### O.3. Control API
**Chịu trách nhiệm:** Auth và quyền; Validate command; Idempotency; Đọc SQLite/snapshot; REST API; SSE; Audit người bấm lệnh.

### O.4. Web
**Chịu trách nhiệm:** Hiển thị trạng thái; Gửi command; Hiển thị độ mới/độ tin cậy của dữ liệu; Không tự suy luận các số production quan trọng nếu backend chưa có.

---

## P. Luồng bấm "Bắt đầu sản xuất"

### P.1. Endpoint

```http
POST /api/v1/commands
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "type": "START_PRODUCTION",
  "toolId": "acrylic",
  "machineId": "factory-windows-01"
}
```

Control API phải: Xác thực user; Kiểm tra quyền `production.start`; Kiểm tra Idempotency-Key; Tạo command record; Trả `202 Accepted`.

```json
{
  "commandId": "cmd_20260726_001",
  "status": "queued"
}
```

### P.2. Local Agent xử lý command

```text
queued → validating → checking_runner → checking_illustrator
→ launching_illustrator (nếu cần) → waiting_illustrator
→ starting_runner → running
```

Trạng thái thất bại: `rejected`, `failed`, `timed_out`, `cancelled`.

### P.3. Kiểm tra runner (trước khi Start)

Kiểm tra process lock; Kiểm tra PID runner đã giữ; Quét process Windows để phát hiện Tool chạy ngoài Agent; Kiểm tra `pending-commit.json`; Kiểm tra progress file mới. **Nếu có run thật đang chạy: không spawn thêm.**

Lỗi chuẩn: `RUN_ALREADY_ACTIVE`, `EXTERNAL_RUNNER_DETECTED`, `PENDING_COMMIT_RECOVERY_REQUIRED`, `TOOL_ROOT_NOT_FOUND`, `IMAGES_FOLDER_NOT_FOUND`, `TEMPLATE_NOT_FOUND`.

### P.4. Kiểm tra Illustrator

**Illustrator đang mở:** Không mở instance mới. Nếu không có runner/cscript đang chạy thì chuyển sang bước sẵn sàng. Có thể chạy readiness handshake nhẹ chỉ khi máy đang idle. Không ping COM/JSX liên tục khi production đang chạy.

**Illustrator chưa mở:** Dùng executable path đã cấu hình; Spawn Illustrator đúng một lần; Chờ process xuất hiện; Chờ thời gian warm-up cấu hình (10–30s); Handshake có timeout nếu đã triển khai; Sẵn sàng mới spawn Tool.

Lỗi chuẩn: `ILLUSTRATOR_PATH_INVALID`, `ILLUSTRATOR_START_FAILED`, `ILLUSTRATOR_READY_TIMEOUT`, `ILLUSTRATOR_NOT_RESPONDING`.

Web phải hiển thị tuần tự: Đang kiểm tra Tool → Đang kiểm tra Illustrator → Đang mở Illustrator → Đang chờ Illustrator sẵn sàng → Đang khởi động production → Đang chạy.

### P.5. Spawn Tool

Không chạy command tùy ý từ frontend. Agent dùng **allowlist**:

```text
START_PRODUCTION  → npm start
CHECK_IMAGES      → npm run check
RUN_ERROR_MODE    → npm run error       (Admin)
DEBUG_RUN         → npm run debug       (Developer)
DEBUG_LAZER       → npm run debug:lazer (Developer)
REEXPORT_OUTPUT   → npm run test:export -- <output-ai>
CHECK_WIDTH       → npm run check:width
```

Spawn bằng cấu hình cố định: `cwd = D:\FFactory\Arcylic\Tool`; Không nhận shell text từ Web; Ghi stdout/stderr theo runId; Giữ PID; Ghi heartbeat của Agent.

---

## Q. ID và state machine

### Q.1. ID

```text
machineId = factory-windows-01
toolId    = acrylic
runId     = acrylic_factory-windows-01_20260726_153012_<shortId>
sheetId   = <runId>_sheet_07
itemId    = <runId>_<sheetId>_<normalizedFilename>_qty_03
commandId = uuid
eventId   = uuid
```

**Không dùng filename đơn lẻ làm itemId.**

### Q.2. Runner state

```text
idle, validating, starting_illustrator, starting_runner, recovering,
running, pausing, paused, stopping, checkpoint, saving, exporting,
completed, error, offline
```

### Q.3. Command được phép

| Runner state | Command |
|---|---|
| idle | Start, Check, Check Width, Re-export |
| validating | Không nhận command production khác |
| starting_illustrator | Không nhận command khác |
| running | Safe Pause |
| pausing | Không nhận thêm |
| paused | Resume, Safe Stop |
| saving | Không nhận command khác |
| exporting | Không Start/Check |
| error | Retry/Re-export có điều kiện |

---

## R. Realtime telemetry tối ưu

### R.1. Hai loại file

**Snapshot** — `Tool\.runtime\live-state.json`: chỉ giữ trạng thái mới nhất; ghi temp file rồi atomic rename; dùng để Web reconnect nhanh.

**Event log** — `Tool\.runtime\events\2026-07-26.jsonl`: append-only; mỗi dòng một JSON; có `seq`; rotate theo ngày/kích thước; Local Agent lưu `lastSeq`.

### R.2. Event tối thiểu

```text
run.started, run.recovered, sheet.source_selected, sheet.opened,
batch.started, item.started, item.progress, item.check_failed,
item.no_fit, item.skipped, item.placed, batch.completed,
sheet.capacity_updated, sheet.save_started, sheet.saved_wait,
sheet.saved_output, commit.started, commit.completed,
output.export_started, output.export_completed, output.export_failed,
run.completed, run.failed
```

### R.3. Schema

```json
{
  "eventId": "uuid",
  "seq": 128,
  "occurredAt": "2026-07-26T15:30:12.350+07:00",
  "machineId": "factory-windows-01",
  "toolId": "acrylic",
  "runId": "run_xxx",
  "sheetId": "sheet_07",
  "itemId": "item_xxx_qty_03",
  "type": "item.placed",
  "payload": {
    "filename": "family_2side_3in_qty5.png",
    "qtyIndex": 3,
    "qtyTotal": 5,
    "placedProvisional": 3,
    "state": "DONE"
  }
}
```

### R.4. Tần suất

Tool ghi event tại ranh giới nghiệp vụ, không ghi từng vòng tìm packing. Agent đọc file nhanh nhưng batch SQLite write. SSE coalesce progress còn ~2–4 lần/giây. Folder watcher debounce 300–1000ms. Web không refetch toàn bộ khi đã nhận event nhỏ.

### R.5. Event write không được làm hỏng production

Telemetry best-effort: ghi event thất bại không làm Tool dừng; không thay đổi thứ tự logic; không chờ mạng; không chờ SQLite/NocoDB; có log cảnh báo local.

---

## S. Data truth, freshness và không hiển thị giả

Mỗi field quan trọng trên Web phải có metadata:

```ts
type DataField<T> = {
  value: T;
  source: "folder" | "progress" | "batch-result" | "telemetry" | "sqlite" | "derived";
  quality: "confirmed" | "provisional" | "stale" | "unknown";
  updatedAt: string;
};
```

Quy tắc UI: `confirmed` hiển thị bình thường; `provisional` thêm nhãn "Tạm tính"; `stale` thêm nhãn "Dữ liệu cũ"; `unknown` hiển thị "Chưa có dữ liệu", không bịa số.

Ví dụ:

```text
Thời gian: 18:42                 Trực tiếp
Đã đặt: 7                        Tạm tính
Đã xác nhận: 6                   Batch result
Còn fit: ≤ 4in                   Cập nhật cuối batch
Packing position: Chưa có dữ liệu
```

Xoá hành vi `API lỗi → trả toàn bộ mockData`. Thay bằng: `API lỗi → giữ dữ liệu thật gần nhất + banner mất kết nối`; field chưa có → empty/unknown state; mock chỉ bật ở `VITE_DEMO_MODE=true`.

---

## T. Mapping folder thật

### T.1. Images — Hàng chờ
Nguồn: `D:\FFactory\Arcylic\Images`. Web hiển thị: thumbnail, filename, parsed size/side/qty, priority, eligible với wait hiện tại, trạng thái, qty đã đặt tạm tính/xác nhận, qty còn lại.
Sort phải dùng chung hàm/contract với Tool: **size giảm dần → qty giảm dần → natural filename tăng dần.**
Agent watch: `add` → item xuất hiện; `change` → cập nhật qty/mtime; `unlink` → đánh dấu đã move/remove, không xoá history.

### T.2. Images Error — Ảnh lỗi
Nguồn: `D:\FFactory\Arcylic\images_error`. Web chỉ xác nhận: file đang tồn tại, thumbnail, filename, size/side/qty parse được, modified time.
Chi tiết lỗi lấy từ telemetry/batch report: error code, step, expected, actual, delta, run, sheet, occurred time.
Nếu có file trong images_error nhưng không có error event → "File lỗi đã phát hiện / Nguyên nhân: Chưa có telemetry". **Không hard-code expected/actual.**

### T.3. Done theo tháng/ngày
Tên folder Done phải là cấu hình `DONE_ROOT`. Default theo code hiện tại vẫn là `D:\FFactory\Arcylic\imgaes_done`. UI gọi là "Đã xong". Không tự rename folder production đang dùng.
Đích target theo ngày: `<DONE_ROOT>\thang{M}\{D}-{M}-{YY}`. Ví dụ 07/07/2026 → `D:\FFactory\Arcylic\imgaes_done\thang7\7-7-26`. **Không zero-pad** (`thang7`, `7-7-26`).
Agent phải hỗ trợ: file Done legacy nằm thẳng ở root + file Done mới theo tháng/ngày; không tự move legacy. Trang Đã xong group theo ngày, filter tháng/ngày, tổng qty hoàn thành trong ngày, source group và partial qty.
Nếu muốn đổi tên vật lý `imgaes_done` → `images_done`: làm migration riêng, **không** đổi trong cùng PR telemetry.

### T.4. Wait
Nguồn: `D:\FFactory\Arcylic\wait`. Parse: `wait_4.ai` → cap 4in; `wait_8.ai` → cap 8in. Web hiển thị: tên wait, cap, file size, modified time, đang mở/không, sheet liên quan, số item đã commit nếu telemetry có, còn fit xác nhận gần nhất.

### T.5. Output
Nguồn: `output_ai`, `output_front`, `output_back`, `output_lazer`. Agent gom theo canonical output key, không chỉ so chuỗi tùy ý.
Một output group:
```text
Acrylic_26_7_01
├── AI
├── FRONT PNG 600 DPI
├── BACK PNG 600 DPI (nếu cần)
└── LAZER AI8
```
Trạng thái: `ai_saved`, `front_exported`, `back_exported`, `lazer_exported`, `partial`, `export_failed`, `complete`.

---

## U. Trang Sheets — hiển thị đúng từ trong ra ngoài

### U.1. Nguồn sheet
Card "Nguồn sheet": Loại (WAIT/TEMPLATE); Tên (`wait_4.ai`/`Template_UVDTF.ai`); Path; Cap; Opened at; Run ID; Sheet ID.
Quy tắc: có wait phù hợp → sourceType=wait; không có → sourceType=template. Không suy luận source bằng UI; Agent/Tool phải phát `sheet.source_selected`.

### U.2. Item đang được đặt
Card "Đang đặt ảnh": thumbnail nguồn, filename, size, side, qty index/total, state thô hoặc step mịn, đã đặt provisional/confirmed, layer đang xử lý nếu telemetry có, thời gian từ khi item bắt đầu.

### U.3. Đang đặt vào đâu
**Chưa có packing telemetry:** hiển thị "Sheet 07 / Đang đặt item 63/90 / Vị trí: Chưa có dữ liệu / Góc xoay: Chưa có dữ liệu". **Không vẽ lưới giả.**
**Đã có packing telemetry:** event `item.placed` kèm `xCm, yCm, widthCm, heightCm, rotationDeg, borderPath[]`. Web vẽ: sheet 30.48cm; border item đã commit; item provisional khác màu; item hiện tại viền cyan; hover hiện filename/qty. Không export screenshot Illustrator để cập nhật liên tục.

### U.4. Trạng thái sheet
Web hiển thị: placed provisional; placed confirmed; checkpoint limit; `remainingFitCapInch`; dữ liệu cap cập nhật lúc nào; quyết định dự kiến wait/output; quyết định đã xác nhận sau batch; save state; commit state; export state.
Nếu `remainingFitCapInch` chỉ có cuối batch: "Còn fit: ≤ 4in / Cập nhật cuối batch lúc 15:42:18". Không animate số giả theo từng item.

---

## V. Vòng đời dữ liệu thực tế khi chạy xong

### V.1. Placement chưa save
`placement = provisional/staged`; `done = false`; `qty commit = 0`. Web có thể hiển thị item trên sheet bằng màu tạm tính.

### V.2. Save sheet thành công
```text
sheet.save_started → saveAiWithRetry → sheet.saved_wait|saved_output
→ pending-commit.json → commitProcessedImages → commit.completed
```
Chỉ sau `commit.completed`: Done tăng; Images giảm/rename qty; placement thành confirmed.

### V.3. Qty đặt một phần
qty yêu cầu=5, đặt được=3, còn lại=2. Sau save: Done ngày cộng 3; file Images đổi qty còn 2; `sourceGroupId` giữ liên kết. Web hiển thị "Đã hoàn thành 3 — Còn Images 2".

### V.4. Qty hoàn thành hết
Sau save: record Done ghi theo ngày; PNG gốc không còn trong Images; item status `completed`. Web cập nhật qua folder event + commit event.

### V.5. Check fail
Tool: chỉ move đúng file lỗi sang images_error; không ảnh hưởng item khác; phát `item.check_failed`. Web: Images giảm, Error tăng, trang Error xuất hiện file; nếu event đầy đủ thì hiện nguyên nhân.

### V.6. Không fit
File vẫn ở Images; không tăng Done; không chuyển Error; item status `waiting_next_sheet`. Sheet quyết định save wait/output theo logic Tool.

### V.7. Export lỗi sau commit
Vì commit xảy ra trước export: item vẫn Done; không đặt lại item; output group đánh dấu partial/export_failed; cho phép Admin chạy `REEXPORT_OUTPUT`.

---

## W. Reconciliation khi Agent/App khởi động

Thứ tự: đọc process lock/PID → đọc `pending-commit.json` → đọc `live-state.json` → đọc event từ `lastSeq` → quét Images/Error/Done/Wait/Output → đọc SQLite → so sánh physical state và history → tạo reconciliation report. **Không tự move/delete trong reconciliation.**

Ưu tiên: save/commit marker → file vật lý → batch result → telemetry → SQLite cache → UI derived data.

Nếu chênh lệch: banner trên Web; ghi audit event; yêu cầu người có quyền xử lý nếu cần mutation.

---

## X. API đích

### X.1. Read
```text
GET /api/v1/status
GET /api/v1/dashboard
GET /api/v1/queue
GET /api/v1/sheets
GET /api/v1/sheets/:id
GET /api/v1/done?month=7&date=7-7-26
GET /api/v1/errors
GET /api/v1/outputs
GET /api/v1/history/runs
GET /api/v1/history/runs/:id
GET /api/v1/settings
GET /api/v1/events
```

### X.2. Command
```text
POST /api/v1/commands
GET  /api/v1/commands/:id
```
Không tạo endpoint shell tổng quát.

### X.3. SSE
Hỗ trợ: Last-Event-ID; heartbeat; reconnect; snapshot event ngay khi connect; incremental event sau snapshot.
Web reconnect: giữ dữ liệu thật gần nhất; hiện banner "Đang kết nối lại"; lấy snapshot mới; tiếp tục từ event ID.

---

## Y. SQLite target

SQLite vẫn chỉ là một file local, không cần database server. Thêm bảng: `commands, runs, sheets, items, placements, item_errors, outputs, folder_entries, platform_events, agent_snapshots, sync_outbox, agent_state`.

Bắt buộc:
```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

Không ghi SQLite trực tiếp trong JSX. Tool ghi file telemetry local; Agent mới ghi SQLite. Nếu SQLite lỗi: event vẫn nằm JSONL; runner vẫn chạy; Agent retry/rebuild index sau.

---

## Z. Hiệu năng và bảo vệ Illustrator

**Không được:** chụp screenshot Illustrator mỗi item; đọc `.ai` đang save; export preview sau mỗi placement; quét recursive toàn bộ folder mỗi 100ms; ping COM/JSX trong lúc production; render toàn bộ log không virtualization; gửi telemetry qua mạng trực tiếp từ Tool.

**Nên:** folder watcher + reconciliation scan định kỳ chậm hơn; thumbnail cache; preview bằng file nguồn/output; packing preview bằng tọa độ, không bằng screenshot; SQLite batch write; SSE coalesce; Web render theo event nhỏ.

**Benchmark:** Tool cũ; Tool + telemetry; Tool + Agent; Tool + Agent + Web; Tool + packing preview.
**Điều kiện đạt:** không có lỗi Illustrator mới; không duplicate run/qty; không mất commit; Web đóng Runner vẫn chạy; NocoDB mất mạng Runner vẫn chạy; chênh lệch thời gian mục tiêu **< 3–5%**.

---

## AA. UX theo từng trang — dữ liệu thật bắt buộc

**Tổng quan:** runner state; illustrator state; command state; current AI; source wait/template; current item; timer Agent tính; queue/error/done/output count; sheet placed provisional/confirmed; remaining fit có freshness label.

**Hàng chờ:** chỉ file thật trong Images; sort giống Tool; preview thật; parse thật; current item highlight; không hard-code placed/remaining.

**Sheets:** source wait/template thật; item đang đặt thật; state thô trước, step mịn khi có telemetry; không dùng lưới packing giả; tọa độ chỉ hiện khi Runner phát thật; save/commit/export state tách riêng.

**Đã xong:** đọc Done theo `thangM\D-M-YY`; hỗ trợ legacy root; group theo ngày; partial qty; sheet/output liên quan từ SQLite/event.

**Ảnh lỗi:** file thật từ images_error; error reason từ event/report; không có event thì ghi Unknown; Retry/Về Images chỉ mở sau command worker và quyền.

**Thành phẩm:** file thật từ bốn output folder; group canonical base; preview PNG; trạng thái partial/error/complete; re-export không đặt lại item.

**Lịch sử:** run/sheet/item/event từ SQLite; không dùng snapshot giả làm run nếu chưa map; có data quality.

**Cấu hình:** folder path; illustrator path/status; tool root; done format; timeout; agent interval; SSE interval; NocoDB; quyền.

---

## AB. Lộ trình triển khai tối ưu

**Phase A0 — làm sạch dữ liệu Web:** bỏ global fallback sang mock; sửa parser/sort giống Tool; thêm quality/source/updatedAt; folder data thật; Done group theo date folder; Sheet không vẽ giả.

**Phase A1 — command Start an toàn:** commands table; idempotency; process lock; Agent command worker; check/start Illustrator; spawn Tool; PID/heartbeat; SSE command status.

**Phase A2 — telemetry tối thiểu:** live-state snapshot; append-only JSONL; run/sheet/item IDs; state thô không bị mất; save/commit/export events.

**Phase A3 — Check và Re-export:** CHECK_IMAGES; CHECK_WIDTH; REEXPORT_OUTPUT; không chạy đồng thời với production.

**Phase B — telemetry mịn:** Import/Check/Packing/Reclip; packing coordinates; rotation/bounds; remaining fit theo cadence đã benchmark.

**Phase C — điều khiển nâng cao:** Safe Pause; Resume; Safe Stop; Retry; Return to Images; Auth/roles; NocoDB reporting.

---

## AC. Acceptance checklist

Chỉ coi là hoàn thành khi:

1. Bấm Start khi Tool đang chạy không tạo process thứ hai.
2. Bấm Start hai lần chỉ tạo một command/run.
3. Illustrator đóng thì Agent mở và đợi sẵn sàng.
4. Illustrator đã mở thì không mở instance mới.
5. Web tự cập nhật khi Tool chạy, không refresh.
6. Web đóng không ảnh hưởng Tool.
7. Images hiển thị queue thật và sort đúng.
8. Error hiển thị file thật, không bịa reason.
9. Done hiển thị đúng `thangM\D-M-YY`.
10. Legacy Done vẫn đọc được.
11. Sheet hiển thị nguồn wait/template thật.
12. Item hiện tại được highlight.
13. Không vẽ position/rotation giả.
14. Save thành công mới tăng Done.
15. Partial qty hiển thị đúng.
16. Export fail không đặt lại item.
17. Re-export bị chặn nếu run đang bận.
18. SQLite lỗi không làm Runner dừng.
19. NocoDB lỗi không làm Runner dừng.
20. Benchmark không vượt ngân sách hiệu năng đã chốt.

---

## AD. Ghi chú kỹ thuật khi giao Codex (code-grounded caveats)

Những điểm dưới đây bám code thật, cần chốt để tránh vướng khi triển khai:

1. **Phase A0 hoàn toàn thuần web, không đụng runner.** Agent đã `scanFolder` đệ quy và trả `relativePath` cho mỗi file → Done group theo `thangM\D-M-YY` parse được ngay từ `relativePath`. Sort/parser/`DataField<T>`/bỏ `catch→mockData` đều nằm trong `apps/web/src/api/repository.ts` + `client.ts`.
2. **Vòng đời Illustrator (A1) phải chốt trước.** Tool hiện **tự mở** (`warmIllustrator`) và **tự quit** sau save output (`QUIT_ILLUSTRATOR_AFTER_SAVE=true`; `export-output-assets.jsx` gọi `app.quit()`). VBS dùng `GetObject` trước rồi `CreateObject`, nên Agent mở Illustrator trước → Tool attach lại là **tương thích sẵn**. Nhưng phải quyết: Tool có còn quit cuối run không (ảnh hưởng indicator "Illustrator connected" và mô hình readiness).
3. **runId injection.** Agent sinh `runId`, truyền vào Tool bằng **env `ACRYLIC_RUN_ID`** (Tool hiện chưa đọc — thêm ở A2, thay đổi nhỏ, an toàn). `sheetId = runId + sheetIndex` (Tool có sheetIndex); `itemId` cần kèm `qtyIndex` (Tool có `CODEX_QTY_INDEX`).
4. **Tách Phase A2 làm hai:** A2a — event cấp run/sheet/commit/export ghi ở `src/index.ts` (Node, có `fs`, append JSONL dễ, **không đụng packing**) làm trước; A2b — event cấp item (`item.placed`, tọa độ) trong `import-image.jsx` (ExtendScript, sát logic pack) làm sau + benchmark.
5. **Single-run detection đã có primitive:** Agent scan process `node ...Tool...src/index.ts` → dùng cho `EXTERNAL_RUNNER_DETECTED`; `pending-commit.json` tồn tại → `PENDING_COMMIT_RECOVERY_REQUIRED`.

---

## Lệnh giao Codex (khuyến nghị)

> Đọc phần A–M để hiểu hiện trạng và phần N–AD làm TARGET CONTRACT. Đọc kèm `repository-audit.md` (danh sách field chính xác cần thay) và `tool-telemetry-gap.md`.
> **Thực hiện Phase A0 trước:** bỏ dữ liệu mock (mock chỉ bật sau `VITE_DEMO_MODE=true`, không còn fallback mặc định); sửa `parseItemName` + sort khớp Tool; thêm `DataField<T>` (source/quality/updatedAt) và hiển thị nguồn/độ tin cậy; chỗ nào chưa có nguồn thì render "Chưa có dữ liệu", **tuyệt đối không suy số**; nhóm Done theo `thangM\D-M-YY`; bỏ packing grid giả.
> **Sau khi test xong mới sang Phase A1:** command Start an toàn, kiểm tra/mở Illustrator, process lock, idempotency, PID/heartbeat, SSE command status.
> **Không** sửa logic packing hoặc commit qty trong cùng phase A0/A1.

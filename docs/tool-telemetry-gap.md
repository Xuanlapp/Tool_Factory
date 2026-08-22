# Tool ↔ Web Telemetry Gap

> Bản đồ khoảng cách giữa **những gì giao diện cần** và **những gì Tool thực sự phát ra hôm nay**.
> Mục đích: biết chính xác giới hạn của Giai đoạn A (chỉ đọc, chưa sửa Runner) và danh sách runner-change cho Giai đoạn B.
> Đọc kèm: `docs/tool-web-contract.md`, `docs/runner-mapping.md`, `docs/repository-audit.md`.
> Nguyên tắc bất biến: **không sửa logic Illustrator/packing chỉ để phục vụ giao diện** (hợp đồng mục 1.8).

---

## 0. Bảng phân loại độ tin cậy

| Nhãn | Ý nghĩa | Được phép hiển thị như production? |
|---|---|---|
| **REAL** | Đọc trực tiếp từ Tool/folder/`.runtime` | Có |
| **DERIVED** | Agent tính từ dữ liệu thật (đếm event, gom filename) | Có, nếu ghi rõ cách tính |
| **ESTIMATED** | Ước tính, có thể chưa chính xác tại thời điểm hiển thị | Có, kèm nhãn "tạm tính / cập nhật sau" |
| **MOCK** | Đang bịa để dựng UI | **Không** — phải có nhãn rõ trong code & UI |
| **MISSING** | Chưa có nguồn dữ liệu nào | Không hiển thị số thật, để trống hoặc "—" |

---

## 1. Sự thật nền tảng về telemetry hiện tại của Tool

Trước khi đọc bảng, ghi nhớ 6 sự thật quyết định mọi phân loại bên dưới:

1. **Chỉ có MỘT file progress bị ghi đè.** `import-image.jsx > writeProgress(index, total, state, imageBaseName, message)` ghi vào `.runtime/sheet{n}_..._batch_{i}.progress.json`. Node (`src/index.ts > runCommandWithProgress`) poll **350ms/lần**. Vì ghi đè (không append) → **poll chậm hơn tốc độ đổi bước sẽ SÓT bước**.
2. **State thô.** Chỉ có: `START_BATCH, DOING, SKIP, NO_FIT, CHECK_COMPARE_FALSE, CHECK_COMPARE_TRUE, DONE, ERROR, DONE_BATCH`. Không có bước mịn (Import LAZER / Check / Reclip / Save) ở mức telemetry.
3. **Batch ≈ Sheet.** `JSX_BATCH_SIZE = CHECKPOINT_ITEM_LIMIT` (mặc định **90**) ở chế độ chạy thường. Nên batch-result JSON (`writeBatchRunResult` → `results[]`, `remainingFitCapInch`, `reports`) chỉ ghi **~1 lần mỗi sheet**.
4. **Không có ID ổn định.** Tool không sinh `runId/sheetId/itemId` (dù `runner-mapping.md` yêu cầu). Phải do **Local Agent sinh**.
5. **Không có tọa độ packing.** `packImagesOnSheet` tính x/y/rotation trong Illustrator nhưng **không serialize** ra bất kỳ file nào.
6. **Không có event stream, không PID/heartbeat.** Không tồn tại `.runtime/events/*.jsonl`. Sống/chết của runner do Agent nắm (Agent spawn tiến trình).

**Nguồn REAL đọc-được-ngay hôm nay:** folder (`Images, wait, images_error, imgaes_done, output_ai/front/back/lazer`), `progress.json` (state thô + item hiện tại), batch-result JSON (placed chính xác + remainingFitCap, theo sheet), `pending-commit.json` (transaction commit dở), hậu tố qty trên tên file.

---

## 2. Bảng gap theo trang

Cột: **Field** · **Nguồn hiện tại** · **Phân loại** · **Tần suất thật** · **Tool đã phát?** · **Cần sửa (file/hàm)** · **Rủi ro** · **Fallback**

### Tổng quan (Overview)

| Field | Nguồn hiện tại | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Thời gian chạy | Agent (now − run start) | REAL | Real-time | Không cần | — | Sai nếu Agent không ghi mốc start | Ẩn nếu chưa có start |
| Runner status | `/status` snapshot | REAL | SSE | Có (Agent) | — | offline nếu Agent chết | "offline" |
| Illustrator connected | snapshot | REAL | SSE | Có | — | — | false |
| File đang xử lý | `progress.imageBaseName` | REAL | ~350ms | Có | — | Sót nếu poll chậm | currentFile output |
| Bước hiện tại (Check/Pack/Reclip/Save) | — | **MISSING** | — | **Chưa** | `import-image.jsx` (thêm writeProgress mịn) | Hiện bước sai nếu suy đoán | Chỉ hiện state thô |
| Sheet 63/90 | `progress.index/total` | DERIVED | ~350ms | Một phần | — | total là số unit trong batch, không phải "sheet 63/90" thật | KPI đếm folder |
| Số lỗi | đếm `images_error` + error state | DERIVED | debounce | Một phần | — | trộn lỗi cũ/mới (xem audit) | count folder |
| Wait đang mở | file `wait_*.ai` | REAL | watcher | Có | — | — | "—" |
| Output mới nhất | `output_ai` mtime | REAL | watcher | Có | — | — | "—" |

### Hàng chờ (Queue)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Danh sách ảnh | folder `Images` | REAL | watcher | Có | — | — | rỗng |
| size / side / qty | parse filename | DERIVED | watcher | Có | `client.ts:parseItemName` (khớp lại luật Tool) | parseItemName lệch Tool (xem audit) | default an toàn |
| **Thứ tự (priority)** | `byDateDesc` | **MOCK** (sai luật) | — | Có (luật ở Tool) | `repository.ts:mapQueue` | Thứ tự hiển thị KHÁC thứ tự chạy thật | sort theo luật Tool |
| Đã đặt (placed) | `index` | **MOCK** | — | Một phần | thay bằng đếm DONE + result | Hiểu nhầm tiến độ | "tạm tính" / "—" |
| Còn lại (remaining) | qty − mock placed | **MOCK** | — | REAL sau commit (qty suffix) | dùng qty-suffix + result | Sai số | qty gốc |
| pixelSize / dpi | hard-code `2362×2362`, `300` | **MOCK** | — | REAL (đo được bằng Pillow) | Agent đo hoặc bỏ | Nhìn như thật | ẩn |

### Sheets

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Item trên sheet | `queue.slice(0,6)` | **MOCK** | — | Một phần | dùng progress/result thật | Không phải item thật trên sheet | chỉ hiện item đang xử lý |
| turn (3/5) | mock placed | **MOCK/ESTIMATED** | — | Một phần | đếm DONE theo item | Sai | "tạm tính" |
| **rotation / X / Y** | hard-code | **MOCK** | — | **Chưa** (không serialize) | `import-image.jsx` (xuất tọa độ sau pack) | Preview packing giả | **Không vẽ preview thật** |
| placed / total | `progress.index/total` | DERIVED | ~350ms | Một phần | — | total=unit trong batch | KPI |
| fitCapInch / remainingFitInch | hard-code `4` / `3` | **MOCK** | — | REAL theo batch | dùng `remainingFitCapInch` từ result | Con số nhảy giả | "cập nhật sau batch" |
| currentWaitFile | `wait_*.ai` | REAL | watcher | Có | — | — | "—" |
| waitDecision | hard-code chuỗi | **MOCK** | — | DERIVED được (từ cap vs ngưỡng 3in) | tính từ `shouldKeepAsWait` logic | Quyết định giả | ẩn |

### Đã xong (Done)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Danh sách | folder `imgaes_done` | REAL | watcher | Có | — | — | rỗng |
| requestedQty / placedQty | filename + `partial=index===2` | REAL + **MOCK** | — | REAL (qty suffix cộng dồn) | `mapDone` bỏ mock partial | Partial giả | đọc qty suffix |
| sheet số | hard-code `7-(index%3)` | **MOCK** | — | — | — | Sai | ẩn |
| status complete/partial | mock | **MOCK** | — | DERIVED (so requested vs done) | so qty | Sai | "complete" nếu đủ |
| outputs `[AI,FRONT,BACK,LAZER]` | hard-code | **MOCK** | — | REAL (kiểm tra file output tồn tại) | đối chiếu `output_*` | Báo đủ bộ khi chưa đủ | check file thật |

### Ảnh lỗi (Errors)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Danh sách file lỗi | folder `images_error` | REAL | watcher | Có | — | — | rỗng |
| **step / reason / expected / actual / delta** | hard-code theo `index%4` | **MOCK** | — | Một phần (message thật có ở result: `CHECK_IMAGE_WIDTH_FALSE`, `CHECK_COMPARE_FALSE`, `NO_FIT...`) | Agent bắt message + ghi SQLite | Bịa lý do lỗi — nguy hiểm nhất về niềm tin | chỉ hiện "lỗi, chưa rõ bước" |
| sheet / runId | hard-code | **MOCK** | — | MISSING (chưa có id) | Agent sinh id | Sai truy vết | ẩn |
| lỗi cũ vs mới | mtime | **MISSING** | — | Chưa | SQLite lưu lần đầu thấy | Nhầm lỗi cũ là mới | "—" |

### Thành phẩm (Outputs)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Gom nhóm theo base name | `output_ai` + find includes(base) | **REAL/DERIVED** ✅ | watcher | Có | — | — | — |
| asset status exported/processing | file tồn tại? | DERIVED ✅ | watcher | Có | — | — | processing |
| **format "Illustrator 8" cho AI** | hard-code | **MOCK (sai)** | — | REAL | `mapOutputs` | output_ai KHÔNG phải AI8 (chỉ LAZER là AI8) | đọc thật/bỏ |
| sheet label | hard-code `7-(index%4)` | **MOCK** | — | REAL (parse NN từ `Acrylic_d_m_NN`) | parse filename | Sai số sheet | parse NN |
| date/size/time | file metadata | REAL | watcher | Có | — | — | "—" |

### Lịch sử (History)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| runId | `event.runId ?? '#128'` | **MOCK** fallback | — | MISSING | Agent sinh + SQLite | Trộn run | ẩn |
| duration / sheets / items | `18+index`, `1+index%7`, `24+index*3` | **MOCK** | — | DERIVED được từ SQLite | ghi SQLite trong run | Số giả hoàn toàn | "—" |
| timeline | `/history/events` | REAL (nếu có event) | — | Chưa (chưa có event thật) | Agent → SQLite | rỗng → về mock | mockData.history |
| status running/failed/completed | `index%4` | **MOCK** | — | DERIVED | từ run record | Sai trạng thái | ẩn |

### Cấu hình (Settings)

| Field | Nguồn | Phân loại | Tần suất | Tool phát? | Cần sửa | Rủi ro | Fallback |
|---|---|---|---|---|---|---|---|
| Folders + số file | snapshot.folders | REAL | snapshot | Có (Agent) | — | — | mock |
| **valid: true** | hard-code | **MOCK** | — | DERIVED (Agent validate tồn tại/quyền) | `mapSettings` | Báo hợp lệ khi chưa kiểm | "chưa kiểm" |
| writable | heuristic tên | ESTIMATED | — | DERIVED | thử ghi thật | Sai quyền | ẩn |
| **sqlite: 'healthy'** | hard-code | **MOCK** | — | REAL (ping db) | Agent | Báo khỏe khi lỗi | "unknown" |
| illustrator | snapshot | REAL | snapshot | Có | — | — | offline |

---

## 3. UI phải thể hiện độ tin cậy (không hiển thị mọi field như nhau)

Ba mức, gắn với phân loại ở trên:

- **Thời gian** → `18:42 • Trực tiếp` (REAL, real-time).
- **Đã đặt** → ba nhãn theo vòng đời:
  - đang chạy (đếm từ progress): `Đã đặt (tạm tính): 7 · Chưa xác nhận` (ESTIMATED)
  - sau batch-result: `Đã đặt: 7 · Đã xác nhận` (REAL)
  - sau save AI thành công: `Đã commit: 7` (REAL, đã ghi `imgaes_done`)
- **Khoảng trống còn fit** → `Còn fit: ≤ 4in · Cập nhật sau batch` (REAL nhưng theo sheet). **Không cho con số này nhảy giả theo từng item.**

Quy tắc chung: mọi field ESTIMATED/DERIVED phải kèm `updatedAt` và (với packing) `asOfPlacement`. Mọi field MOCK phải có nhãn nhìn thấy được, **không được trông giống production**.

---

## 4. Telemetry tối thiểu (GIAI ĐOẠN B — sau audit, có test)

> Chưa làm ở Giai đoạn A. Ghi ở đây làm khuôn. Bản đầu **chỉ cần append JSONL**, chưa cần bước mịn, chưa cần tọa độ packing.

**Schema event (append-only `.runtime/events/<runId>.jsonl`):**

```json
{
  "seq": 128,
  "timestamp": "2026-07-26T15:30:12.350+07:00",
  "runId": "run_20260726_001",
  "sheetId": "run_20260726_001_sheet_07",
  "itemId": "run_20260726_001_sheet_07_christmas_qty_1",
  "type": "item_done",
  "state": "DONE",
  "placedCount": 7,
  "confirmed": false
}
```

**Tập event tối thiểu:** `run_started, sheet_opened, item_started, item_done, item_no_fit, item_skipped, item_check_failed, batch_completed, sheet_save_started, sheet_saved, commit_completed, export_started, export_completed, export_failed, run_finished, run_failed`.

**Điểm chèn đề xuất (giữ nguyên logic packing):**

- `import-image.jsx`: đầu `runCase` → `item_started`; check fail → `item_check_failed`; pack xong → `item_done`; không fit → `item_no_fit`; skip → `item_skipped`; cuối `runBatch` → `batch_completed`.
- `src/index.ts`: Agent/runner khởi động → `run_started`; mở template/wait (đầu vòng while) → `sheet_opened`; trước `saveAiWithRetry` → `sheet_save_started`; save OK → `sheet_saved`; sau `commitProcessedImages()` → `commit_completed`; trước/sau `exportOutputAssets()` → `export_started/completed/failed`; `main().catch` → `run_failed`.

**ID do Agent sinh** (không cần Tool): `runId` = một lần `npm start`; `sheetId` = runId + chỉ số sheet; `itemId` = runId + sheetId + imageBaseName + **qtyIndex** (bắt buộc có qtyIndex vì imageBaseName không unique giữa các bản copy).

---

## 5. remaining fit — triển khai theo cấp (không tính sau mọi item ngay)

`estimateRemainingFitCapInch` có thể nặng. Không gọi sau mỗi `runCase` vội.

1. Bản đầu: capacity cập nhật **cuối batch** (như hiện tại).
2. Benchmark thời gian estimator (đo riêng).
3. Nhẹ → cập nhật mỗi item. Nặng → mỗi 5–10 item.
4. UI luôn hiện `updatedAt` + `asOfPlacement`.

Tọa độ/rotation packing để **giai đoạn sau** (cần serialize dữ liệu từ Illustrator).

---

## 6. Điều kiện an toàn của telemetry (best-effort, không được làm Runner dừng)

- Ghi event lỗi **không** được throw làm dừng Runner (bọc try/catch, nuốt lỗi).
- **Không** đổi kết quả packing, **không** đổi thứ tự xử lý.
- `seq` tăng dần; file **append-only**; snapshot ghi qua **temp + rename**.
- Có **rotate/giới hạn** kích thước file event.
- Agent đọc lại từ `lastSeq`; restart **không tạo trùng** event đã commit (idempotent theo seq).
- Web đóng → Runner vẫn chạy.
- Mục tiêu benchmark: chênh lệch thời gian so với Tool gốc **< 3–5%**. Nếu vượt → giảm tần suất preview/batch event.

---

## 7. Kết luận Giai đoạn A

Đọc-được-thật-ngay: **thời gian, runner/illustrator status, file đang xử lý (state thô), danh sách folder (queue/wait/error/done/output), gom nhóm output, KPI đếm folder, placed chính xác theo sheet, remainingFitCap theo sheet.**

**Không** làm được ở Giai đoạn A (phải chạm Runner): bước mịn per-item, tọa độ/rotation packing, id ổn định, history/duration thật, remaining fit nhích theo item, lý do lỗi chi tiết.

Ranh giới: Giai đoạn A **chỉ đọc**, mọi field MOCK phải gắn nhãn. Sang Giai đoạn B mới thêm append-JSONL theo mục 4–6, có test và benchmark.

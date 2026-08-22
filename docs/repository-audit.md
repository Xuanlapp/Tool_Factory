# Audit `apps/web/src/api/repository.ts`

> Đánh giá từng field trong lớp repository của Web, gán nhãn nguồn dữ liệu theo `docs/tool-telemetry-gap.md` (REAL / DERIVED / ESTIMATED / MOCK / MISSING).
> Kết luận cốt lõi: **web đang trộn dữ liệu thật với số bịa, và một endpoint lỗi là toàn bộ UI âm thầm biến thành mock.** Trước khi mở nút điều khiển phải làm sạch chỗ này.
> Tham chiếu code Tool: `src/index.ts`, `scripts/import-image.jsx`, `scripts/save-ai.jsx`, `scripts/export-output-assets.jsx`.

---

## 0. Sáu phát hiện nghiêm trọng nhất (ưu tiên xử lý)

1. **`getDashboardData()` — `catch { return mockData }`**: bất kỳ 1 trong 8 endpoint fail → **toàn bộ dashboard thành mock**, không có cảnh báo. Người dùng tưởng đang xem production. Phải: bắt lỗi từng endpoint, giữ phần REAL, đánh dấu phần thiếu, và set `source:'mock'` hiển thị rõ trên UI.
2. **`mapQueue` sort sai luật Tool**: dùng `byDateDesc` (theo mtime). Tool sort *size giảm → qty giảm → tên tự nhiên* (`src/index.ts > processQueue`). Thứ tự hàng chờ trên web **không phải** thứ tự chạy thật.
3. **`placed`/`remaining` bịa theo `index`** trong `mapQueue` và `mapDone`: `index===0 ? qty-2 : ...`. Không liên quan gì tới run thật.
4. **`rotation`/`position` hard-code** trong `mapSheet`: preview packing đang là giả — Tool không hề serialize tọa độ.
5. **Chi tiết lỗi bịa** trong `mapErrors`: `step`, `reason`, `expected`, `actual`, `delta` gán cứng theo `index%4`. Đây là chỗ nguy hiểm nhất về niềm tin (bịa nguyên nhân lỗi sản xuất).
6. **`parseItemName` (client.ts) lệch luật Tool**: default size = `3` (Tool = 0), thiếu ràng buộc biên `(?:^|[-_])...(?:[-_.]|$)`, side chỉ bắt 1 chữ số và bỏ qua `badge-reel` (Tool ép badge-reel = 1 side).

---

## 1. `parseItemName` — client.ts:31

| Field | Web hiện tại | Tool | Nhãn | Ghi chú |
|---|---|---|---|---|
| sizeInch | `/(\d+(?:-\d+)?)in/i`, default **3** | `parseItemSizeInch`: `(?:^|[-_])(\d+(?:-\d+)?)in(?:[-_.]|$)`, default **0** | DERIVED (lệch) | Thiếu biên → có thể bắt nhầm; default khác nhau |
| qty | `/qty_(\d+)/i`, default 1 | `(?:^|[-_])qty_(\d+)(?:[-_.]|$)` | DERIVED (gần đúng) | OK phần lớn |
| side | `(\d)-side` → '1 side' / 'Lazer' / '2 side' | `parseSideCount` numeric, badge-reel→1 | DERIVED (lệch) | Bỏ qua badge-reel; không trả số side thật |

**Hành động:** đồng bộ regex + default + xử lý badge-reel với `src/index.ts`. Đây là nền của mọi field size/side/qty nên phải sửa trước.

---

## 2. `mapQueue` — repository.ts:12

| Field | Nguồn | Nhãn | Nguồn thật thay thế |
|---|---|---|---|
| id, fileName, imagePath | `file.*` | REAL | giữ |
| priority | `index+1` (sau sort sai) | **MOCK** | thứ hạng theo luật Tool |
| sort | `byDateDesc` | **MOCK (sai)** | size↓ → qty↓ → tên tự nhiên |
| sizeInch/side/qty | `parseItemName` | DERIVED | sửa parseItemName |
| placed | `index===0?qty-2:index<3?qty:0` | **MOCK** | đếm `item_done` (live) → xác nhận từ result |
| remaining | `qty − placed` | **MOCK** | qty gốc − placed thật; sau commit đọc qty-suffix |
| status | theo `index`/`sizeInch>4` | **MOCK** | từ trạng thái item thật |
| waitFile | `wait_${ceil(sizeInch)}.ai` | **ESTIMATED** | đọc file `wait_*.ai` thật |
| pixelSize | `'2362 × 2362'` | **MOCK** | Agent đo (Pillow) hoặc bỏ |
| dpi | `300` | **MOCK** | đo thật; lưu ý output = 600 |
| sourceFolder | `'Images'` | REAL | giữ |
| detectedAt | `fileTime(file)` | DERIVED | ok (≈ mtime) |

---

## 3. `mapSheet` — repository.ts:40

| Field | Nguồn | Nhãn | Nguồn thật |
|---|---|---|---|
| id | `'07'` | **MOCK** | chỉ số sheet thật do Agent cấp |
| status | từ runnerStatus | DERIVED | ok |
| items | `queue.slice(0,6)` | **MOCK** | item thật trên sheet (từ event) — Giai đoạn A chỉ hiện item đang xử lý |
| turn (n/qty) | `max(1,placed)/qty` | **MOCK** | đếm `item_done` per item |
| rotation | `['0°','90°','180°','270°'][i%4]` | **MOCK** | MISSING — Tool chưa xuất tọa độ |
| position X/Y | `2.31+i*3.24` … | **MOCK** | MISSING — cần serialize từ Illustrator |
| placed | `progress.index ?? len` | DERIVED | ok (progress thật) |
| total | `progress.total ?? max(90,len)` | DERIVED/ESTIMATED | total là unit-trong-batch, không phải "sheet x/90" |
| fitCapInch | `4` | **MOCK** | `remainingFitCapInch` từ batch-result |
| remainingFitInch | `3` | **MOCK** | như trên (theo sheet) |
| spacingCm | `0.2` | ESTIMATED | hằng gap Tool; nên đọc từ config |
| currentWaitFile | `waitFiles[0] ?? 'wait_4.ai'` | REAL/**MOCK** fallback | bỏ fallback bịa |
| waitDecision | `'Sẽ lưu wait_4.ai'` | **MOCK** | tính từ logic `shouldKeepAsWait(cap>3in)` |
| waitFiles[].items | `80+i*10` | **MOCK** | MISSING (số item trong wait không đọc được từ file) |
| waitFiles[].fitCapInch | parse tên `wait_{cap}` | REAL | giữ |

---

## 4. `mapDone` — repository.ts:69

| Field | Nguồn | Nhãn | Nguồn thật |
|---|---|---|---|
| danh sách | `imgaes_done` | REAL | giữ |
| sizeInch/side | parse | DERIVED | sửa parser |
| requestedQty | `parsed.qty` | REAL | tên file `_qty_{n}` là qty đã cộng dồn |
| placedQty | `partial?qty-2:qty` | **MOCK** | đọc qty-suffix thật (`updateDoneHistory` cộng dồn) |
| sheet | `7-(index%3)` | **MOCK** | MISSING — cần id sheet |
| status | `partial=index===2` | **MOCK** | so requested vs placed thật |
| sourceGroup | `name.replace(/_qty_\d+.*/,'')` | DERIVED ✅ | giữ |
| outputs | `['AI','FRONT','BACK','LAZER']` | **MOCK** | kiểm tra file tồn tại trong `output_*` |
| slice(0,8) | cắt cứng | (giới hạn) | phân trang thay vì cắt |

---

## 5. `mapErrors` — repository.ts:91

| Field | Nguồn | Nhãn | Nguồn thật |
|---|---|---|---|
| danh sách | `images_error` | REAL | giữ |
| sizeInch/side/qty | parse | DERIVED | sửa parser |
| **step** | `variants[i%4]` | **MOCK** | message thật: `CHECK_IMAGE_WIDTH_FALSE` → IMPORT_SIZE, `CHECK_COMPARE_FALSE` → FRONT_BACK/LAZER, `NO_FIT...` → PACKING |
| **reason/expected/actual/delta** | hard-code theo step | **MOCK** | từ `evidence`/`reason` trong batch-result + đo thật |
| sheet/runId | `'07'`, `'#128'` | **MOCK** | MISSING (id) |
| lỗi cũ/mới | mtime | MISSING | SQLite lưu lần đầu phát hiện |

Ghi chú: Tool có phát `reason` + `evidence[]` trong `results[]` khi `CHECK_COMPARE_FALSE` (`import-image.jsx > runBatch`). Đây là nguồn thật để thay hard-code — nhưng cần Agent bắt và lưu, vì result JSON bị ghi đè theo batch.

---

## 6. `mapOutputs` — repository.ts:107

| Field | Nguồn | Nhãn | Ghi chú |
|---|---|---|---|
| gom base name | `output_ai` + `includes(base)` | REAL/DERIVED ✅ | khớp `Acrylic_{d}_{m}_{NN}` |
| asset exported/processing | file tồn tại? | DERIVED ✅ | đúng hướng |
| **AI format 'Illustrator 8'** | hard-code | **MOCK (sai)** | `save-ai.jsx`: output_ai lưu `pdfCompatible=false, compressed` — **không phải AI8**. Chỉ LAZER (`export-output-assets.jsx > Compatibility.ILLUSTRATOR8`) mới là AI8 |
| sheet label | `7-(i%4)` | **MOCK** | parse `NN` từ tên `Acrylic_d_m_NN` |
| date/size/time | metadata | REAL | giữ |
| slice(0,8) | cắt cứng | (giới hạn) | phân trang |

**Đây là hàm "thật" nhất** — chỉ cần sửa 2 field (format AI, sheet label) và bỏ slice cứng.

---

## 7. `mapHistory` — repository.ts:133

| Field | Nguồn | Nhãn | Nguồn thật |
|---|---|---|---|
| runId | `event.runId ?? '#128'/...` | **MOCK** fallback | Agent sinh + SQLite |
| startedAt | `event.createdAt` | REAL nếu có event | ok |
| duration | `${18+index} phút` | **MOCK** | SQLite: finished − started |
| sheets | `1+(index%7)` | **MOCK** | đếm `sheet_saved` |
| items | `24+index*3` | **MOCK** | đếm `commit_completed` |
| errors | đếm level==='error' | DERIVED | ok nếu event thật |
| status | `index%4===0?'failed'...` | **MOCK** | từ run record cuối |
| timeline | `/history/events` | REAL nếu có | hiện chưa có event thật → fallback `mockData.history` |

**Kết luận:** History gần như **toàn mock** cho tới khi Agent ghi run/event vào SQLite.

---

## 8. `mapSettings` — repository.ts:164

| Field | Nguồn | Nhãn | Nguồn thật |
|---|---|---|---|
| folders + số file | `snapshot.folders` | REAL | giữ |
| path | slice hoặc fallback `D:\...\${key}` | REAL/**MOCK** fallback | bỏ đường dẫn bịa |
| valid | `true` | **MOCK** | Agent validate tồn tại/quyền |
| writable | `!key.includes('template')` | ESTIMATED | thử ghi thật |
| **sqlite** | `'healthy'` | **MOCK** | ping db thật |
| illustrator | `snapshot.illustratorConnected` | REAL | giữ |
| lastCheck | `snapshot.capturedAt` | REAL | giữ |

---

## 9. `buildSummary` / `subscribeDashboard` — phần thật nhất

- `buildSummary` (repository.ts:182): `runnerStatus, illustratorConnected, currentFile, progress, kpi.*` đều **REAL** từ snapshot/`/dashboard`/đếm folder. `kpi.processing = progress?1:0` là DERIVED. Chỉ có các fallback `?? mockData.*` cần thay bằng "unknown".
- `subscribeDashboard` (repository.ts:233): SSE `snapshot` đẩy `runnerStatus/illustratorConnected/progress/kpi` — **REAL live**. Giữ nguyên; đây là xương sống real-time đúng đắn.

---

## 10. Đề xuất kỹ thuật: gắn nhãn nguồn ngay trong dữ liệu

Bọc mỗi field không-chắc-thật bằng metadata để UI biết cách hiển thị và không có gì mock trông giống production:

```ts
type Tracked<T> = {
  value: T;
  source: 'REAL' | 'DERIVED' | 'ESTIMATED' | 'MOCK' | 'MISSING';
  updatedAt?: string;
  confirmed?: boolean;   // true sau batch-result / sau commit
  asOfPlacement?: number;
};
```

Nguyên tắc:
- Field `MOCK`/`MISSING` render bằng style riêng (mờ, nhãn "tạm tính"/"chưa có nguồn"), tuyệt đối không giống REAL.
- `getDashboardData` không được `return mockData` toàn cục khi lỗi lẻ — giữ phần REAL, đánh dấu phần hỏng, set `source:'mock'` cho đúng vùng.
- Khi Giai đoạn B có append-JSONL: `confirmed=false` lúc live (đếm event), `confirmed=true` sau batch-result, và cập nhật `imgaes_done` sau commit.

## 11. Việc cần làm ngay (không đụng Runner)

1. Sửa `parseItemName` khớp luật Tool (mục 1).
2. Sửa sort `mapQueue` theo luật Tool (mục 2).
3. Bỏ mọi `placed/remaining/rotation/position/step/reason/sheet/duration/...` bịa → thay bằng nguồn thật hoặc để `MISSING` có nhãn (mục 2–7).
4. Sửa `mapOutputs`: format AI + sheet label + bỏ slice cứng (mục 6).
5. Bỏ `catch → return mockData` toàn cục; xử lý lỗi theo vùng + cờ `source` (mục 0, 10).
6. Thêm `Tracked<T>` + style UI cho từng nhãn (mục 10).

Các việc cần Runner (Giai đoạn B): id ổn định, event JSONL, tọa độ packing, remaining-fit theo item, lịch sử SQLite — xem `docs/tool-telemetry-gap.md` mục 4–6.

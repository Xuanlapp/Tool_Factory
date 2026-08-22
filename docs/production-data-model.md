# Acrylic Production Data Model

Tài liệu này mô tả database dài hạn cho Web/App. Bản hiện tại đã có `platform_events`, `agent_snapshots`, `sync_outbox`. Các bảng bên dưới là chuẩn để thêm ở migration tiếp theo, không thay đổi runner cho đến khi command/event ổn định.

## 1. Nguyên tắc

- Folder vẫn là nguồn file vật lý: `Images`, `imgaes_done`, `images_error`, `wait`, `output_*`.
- SQLite là nguồn trạng thái hệ thống để Web đọc nhanh và tra cứu lịch sử.
- Log chỉ để điều tra sâu, không dùng làm UI chính.
- Mỗi ảnh phải có khóa quy chiếu ổn định từ tên file: `orderId`, `itemId`, `sideCount`, `sizeInch`, `qty`.
- Chỉ cập nhật trạng thái `done` sau khi sheet/save/export thành công.
- Một lỗi check false chỉ ảnh hưởng đúng ảnh đó.

## 2. Bảng đề xuất

### `production_runs`

| Cột | Ý nghĩa |
|---|---|
| `run_id` | ID lần chạy |
| `tool_id` | Luôn là `acrylic` ở bản đầu |
| `machine_id` | Máy chạy Local Agent |
| `command_type` | `start`, `check`, `error`, `debug`, `export` |
| `status` | `idle`, `starting`, `running`, `completed`, `failed`, `stopped` |
| `started_at` | Bắt đầu |
| `finished_at` | Kết thúc |
| `requested_by` | User bấm lệnh |
| `summary_json` | Tổng hợp cuối run |

### `production_items`

| Cột | Ý nghĩa |
|---|---|
| `item_key` | Hash/path ổn định của file |
| `order_id` | Ví dụ `53666` |
| `item_id` | Ví dụ `item1` |
| `file_name` | Tên PNG |
| `source_path` | Path file hiện tại |
| `source_folder` | `Images`, `imgaes_done`, `images_error` |
| `side_count` | `1`, `2` hoặc badge-reel = `1` |
| `size_inch` | Ví dụ `3.5` |
| `qty_requested` | Qty parse từ filename |
| `qty_placed` | Số đã đặt trong run/sheet |
| `qty_remaining` | Số còn lại |
| `status` | `discovered`, `queued`, `running`, `placed`, `partial`, `done`, `error`, `no_fit` |
| `last_run_id` | Run gần nhất đụng tới item |
| `last_sheet_id` | Sheet gần nhất |
| `updated_at` | Cập nhật gần nhất |

### `production_sheets`

| Cột | Ý nghĩa |
|---|---|
| `sheet_id` | ID sheet |
| `run_id` | Thuộc run nào |
| `source_type` | `template` hoặc `wait` |
| `source_file` | File template/wait mở ban đầu |
| `status` | `opened`, `packing`, `saved_wait`, `saved_output`, `failed` |
| `placed_count` | Tổng item đã đặt |
| `fit_cap_inch` | Kích thước còn fit dùng đặt tên wait |
| `saved_file` | AI output hoặc wait file |
| `started_at` | Bắt đầu sheet |
| `finished_at` | Kết thúc sheet |

### `production_errors`

| Cột | Ý nghĩa |
|---|---|
| `error_id` | ID lỗi |
| `run_id` | Run gây lỗi |
| `sheet_id` | Sheet nếu có |
| `item_key` | Ảnh lỗi |
| `step` | `IMPORT_SIZE`, `FRONT_BACK`, `LAZER`, `PACKING`, `SAVE`, `EXPORT` |
| `message` | Lỗi ngắn gọn cho UI |
| `expected` | Giá trị chuẩn |
| `actual` | Giá trị thực tế |
| `delta` | Sai lệch |
| `evidence_json` | Dữ liệu đo, path ảnh debug, log line |
| `created_at` | Thời điểm lỗi |

### `production_outputs`

| Cột | Ý nghĩa |
|---|---|
| `output_id` | ID output group |
| `run_id` | Run tạo output |
| `sheet_id` | Sheet tạo output |
| `base_name` | Ví dụ `Acrylic_26_7_01` |
| `ai_path` | Output AI |
| `front_path` | PNG front |
| `back_path` | PNG back nếu có |
| `lazer_path` | AI lazer |
| `status` | `exporting`, `complete`, `partial`, `error` |
| `created_at` | Thời điểm tạo |

## 3. Quy chiếu filename

Ví dụ:

```text
53666_item1_acrylic-keychain-1-layer-1-side-3-5in-ac_qty_1_3-5in_qty_1.png
```

Kết quả parse:

| Trường | Giá trị |
|---|---|
| `order_id` | `53666` |
| `item_id` | `item1` |
| `side_count` | `1` |
| `side_label` | `1-side` |
| `size_inch` | `3.5` |
| `size_label` | `3-5in` |
| `qty_requested` | `1` |

Badge reel không có `1-side` thì mặc định `side_count = 1`.

## 4. UI đọc bảng nào

| Trang | Bảng/folder chính |
|---|---|
| Hàng chờ | `production_items` + `Images` |
| Sheets | `production_sheets`, `production_items`, `platform_events` |
| Đã xong | `production_items` status `done` + `imgaes_done` |
| Ảnh lỗi | `production_errors` + `images_error` |
| Thành phẩm | `production_outputs` + `output_*` |
| Lịch sử | `production_runs` + `platform_events` |
| Cấu hình | Agent config + folder validation |

## 5. Thứ tự triển khai database

1. Thêm migration tạo bảng rỗng.
2. Local Agent index file trong folder vào `production_items` read-only.
3. Runner ghi progress JSON chi tiết hơn theo run/sheet/item.
4. Agent chuyển progress/event thành bảng chuẩn.
5. Web đổi từ folder mapping sang bảng chuẩn.
6. Sau khi ổn mới thêm command Start/Check/Export.

# Hợp đồng vận hành Tool ↔ Web

Tài liệu này là khuôn chuẩn để phát triển Acrylic Production lâu dài. Khi code và tài liệu khác nhau, phải kiểm tra lại tài liệu này trước khi sửa runner.

## 1. Nguyên tắc cố định

1. `Tool` là nơi duy nhất thực hiện Illustrator, kiểm tra ảnh, packing, wait, save và export.
2. `Web` không đọc/ghi trực tiếp vào folder sản xuất và không tự chạy `cscript.exe`.
3. `Control API` quản lý người dùng, quyền, dữ liệu hiển thị và tiếp nhận lệnh.
4. `Local Agent` là cầu nối duy nhất được phép đọc máy sản xuất và khởi chạy Tool.
5. `SQLite` là nguồn trạng thái local chính. Mất mạng hoặc mất NocoDB không được làm dừng runner.
6. `NocoDB` chỉ đồng bộ nền để quản trị, báo cáo và tra cứu.
7. Log dùng để điều tra khi có lỗi. Giao diện hằng ngày phải dựa trên trạng thái chuẩn hóa, không bắt người dùng đọc log.
8. Không sửa logic Illustrator/packing chỉ để phục vụ giao diện. Nếu cần sửa runner, phải có test riêng và ghi rõ thay đổi.

## 2. Luồng dữ liệu chuẩn

```text
Images / wait / output / images_error / imgaes_done
                         │
                         ▼
                   Acrylic Tool
        npm start / check / error / debug / export
                         │
                         ▼
             .runtime progress + events
                         │
                         ▼
                   Local Agent
          scan folder + process + telemetry
                         │
                         ▼
                      SQLite
                         │
                  ┌──────┴──────┐
                  ▼             ▼
             Control API     NocoDB sync
                  │
            REST + SSE
                  │
                  ▼
                 Web/App
```

Web lấy snapshot bằng REST khi mở trang. SSE chỉ đẩy thay đổi mới để giao diện cập nhật nhanh.

## 3. Nguồn dữ liệu theo trang

| Trang web | Nguồn chính | Ý nghĩa |
|---|---|---|
| Tổng quan | Snapshot SQLite + SSE | Runner, Illustrator, sheet, queue, lỗi, output |
| Hàng chờ | `Images` + metadata đã parse | Thứ tự chạy giống Tool: size giảm dần, qty giảm dần, tên tự nhiên |
| Sheets | progress/event + `wait` | Sheet hiện tại, item đã đặt, mức còn fit, quyết định wait/output |
| Đã xong | manifest thành công + `imgaes_done` | Chỉ hiển thị item đã được lưu sheet thành công |
| Ảnh lỗi | error event + `images_error` | Bước lỗi, expected, actual, sai lệch và file gốc |
| Thành phẩm | `output_ai/front/back/lazer` | Gom theo cùng output base name, kiểm tra đủ bộ file |
| Lịch sử | run/sheet/item/event trong SQLite | Tra cứu run; log chi tiết chỉ mở khi cần |
| Cấu hình | Local Agent validation | Folder, Illustrator, SQLite, NocoDB, quyền người dùng |

## 4. Mapping lệnh Tool sang Web

| Tool hiện tại | Chức năng Web dự kiến | Quyền | Quy tắc |
|---|---|---|---|
| `npm start` | Bắt đầu sản xuất | Operator, Admin | Chỉ chạy khi không có run đang hoạt động |
| `npm run check` | Kiểm tra 1 ảnh | QC, Admin | Giữ Illustrator mở để QC xem kết quả |
| `npm run error` | Chạy bỏ qua check false | Admin | Nút nguy hiểm, phải xác nhận và ghi lý do |
| `npm run debug` | Debug full pipeline | Admin/Developer | Không dùng ở màn hình sản xuất thường ngày |
| `npm run debug:lazer` | Debug từng bước LAZER | QC/Developer | Chạy giới hạn 1 item, không chuyển done |
| `npm run test:export -- file.ai` | Xuất lại thành phẩm | QC, Admin | Chỉ nhận AI nằm trong wait/output_ai hợp lệ |
| `npm run check:width` | Kiểm tra W ảnh | QC | Không packing, không move file nếu chỉ kiểm tra |

## 5. Vòng đời Run

```text
IDLE
  └─ Start request
      └─ VALIDATING
          ├─ lỗi cấu hình → REJECTED
          └─ hợp lệ → STARTING
              └─ RUNNING
                  ├─ checkpoint 50/70 item → CHECKPOINTING → RUNNING
                  ├─ yêu cầu dừng → STOP_REQUESTED → SAVING_SAFE → STOPPED
                  ├─ lỗi nghiêm trọng → FAILED
                  └─ hết ảnh → FINALIZING → COMPLETED
```

Mỗi run phải có `runId`, `toolId`, `machineId`, thời điểm bắt đầu, command, user và trạng thái cuối.

## 6. Vòng đời Item

```text
DISCOVERED → PARSED → VALIDATING → READY → PROCESSING
                                            ├─ PLACED
                                            ├─ PARTIAL
                                            ├─ NO_FIT
                                            └─ ERROR

PLACED/PARTIAL chỉ thành DONE sau khi sheet được lưu thành công.
```

Quy tắc quan trọng:

- Không move PNG ngay sau khi Illustrator vừa đặt item.
- Chỉ cập nhật `imgaes_done` và qty còn lại sau khi save AI/wait thành công.
- Nếu qty 5 đặt được 3: ghi `placedQty=3`, `remainingQty=2`; file còn lại trong `Images` với qty mới sau khi save thành công.
- Nếu check false: chỉ đúng file đó được chuyển `images_error`; item tạm trong Illustrator phải được dọn trước khi chạy file tiếp theo.

## 7. Vòng đời Sheet

```text
OPEN_TEMPLATE hoặc OPEN_WAIT
    → IMPORTING
    → PACKING
    → RECLIPPING
    → DECIDING
        ├─ còn fit > 3in → SAVE_WAIT
        └─ còn fit <= 3in hoặc hết khả năng hữu ích → EXPORT_OUTPUT
```

Tên wait phải dựa vào kích thước lớn nhất còn có thể fit, không dựa vào item cuối vừa xử lý.

## 8. Command layer an toàn

Web không chạy command trực tiếp. Luồng điều khiển phải là:

```text
Web → Control API → command record SQLite → Local Agent claim command
    → validate machine/runner/folder → spawn Tool → stream progress/event
```

Mỗi command có `commandId`, `commandType`, `requestedBy`, `requestedAt`, `status`, `runId` và `reason` khi bị từ chối/lỗi.

Local Agent chỉ claim một command sản xuất tại một thời điểm. Refresh web hoặc bấm nút hai lần không được tạo hai runner.

## 9. Quyền đề xuất

| Role | Xem dữ liệu | Start | Check | Retry | Ignore check | Settings |
|---|---:|---:|---:|---:|---:|---:|
| Viewer | Có | Không | Không | Không | Không | Không |
| Operator | Có | Có | Không | Không | Không | Không |
| QC | Có | Không | Có | Có | Không | Không |
| Admin | Có | Có | Có | Có | Có | Có |

## 10. Thứ tự triển khai

1. Chuẩn hóa event và trạng thái Run/Sheet/Item.
2. Hiển thị dữ liệu thật ổn định trên 8 trang.
3. Thêm command table và Local Agent command worker.
4. Mở nút Start/Check/Export trước.
5. Thêm Safe Stop/Resume sau khi runner hỗ trợ checkpoint rõ ràng.
6. Thêm Retry và move file sau khi có transaction/rollback.
7. Thêm đăng nhập và phân quyền.
8. Đồng bộ NocoDB nền và màn hình báo cáo.

## 11. Tiêu chí hoàn thành một chức năng

Một chức năng chỉ hoàn thành khi đủ:

1. Có trạng thái rõ ràng trên Web.
2. Có typed contract chung.
3. Có API endpoint hoặc SSE event tương ứng.
4. Có ghi SQLite trước khi phản hồi thành công.
5. Có xử lý khi app/web bị đóng hoặc máy khởi động lại.
6. Có idempotency để không chạy trùng.
7. Có thông báo lỗi ngắn gọn cho người dùng và log chi tiết để tra cứu.

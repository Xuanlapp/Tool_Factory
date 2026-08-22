# Illustrator Import Prototype

Prototype này dùng để:
- mở `D:\FFactory\Arcylic\template\Template_UVDTF.ai`
- nếu template đã mở trong Illustrator thì dùng lại file đó
- lấy 1 file `.png` đầu tiên trong `D:\FFactory\Arcylic\Images`
- đọc quy tắc từ tên file ảnh
- thêm ảnh vào layer `Images`

## Quy tắc đang hỗ trợ
- `1-side` => đặt `2` bản sao ảnh
- `2-side` => đặt `3` bản sao ảnh
- `1-layer` => đã hỗ trợ
- `2in` => chưa xử lý, để bước sau

Ví dụ tên file:
- `48211_item1_acrylic-keychain-1-layer-1-side-2in-ac_qty_1.png`

## Cách chạy
1. Bỏ ít nhất `1` file `.png` vào `D:\FFactory\Arcylic\Images`
2. Mở terminal tại `D:\FFactory\Arcylic\Tool`
3. Chạy `npm start`

## Kết quả mong đợi
- Illustrator mở lên hoặc dùng cửa sổ đang mở
- template `Template_UVDTF.ai` được mở hoặc kích hoạt
- ảnh `.png` đầu tiên được đưa vào layer `Images`
- nếu tên file có `1-side` thì ảnh được đặt `2` bản sao
- nếu tên file có `2-side` thì ảnh được đặt `3` bản sao

## File chính
- `src/index.ts`: chọn file ảnh test và gọi Illustrator
- `scripts/launch-illustrator-and-run.vbs`: mở Illustrator và truyền tham số cho JSX
- `scripts/import-image.jsx`: mở template, parse tên file, thêm ảnh vào layer `Images`

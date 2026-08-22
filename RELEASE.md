# Phát hành Acrylic Factory

## Tạo bản cài và cập nhật tự động

1. Tăng `version` trong `apps/desktop/package.json`.
2. Commit và push code lên `main`.
3. Tạo tag phiên bản, ví dụ:

```powershell
git tag v0.2.1
git push origin main --tags
```

GitHub Actions sẽ tự build Windows installer và tạo GitHub Release. Các máy đã cài bản có `electron-updater` sẽ tự kiểm tra bản mới.

Lưu ý: bản cài `0.1.0` hiện tại chưa có updater. Cần cài thủ công bản `0.2.0` một lần; từ bản đó trở đi các bản mới sẽ tự cập nhật.

Updater không cài giữa lúc Tool/Export đang chạy. Dữ liệu sản xuất nằm ngoài thư mục cài app và không bị xóa khi cập nhật.

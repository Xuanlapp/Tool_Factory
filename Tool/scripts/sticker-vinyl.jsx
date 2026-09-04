/*
DETAILED LOGIC - BATCH IMPORT LAYERS (MÔ TẢ CHI TIẾT)

MỤC ĐÍCH & PHẠM VI
- Script tự động hóa quy trình chuyển ảnh sticker (raster) thành artwork vector
  trong Adobe Illustrator, sau đó xếp các artwork này lên artboard theo thuật toán
  bin-packing (smart packer). Script thực hiện tracing, xử lý path, tạo die/kiss và
  quản lý file (done / error / wait).

PHÂN ĐOẠN CHI TIẾT (STEP-BY-STEP)
1) Khởi tạo
    - Thiết lập đường dẫn: TEMPLATE, IMAGE_FOLDER, IMAGE_DONE_FOLDER, IMAGE_ERROR_FOLDER, OUTPUT_FOLDER, WAIT_FOLDER, WAIT_META_FOLDER.
    - Thiết lập tham số: GAP_MM, MARGIN_MM (đổi ra điểm bằng GAP_PT / MARGIN_PT), ALLOW_ROTATE, FAST_MODE (rút ngắn sleep), ACTION_SET/ACTION_MERGE/ACTION_UNITE.
    - Lưu `OLD_USER_INTERACTION_LEVEL` để khôi phục sau khi script kết thúc.

2) Resume (Wait mode)
    - Nếu tồn tại file `_wait_` trong `WAIT_FOLDER`, mở file này và đặt `RUN_WAIT_MODE=true`.
    - Nếu không có file wait, mở `template_saved.ai` từ `OUT_TEMPLATE`.
    - Wait mode dùng `wait-meta` JSON để tiếp tục tái sử dụng vùng đã dùng trên sheet trước đó.

3) Đọc & Tạo jobs
    - Đọc các file ảnh hợp lệ trong `IMAGE_FOLDER` (.jpg, .png, .tif, .bmp, .psd).
    - Loại bỏ file có hậu tố `-done`.
    - Parse tên file theo format: `ID-SIZE-QTY-STT` (ví dụ `PET_001-5.5-3-A01`).
      * id: mã sản phẩm
      * size: số inch (cần parse -> `inch`)
      * qty: số lượng copy
      * stt: ghi chú / số thứ tự (tuỳ chọn)
      * isSll: check token "SLL" trong tên
    - Tính `targetSizePt` từ inch (có lookup table cho inch chuẩn để tránh số lẻ).
    - Nếu không parse được size/id, file sẽ được log và move sang `IMAGE_ERROR_FOLDER`.

4) Sắp xếp jobs
    - Sort theo `targetSizePt` giảm dần (size lớn trước), rồi `qty` giảm dần, rồi `id` để ổn định.

5) Tạo Smart Packer
    - Lấy vùng khả dụng từ layer `kiss` (nếu có) hoặc artboard hiện hành.
    - Tính `freeRects` ban đầu dựa trên margin.
    - Nếu `WAIT_META` có dữ liệu, dùng grid-scan mode thay vì chia nhỏ freeRects (giữ freeRects lớn và kiểm tra chéo với usedRects)
    - Packer cung cấp `canFit(w,h)`, `place(item)` và `getUsedRects()`.

6) Vòng lặp xử lý job (main loop)
    - Duyệt pendingJobs; theo mỗi job:
      a) Kiểm tra jobFailureCount & blockedSizeKeys để né các kích thước đã thấy thất bại trên sheet hiện tại.
      b) Tạo layer `masterLayer` đặt tên theo ID/size và gọi `createArtworkWithInvert`.
          - `createArtworkWithInvert` = thử `createArtworkCore(..., useInvert=true)`
          - Nếu `createArtworkCore` ném lỗi (ngoại trừ sentinel stop), ghi log và thử lại `createArtworkWithoutInvert` (useInvert=false).
          - Nếu lượt không-invert trả `null`, hoặc vẫn lỗi => file sẽ bị move sang `IMAGE_ERROR_FOLDER`.
      c) Nếu `masterGroup` thành công: gọi `placeQuantityCopiesOneByOne` để duplicate và place theo `qty`.
      d) Nếu ít nhất 1 copy được place: cập nhật queue/rename hoặc move file sang done; nếu không: tăng failure counter và block size cho sheet hiện tại.

7) Tạo artwork (createArtworkCore -> processPlacedImageOnActiveLayer)
    - createLayerAndPlace: tạo layer mới, `placedItems.add()` và đặt vị trí, `placed.selected=true`.
    - processPlacedImageOnActiveLayer:
      1. Embed ảnh (linked -> embedded) và kiểm tra selection.
      2. Duplicate raster và nếu `useInvert===true` gọi `invertColorSelection()` (wrapper cho `app.executeMenuCommand("Colors6")`).
          - Nếu invert lỗi: ghi chi tiết vào `debug_log.txt` và dừng (nếu cấu hình yêu cầu) hoặc ném lỗi để retry fallback.
      3. Trace selection (`.trace()`), load preset `Silhouettes`, expand tracing.
      4. Merge selection bằng `app.doScript(actionMerge, actionSet)`; kiểm tra selection.
      5. Unite bằng `app.doScript(actionUnite, actionSet)`; kiểm tra selection.
      6. Thực hiện tô màu, stroke, `Offset Path` effect và `expandStyle`.
          - Lưu ý: `expandStyle` có thể tạo `CompoundPathItem` thay vì `PathItem` (điều này là bình thường).
      7. Duplicate offset path để tạo die/kiss; `makeMask` để tạo clipping mask với raster.
      8. Resize artwork dựa trên clipping mask bounds tới `targetSize`.
      9. Kiểm tra `hasRequiredItems(layer)` — layer phải có ít nhất `pathCount >= 2` (đếm cả `PathItem` và `CompoundPathItem`) và `clipGroupCount >= 1`.
     10. Gộp tất cả pageItems trong layer thành `finalGroup` và trả về.

8) Validation & lỗi
    - Hàm `hasRequiredItems` trả `ok=false` khi không đủ path hoặc không có clipping group.
    - Khi validation fail: layer temporary sẽ bị remove (trừ trường hợp dừng inspect), ghi log và ném lỗi để trigger retry/no-invert.
    - Nếu retry no-invert cũng fail: file được move sang `IMAGE_ERROR_FOLDER`.
    - `debug_log.txt` chứa các entry dạng `[TIMESTAMP] [STEP|ERROR] ...` giúp tra cứu lỗi từng bước (embed, invert, trace, expandTracing, merge, unite, expandStyle, makeMask, validation,...).

9) Place & save
    - `placeQuantityOneByOne` duplicate `masterGroup` vào layer mới cho mỗi copy; gọi `placeArtworkNow`.
    - `placeArtworkNow` gọi `packer.place(finalGroup)`. Nếu fit -> ungroup temp final group, di chuyển cut paths (die/kiss) vào layer tương ứng, push id vào `currentSheetIds`.
    - Nếu sheet được lưu: `saveCurrentSheetAs` tạo file .ai (hoặc wait file), lưu `wait-meta.json` nếu cần, ghi note và move các file done.

10) File management
     - Nếu copy được place hết: file gốc bị move hoặc rename theo số lượng còn lại (đặt `- done` khi xong).
     - Nếu lỗi nặng (fail 2 lần hoặc createArtworkWithoutInvert trả null): move file sang `IMAGE_ERROR_FOLDER`.

11) Debug & Tips
     - `debug_log.txt` (D:/n8n/FILE/debug_log.txt) ghi step-by-step và lỗi (invert lỗi, assertion fail, expand/merge/unite fail, validation counts).
     - `CompoundPathItem` là trạng thái bình thường sau `expandStyle`; `hasRequiredItems` đã đếm cả `CompoundPathItem`.
     - Nếu Illustrator "hang" trong host operation (trace/expand), script không thể tự kill Illustrator; cần watchdog ngoài process.

12) Danh sách hàm chính (tóm tắt)
     - createArtworkWithInvert / createArtworkWithoutInvert: entry points cho invert-first và fallback.
     - createArtworkCore: lấy layer, gọi processPlacedImageOnActiveLayer, cleanup nếu lỗi.
     - createLayerAndPlace: tạo layer và placedItem.
     - processPlacedImageOnActiveLayer: pipeline trace→expand→merge→unite→offset→mask→resize→group.
     - invertColorSelection: helper gọi `Colors6` và assert selection.
     - placeQuantityCopiesOneByOne / placeArtworkNow: duplicate + packer.place logic.
     - hasRequiredItems: validation (đếm PathItem/CompoundPathItem và GroupItem.clipped).
     - writeDebugLog: append vào debug_log.txt.

KNOWN LIMITATIONS
 - Nếu host commands (trace, expandTracing, executeMenuCommand) bị treo, ExtendScript không có cách nội tại để timeout/cancel; cần tool ngoài để giám sát Illustrator.
 - Preset tracing "Silhouettes" phải tồn tại trên hệ thống. Nếu không, trace có thể fail.

KẾT LUẬN
 - Script thiết kế để chạy batch với chiến lược: thử invert trước, nếu có lỗi thì thử lại không invert, và chỉ khi cả hai đều fail mới đưa file vào `image-error`.
 - Mọi bước quan trọng đều có logging để tiện debug; `hasRequiredItems` đã chấp nhận compound path để tránh false negatives.

*/

#target illustrator

    (function () {
        var OUT_TEMPLATE = (typeof CODEX_STICKER_TEMPLATE_DIR !== 'undefined' ? CODEX_STICKER_TEMPLATE_DIR : "D:/FFACTORY/Sticker Vinyl/template");
        var STICKER_ROOT = (typeof CODEX_STICKER_ROOT !== 'undefined' ? CODEX_STICKER_ROOT : "D:/FFACTORY/Sticker Vinyl");
        var IMAGE_FOLDER = (typeof CODEX_STICKER_IMAGES_DIR !== 'undefined' ? CODEX_STICKER_IMAGES_DIR : STICKER_ROOT + "/Sticker");
        var OUTPUT_FOLDER = getTodayFolder(typeof CODEX_STICKER_OUTPUT_AI_DIR !== 'undefined' ? CODEX_STICKER_OUTPUT_AI_DIR : OUT_TEMPLATE + "/output_ai");
        var IMAGE_DONE_FOLDER = getTodayFolder(typeof CODEX_STICKER_DONE_DIR !== 'undefined' ? CODEX_STICKER_DONE_DIR : STICKER_ROOT + "/image-done");
        var IMAGE_ERROR_FOLDER = (typeof CODEX_STICKER_ERROR_DIR !== 'undefined' ? CODEX_STICKER_ERROR_DIR : STICKER_ROOT + "/image-error");
        var NOTE_DONE_FOLDER = getTodayFolder(typeof CODEX_STICKER_NOTE_DONE_DIR !== 'undefined' ? CODEX_STICKER_NOTE_DONE_DIR : OUT_TEMPLATE + "/note_done");
        var WAIT_FOLDER = (typeof CODEX_STICKER_WAIT_DIR !== 'undefined' ? CODEX_STICKER_WAIT_DIR : OUT_TEMPLATE + "/wait");
        var WAIT_META_FOLDER = (typeof CODEX_STICKER_WAIT_META_DIR !== 'undefined' ? CODEX_STICKER_WAIT_META_DIR : OUT_TEMPLATE + "/wait-meta");
        var NOTEWORKFOLDER = getTodayFolder(typeof CODEX_STICKER_NOTE_WORK_DIR !== 'undefined' ? CODEX_STICKER_NOTE_WORK_DIR : OUT_TEMPLATE + "/note_work");
        var DEBUG_STEP_MODE = false; // true = dừng từng bước để xem, false = chạy tự động
        var GAP_MM = (typeof CODEX_STICKER_GAP_MM !== 'undefined' ? Number(CODEX_STICKER_GAP_MM) : 5);
        var MARGIN_MM = (typeof CODEX_STICKER_MARGIN_MM !== 'undefined' ? Number(CODEX_STICKER_MARGIN_MM) : 3);
        var RUN_WAIT_MODE = false;
        var WAIT_SOURCE_FILE = null;
        var WAIT_BASE_NAME = "";
        var WAIT_MAX_INCH = null;
        var WAIT_FILE_PREFIX = (typeof CODEX_STICKER_HOLO_MODE !== 'undefined' && CODEX_STICKER_HOLO_MODE) ? "wait_holo" : "wait";
        var SHOULD_CLOSE_AFTER_SAVE = false;
        var GAP_PT = GAP_MM * 2.834645669;
        var MARGIN_PT = MARGIN_MM * 2.834645669;
        var ALLOW_ROTATE = true;
        var ACTION_SET = "My set";
        var ACTION_MERGE = "Merge";
        var ACTION_UNITE = "Unite";
        var AUTO_LAYER_PREFIX = "__AUTO_BATCH__ ";
        var FAST_MODE = true;
        var MAX_IMAGES_BEFORE_WAIT = 50;
        var SLEEP_SCALE = 0.35;
        var MIN_SLEEP = 80;
        var SHOW_WAIT_FIT_PREVIEW = false;
        var OLD_USER_INTERACTION_LEVEL = app.userInteractionLevel;
        var CURRENTWORKFILE = null;

        function getTodayFolder(basePath) {
            var d = new Date();

            var month = d.getMonth() + 1;
            var day = d.getDate();
            var year = String(d.getFullYear()).substr(2, 2);

            var baseFolder = new Folder(basePath);
            if (!baseFolder.exists) baseFolder.create();

            var monthFolder = new Folder(baseFolder.fsName + "/thang" + month);
            if (!monthFolder.exists) monthFolder.create();

            var dayFolder = new Folder(monthFolder.fsName + "/" + day + "-" + month + "-" + year);
            if (!dayFolder.exists) dayFolder.create();

            return dayFolder.fsName;
        }

        function getFirstWaitFile(waitFolder) {
            if (!waitFolder.exists) return null;

            var waitFiles = waitFolder.getFiles(function (f) {
                return f instanceof File && /\.ai$/i.test(f.name) && (/_wait_/i.test(f.name) || /^wait(?:_holo)?_[0-9]+(?:_[0-9]+)?\.ai$/i.test(f.name));
            });

            if (!waitFiles || waitFiles.length === 0) return null;

            waitFiles.sort(function (a, b) {
                if (a.modified > b.modified) return -1;
                if (a.modified < b.modified) return 1;
                return String(a.name).localeCompare(String(b.name));
            });

            var f = waitFiles[0];
            var base = stripExt(f.name);

            var m = base.match(/^(wait(?:_holo)?)_([0-9]+(?:_[0-9]+)?)$/i);
            var baseName = "";
            var inchText = "";
            if (m) {
                baseName = m[1];
                inchText = m[2].replace("_", ".");
            } else {
                m = base.match(/^(.*)_wait_([0-9]+(?:_[0-9]+)?)$/i);
                if (!m) return null;
                baseName = m[1];
                inchText = m[2].replace("_", ".");
            }
            var maxInch = parseFloat(inchText);

            return {
                file: f,
                baseName: baseName,
                maxInch: maxInch
            };
        }
        try {
            app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

            var outFolder = new Folder(OUTPUT_FOLDER);
            if (!outFolder.exists) outFolder.create();

            var noteDoneFolder = new Folder(NOTE_DONE_FOLDER);
            if (!noteDoneFolder.exists) noteDoneFolder.create();

            var waitFolder = new Folder(WAIT_FOLDER);
            if (!waitFolder.exists) waitFolder.create();

            var waitMetaFolder = new Folder(WAIT_META_FOLDER);
            if (!waitMetaFolder.exists) waitMetaFolder.create();

            var doneFolder = new Folder(IMAGE_DONE_FOLDER);
            if (!doneFolder.exists) doneFolder.create();

            var errorFolder = new Folder(IMAGE_ERROR_FOLDER);
            if (!errorFolder.exists) errorFolder.create();

            var noteWorkFolder = new Folder(NOTEWORKFOLDER);
            if (!noteWorkFolder.exists) noteWorkFolder.create();

            var waitJob = getFirstWaitFile(waitFolder);

            if (waitJob) {
                RUN_WAIT_MODE = true;
                WAIT_SOURCE_FILE = waitJob.file;
                WAIT_BASE_NAME = waitJob.baseName;
                WAIT_MAX_INCH = waitJob.maxInch;

                doc = app.open(WAIT_SOURCE_FILE);
            } else {
                var tmplFileOpen = new File(typeof CODEX_STICKER_TEMPLATE_FILE !== 'undefined' ? CODEX_STICKER_TEMPLATE_FILE : OUT_TEMPLATE + "/template_saved.ai");
                if (tmplFileOpen.exists) {
                    doc = app.open(tmplFileOpen);
                }
            }
            var currentJobName = RUN_WAIT_MODE && WAIT_SOURCE_FILE
                ? WAIT_SOURCE_FILE.name
                : "templatesaved.ai";

            writeWorkNote(currentJobName);

            if (app.documents.length === 0) {
                throw new Error("Báº¡n cáº§n má»Ÿ sáºµn file Illustrator/template trÆ°á»›c khi cháº¡y script.");
            }

            var doc = app.activeDocument;

            var folder = new Folder(IMAGE_FOLDER);
            if (!folder.exists) {
                throw new Error("KhÃ´ng tÃ¬m tháº¥y folder: " + IMAGE_FOLDER);
            }
            var files = folder.getFiles(function (f) {
                if (!(f instanceof File)) return false;
                var cleanBase = stripExt(cleanFileName(f.name));
                if (/-\s*done\s*$/i.test(cleanBase)) return false;
                return /\.(png|jpg|jpeg)$/i.test(cleanFileName(f.name));
            });

            if (!files || files.length == 0) {
                removeWorkNote();

                // Nếu đang ở WAIT mode mà không có file <= WAIT_MAX_INCH,
                // giữ nguyên file wait để chạy lại sau và thông báo cho user.
                if (RUN_WAIT_MODE) {
                    $.writeln("Wait mode: không có file sticker <= " + WAIT_MAX_INCH + "in. Giữ wait file và dừng.");

                    return;
                }

                return;
            }

            var packer = createSmartPacker(doc, MARGIN_PT, GAP_PT, ALLOW_ROTATE, RUN_WAIT_MODE ? WAIT_BASE_NAME : null, RUN_WAIT_MODE ? WAIT_MAX_INCH : null, waitMetaFolder);

            var currentSheetIds = [];
            var currentSheetLayers = [];
            var currentSheetDoneFiles = [];

            var processedFileCount = 0;
            var placedCopyCount = 0;
            var stoppedByUser = false;

            var placedCountByFile = {};
            var failedFileKeys = {};
            var placedOnSheetCount = 0;
            // ==========================================
            // Táº O JOBS
            // ==========================================
            var jobs = [];


            for (var f = 0; f < files.length; f++) {
                try {
                    var info = parseFileName(files[f].name);
                    files[f] = normalizePackQtyFileName(files[f], info);
                    if (RUN_WAIT_MODE && info.inch > WAIT_MAX_INCH) {
                        continue;
                    }

                    jobs.push({
                        file: files[f],
                        info: info
                    });
                } catch (errParse) {
                    $.writeln("File lá»—i tÃªn/size: " + files[f].fsName + " | " + getErrorMessage(errParse));
                    moveFileToErrorFolder(files[f], errorFolder);
                }
            }

            var workIds = [];
            var seenWorkIds = {};
            for (var wi = 0; wi < jobs.length; wi++) {
                var wid = String(jobs[wi].info.id);
                if (!seenWorkIds[wid]) {
                    seenWorkIds[wid] = true;
                    workIds.push(wid);
                }
            }
            writeWorkNote(currentJobName, workIds);


            // ==========================================
            // SORT áº¢NH Lá»šN -> NHá»Ž
            // ==========================================
            jobs.sort(function (a, b) {

                // size lá»›n trÆ°á»›c
                if (a.info.targetSizePt !== b.info.targetSizePt) {
                    return b.info.targetSizePt - a.info.targetSizePt;
                }

                // náº¿u cÃ¹ng size -> qty lá»›n trÆ°á»›c
                if (a.info.qty !== b.info.qty) {
                    return b.info.qty - a.info.qty;
                }

                // cuá»‘i cÃ¹ng sort theo ID
                return String(a.info.id).localeCompare(String(b.info.id));
            });

            var pendingJobs = jobs.slice();
            var jobFailureCount = {}; // Theo dÃµi sá»‘ láº§n fail cá»§a má»—i job
            var blockedSizeKeys = {}; // Size Ä‘Ã£ khÃ´ng fit trÃªn sheet hiá»‡n táº¡i

            while (pendingJobs.length > 0 && !stoppedByUser) {
                var placedSomethingThisRound = false;

                for (var j = 0; j < pendingJobs.length; j++) {
                    var file = pendingJobs[j].file;
                    var info = pendingJobs[j].info;
                    var jobKey = getFileKey(file);
                    var sizeKey = toSizeKey(info.inch);

                    // Náº¿u size nÃ y Ä‘Ã£ fail fit trÃªn sheet hiá»‡n táº¡i,
                    // bá» qua toÃ n bá»™ job cÃ¹ng size Ä‘á»ƒ chuyá»ƒn sang size nhá» hÆ¡n.
                    if (blockedSizeKeys[sizeKey]) {
                        continue;
                    }

                    // Náº¿u file fail quÃ¡ 2 láº§n trong cÃ¹ng vÃ²ng láº·p, xÃ³a nÃ³
                    if (!jobFailureCount[jobKey]) jobFailureCount[jobKey] = 0;
                    if (jobFailureCount[jobKey] >= 2) {
                        $.writeln("File bá»‹ stuck (fail 2+ láº§n): " + file.fsName);
                        moveFileToErrorFolder(file, errorFolder);
                        pendingJobs.splice(j, 1);
                        delete jobFailureCount[jobKey];
                        j--;
                        continue;
                    }

                    try {
                        var masterLayerName = makeUniqueLayerName(
                            doc,
                            AUTO_LAYER_PREFIX + info.id + " - " + info.sizeText + " - master - STT " + info.stt
                        );

                        var masterGroup = createArtworkWithInvert(
                            doc,
                            file,
                            masterLayerName,
                            info.targetSizePt,
                            info.inch,
                            ACTION_SET,
                            ACTION_MERGE,
                            ACTION_UNITE,
                            info.isSll
                        );

                        if (masterGroup === null) {
                            moveFileToErrorFolder(file, errorFolder);
                            pendingJobs.splice(j, 1);
                            delete jobFailureCount[jobKey];
                            j--;
                            continue;
                        }

                        try {
                            masterGroup.layer.visible = false;
                        } catch (e) { }

                        var ok = placeQuantityCopiesOneByOne(doc, masterGroup, file, info);

                        try {
                            masterGroup.layer.locked = false;
                            masterGroup.layer.visible = true;
                            masterGroup.layer.remove();
                        } catch (e) { }

                        if (ok) {
                            pendingJobs.splice(j, 1);
                            delete jobFailureCount[jobKey];
                            j--;
                            placedSomethingThisRound = true;

                            if (currentSheetDoneFiles.length >= MAX_IMAGES_BEFORE_WAIT) {
                                $.writeln("Reached wait threshold: " + currentSheetDoneFiles.length + " images. Saving as wait and closing app.");
                                saveCurrentSheetAs(doc, outFolder, currentSheetIds, waitMetaFolder, doneFolder, true, info.inch);
                                stoppedByUser = true;
                                break;
                            }

                            continue;
                        }

                        // KhÃ´ng fit thÃ¬ increment fail counter
                        jobFailureCount[jobKey]++;
                        blockedSizeKeys[sizeKey] = true;
                        $.writeln("Skip size on current sheet (no fit): " + info.sizeText + " | " + file.name);

                        // NÃªu size <= 1.5in hoặc 2.5in khÃ´ng fit thÃ¬ save ngay vÃ  dá»«ng
                        if (info.inch <= 1.5 || Math.abs(info.inch - 2.5) < 0.01) {
                            $.writeln("Size " + info.sizeText + " khÃ´ng fit, save ngay vÃ  dá»«ng.");

                            if (currentSheetIds.length > 0) {
                                saveCurrentSheetAs(doc, outFolder, currentSheetIds, waitMetaFolder, doneFolder);
                            }

                            stoppedByUser = true;
                            break;
                        }
                        // GiÆ°ỡ láº¡i, thá»­ file nháº» hÆ¡n tiáº¿p theo
                        continue;

                    } catch (errJob) {
                        $.writeln("File lá»—i: " + file.fsName + " | " + getErrorMessage(errJob));
                        jobFailureCount[jobKey]++;
                        // KhÃ´ng xÃ³a ngay, Ä‘á»ƒ vÃ²ng for tiáº¿p tá»¥c thá»­ file khÃ¡c
                        continue;
                    }
                }

                // Reset failure count khi báº¯t Ä‘áº§u vÃ²ng láº·p má»›i
                jobFailureCount = {};

                writeWorkNote(currentJobName, [String(info.id)]);
                // ÄÃ£ thá»­ háº¿t mÃ  khÃ´ng file nÃ o fit ná»¯a thÃ¬ má»›i save sheet
                if (!placedSomethingThisRound) {
                    if (currentSheetIds.length > 0) {
                        saveCurrentSheetAs(doc, outFolder, currentSheetIds, waitMetaFolder, doneFolder);

                        stoppedByUser = true;
                        break;
                    } else {
                        // KhÃ´ng cÃ³ artwork nÃ o fit thÃ¬ giá»¯ nguyÃªn file trong sticker folder Ä‘á»ƒ lÆ°á»£t sau cháº¡y tiáº¿p
                        $.writeln("KhÃ´ng cÃ³ artwork nÃ o fit vÃ o sheet. Giá»¯ nguyÃªn file trong sticker folder Ä‘á»ƒ láº§n cháº¡y sau thá»­ láº¡i.");
                        stoppedByUser = true;
                        break;
                    }
                }
            }
            /**
             * placeQuantityCopiesOneByOne
             * - Sao chép `sourceGroup` theo số lượng `info.qty`.
             * - Với mỗi copy: tạo layer, duplicate group, gọi placeArtworkNow để đặt lên sheet.
             * - Nếu một copy không fit: xóa layer copy đó, dừng vòng copy, queue số lượng còn lại để xử lý sau.
             * - Trả về true nếu đã đặt ít nhất 1 copy; false nếu không đặt được copy nào.
             */
            function placeQuantityCopiesOneByOne(doc, sourceGroup, file, info) {
                var quantity = info && info.qty ? info.qty : 1;
                var placedThisFile = 0;

                for (var copyIndex = 1; copyIndex <= quantity; copyIndex++) {

                    var copyLayerName = makeUniqueLayerName(
                        doc,
                        AUTO_LAYER_PREFIX + info.id + " - " + info.sizeText + " - qty " + copyIndex + " of " + info.qty + " - STT " + info.stt
                    );

                    var copyLayer = doc.layers.add();
                    copyLayer.name = copyLayerName;

                    var copiedGroup = sourceGroup.duplicate(copyLayer, ElementPlacement.PLACEATBEGINNING);

                    try {
                        copyLayer.visible = true;
                    } catch (e) { }

                    var artwork = {
                        group: copiedGroup,
                        layer: copyLayer,
                        info: info,
                        file: file,
                        copyIndex: copyIndex
                    };

                    var ok = placeArtworkNow(artwork);

                    if (!ok) {
                        try {
                            copyLayer.locked = false;
                            copyLayer.visible = true;
                            copyLayer.remove();
                        } catch (e) { }

                        break;
                    }

                    placedThisFile++;
                }
                if (placedThisFile > 0) {
                    var remainQty = quantity - placedThisFile;

                    queueDoneFileForCurrentSheet(file, info, placedThisFile, remainQty);

                    return true;
                }

                return false;
            }


            /**
             * placeArtworkNow
             * - Thực hiện gọi packer.place để đặt artwork lên sheet.
             * - Nếu packer không trả vị trí (không fit): xóa layer và trả false.
             * - Nếu fit: ungroup tạm, di chuyển cut paths (die/kiss), ghi ID vào sheet và trả true.
             */
            function placeArtworkNow(artwork) {
                var finalGroup = artwork.group;

                while (true) {
                    try {
                        artwork.layer.visible = true;
                    } catch (showErr) { }

                    if (packer.place(finalGroup)) {
                        break;
                    }

                    try {
                        artwork.layer.visible = false;
                    } catch (hideAgainErr) { }
                    try {
                        artwork.layer.visible = false;
                        artwork.layer.locked = false;
                        artwork.layer.remove();
                    } catch (e) { }



                    return false;

                }

                ungroupTempFinalGroup(doc, finalGroup);

                try {
                    moveCutPathsToTargetLayers(doc, artwork.layer);
                } catch (moveErr) { }

                // currentSheetIds.push(artwork.info.id);
                pushUniqueCurrentSheetId(artwork.info.id);
                currentSheetLayers.push(artwork.layer);
                placedCopyCount++;
                placedOnSheetCount++;
                return true;
            }

            /**
             * markFileAsError
             * - Ghi file vào failedFileKeys
             * - Nếu targetLayer tồn tại: cố gắng xóa layer (cleanup)
             * - Gọi moveFileToErrorFolder để di chuyển file nguồn sang IMAGE_ERROR_FOLDER
             */
            function markFileAsError(file, targetLayer) {
                try {
                    failedFileKeys[getFileKey(file)] = true;

                    if (targetLayer) {
                        try {
                            targetLayer.locked = false;
                            targetLayer.visible = true;
                            targetLayer.remove();
                        } catch (e) { }
                    }

                    moveFileToErrorFolder(file, errorFolder);

                } catch (err) {
                    $.writeln("Mark error tháº¥t báº¡i: " + getErrorMessage(err));
                }
            }
            function archivePlacedSheetLayers(doc, layers) {
                if (!layers || layers.length === 0) return;

                var archiveLayer = getOrCreateLayer(doc, "__ARCHIVE_SHEETS__");

                for (var i = 0; i < layers.length; i++) {
                    try {
                        if (!layers[i]) continue;
                        layers[i].locked = false;
                        layers[i].visible = true;
                        layers[i].move(archiveLayer, ElementPlacement.PLACEATBEGINNING);
                    } catch (e) { }
                }

                // Packer bá» qua object á»Ÿ hidden layer, giÃºp tá» má»›i khÃ´ng bá»‹ xem lÃ  Ä‘Ã£ Ä‘áº§y.
                try {
                    archiveLayer.visible = false;
                } catch (e) { }
            }

            function removePreviewLayer(doc) {
                try {
                    var previewLayer = doc.layers[PREVIEW_LAYER_NAME];
                    if (previewLayer) {
                        previewLayer.locked = false;
                        previewLayer.visible = true;
                        previewLayer.remove();
                    }
                } catch (e) { }
            }

            function clearUnlockedPageItems(doc) {
                // Giá»¯ láº¡i object khÃ³a (khung/template), xÃ³a toÃ n bá»™ object khÃ´ng khÃ³a Ä‘á»ƒ tá» má»›i sáº¡ch.
                for (var li = 0; li < doc.layers.length; li++) {
                    var layer = null;

                    try {
                        layer = doc.layers[li];
                    } catch (e) {
                        continue;
                    }

                    if (!layer) continue;

                    for (var pi = layer.pageItems.length - 1; pi >= 0; pi--) {
                        try {
                            var it = layer.pageItems[pi];
                            if (!it.locked) {
                                it.remove();
                            }
                        } catch (e) { }
                    }
                }
            }

            if (currentSheetIds.length > 0) {
                saveCurrentSheetAs(doc, outFolder, currentSheetIds, waitMetaFolder, doneFolder);

                if (SHOULD_CLOSE_AFTER_SAVE) {
                    try {
                        app.userInteractionLevel = OLD_USER_INTERACTION_LEVEL;
                    } catch (e) { }

                    try {
                        doc.close(SaveOptions.DONOTSAVECHANGES);
                    } catch (e) { }

                    try {
                         app.quit();
                    } catch (e) { }

                    return;
                }
            }

            doc.selection = null;
            app.userInteractionLevel = OLD_USER_INTERACTION_LEVEL;





        } catch (e) {
            removeWorkNote();
            try { app.userInteractionLevel = OLD_USER_INTERACTION_LEVEL; } catch (restoreErr) { }
        }

        /**
         * createArtworkCore
         * Mục đích: thực hiện quy trình xử lý ảnh thành artwork trên một layer tạm.
         * Tham số:
         *  - doc: activeDocument
         *  - file: File ảnh nguồn
         *  - layerName: tên layer tạm để chứa ảnh và các thao tác trung gian
         *  - targetSize, inch: kích thước mục tiêu để resize
         *  - actionSet/actionMerge/actionUnite: tên action group dùng cho merge/unite
         *  - useInvert: nếu true thì thực hiện bước invert trước trace
         * Trả về: GroupItem cuối cùng (finalGroup) nếu thành công.
         * Lỗi: ném (throw) khi có bước không đạt trạng thái mong muốn — caller quyết định retry hoặc xếp vào lỗi.
         */
        function createArtworkCore(doc, file, layerName, targetSize, inch, actionSet, actionMerge, actionUnite, useInvert) {
            var created = null;

            try {
                created = createLayerAndPlace(doc, file, layerName);

                return processPlacedImageOnActiveLayer(
                    doc,
                    file,
                    created.layer,
                    created.placed,
                    targetSize,
                    inch,
                    actionSet,
                    actionMerge,
                    actionUnite,
                    useInvert
                );
            } catch (err) {
                try {
                    if (created && created.layer) created.layer.remove();
                } catch (cleanupErr) { }

                throw err;
            }
        }

        /**
         * createArtworkWithoutInvert
         * - Wrapper gọi createArtworkCore với useInvert = false.
         * - Nếu có lỗi sẽ bắt và trả null để caller hiểu đây là lỗi "cứng" (được move sang image_error).
         */
        function createArtworkWithoutInvert(doc, file, layerName, targetSize, inch, actionSet, actionMerge, actionUnite, isSll) {
            try {
                return createArtworkCore(
                    doc,
                    file,
                    layerName,
                    targetSize,
                    inch,
                    actionSet,
                    actionMerge,
                    actionUnite,
                    false
                );
            } catch (err) {
                try {
                    $.writeln("No-invert run failed for file: " + file.fsName + " | " + getErrorMessage(err));
                } catch (logErr) { }

                return null;
            }
        }

        /**
         * createArtworkWithInvert
         * - Entry chính: thử chạy toàn bộ flow với invert (useInvert = true).
         * - Nếu lỗi: ghi log và gọi createArtworkWithoutInvert làm fallback.
         * - Nếu fallback trả null => file được coi là lỗi và caller sẽ move file sang image_error.
         */
        function createArtworkWithInvert(doc, file, layerName, targetSize, inch, actionSet, actionMerge, actionUnite, isSll) {
            try {
                return createArtworkCore(
                    doc,
                    file,
                    layerName,
                    targetSize,
                    inch,
                    actionSet,
                    actionMerge,
                    actionUnite,
                    true
                );
            } catch (err) {
                try {
                    $.writeln("Retry without invert for file: " + file.fsName + " | " + getErrorMessage(err));
                } catch (logErr) { }

                var retryLayerName = makeUniqueLayerName(doc, layerName + " - retry no invert");
                return createArtworkWithoutInvert(
                    doc,
                    file,
                    retryLayerName,
                    targetSize,
                    inch,
                    actionSet,
                    actionMerge,
                    actionUnite,
                    isSll
                );
            }
        }

        /**
         * createLayerAndPlace
         * - Tạo layer mới đặt ảnh ở vị trí chuẩn và chọn nó.
         * - Trả về: { layer, placed }
         * - Nếu không tạo/placed được, lỗi sẽ ném lên caller.
         */
        function createLayerAndPlace(doc, file, layerName) {
            var layer = doc.layers.add();
            layer.name = makeUniqueLayerName(doc, layerName);
            doc.activeLayer = layer;

            var placed = doc.placedItems.add();
            placed.file = file;
            placed.position = [0, 0];

            doc.selection = null;
            placed.selected = true;
            safeRedraw();
            fastSleep(400);

            return {
                layer: layer,
                placed: placed
            };
        }

        function safeRedraw(force) {
            if (force || !FAST_MODE) {
                try {
                    app.redraw();
                } catch (e) { }
            }
        }

        function fastSleep(ms) {
            var t = FAST_MODE ? Math.max(MIN_SLEEP, Math.round(ms * SLEEP_SCALE)) : ms;
            $.sleep(t);
        }
        function debugStep(stepName, doc, targetLayer) {
            if (!DEBUG_STEP_MODE) return;

            try {
                if (targetLayer) {
                    targetLayer.visible = true;
                    targetLayer.locked = false;
                    doc.activeLayer = targetLayer;
                }

                doc.selection = null;
                app.redraw();
            } catch (e) { }

            var r = confirm(
                "ĐÃ XONG BƯỚC: " + stepName + "\n\n" +
                "Bấm OK để chạy bước tiếp theo.\n" +
                "Bấm Cancel để dừng lại xem file."
            );

            if (!r) {
                throw new Error("__USER_STOP_DEBUG__ Dừng tại bước: " + stepName);
            }
        }
        function safeJsonStringifyRects(rects) {
            if (typeof JSON !== "undefined" && JSON.stringify) {
                return JSON.stringify(rects, null, 2);
            }

            if (!rects || !rects.length) return "[]";

            var parts = [];
            for (var i = 0; i < rects.length; i++) {
                var r = rects[i];
                parts.push(
                    '{"x":' + Number(r.x) +
                    ',"y":' + Number(r.y) +
                    ',"w":' + Number(r.w) +
                    ',"h":' + Number(r.h) + '}'
                );
            }
            return '[\n' + parts.join(',\n') + '\n]';
        }

        function safeJsonParseRects(jsonText) {
            if (!jsonText) return null;

            if (typeof JSON !== "undefined" && JSON.parse) {
                var parsed = JSON.parse(jsonText);
                return parsed && parsed.length ? parsed : [];
            }

            var rects = [];
            var re = /\{\s*"x"\s*:\s*([-0-9.]+)\s*,\s*"y"\s*:\s*([-0-9.]+)\s*,\s*"w"\s*:\s*([-0-9.]+)\s*,\s*"h"\s*:\s*([-0-9.]+)\s*\}/g;
            var m;
            while ((m = re.exec(jsonText)) !== null) {
                rects.push({
                    x: parseFloat(m[1]),
                    y: parseFloat(m[2]),
                    w: parseFloat(m[3]),
                    h: parseFloat(m[4])
                });
            }
            return rects;
        }

        function readWaitMetaJson(waitMetaFolder, baseName, maxInch) {
            try {
                if (!waitMetaFolder || !waitMetaFolder.exists) return null;

                var sizePart = String(maxInch).replace(".", "_");
                var metaFile = new File(waitMetaFolder.fsName + "/" + waitArtifactBaseName(baseName, maxInch) + ".json");
                if (!metaFile.exists) {
                    metaFile = new File(waitMetaFolder.fsName + "/" + baseName + "_wait_" + sizePart + ".json");
                }
                if (!metaFile.exists) return null;

                if (!metaFile.open("r")) {
                    throw new Error("Cannot open meta file for read: " + metaFile.fsName);
                }

                metaFile.encoding = "UTF-8";
                var jsonText = metaFile.read();
                metaFile.close();

                if (!jsonText) return null;

                var parsed = safeJsonParseRects(jsonText);
                return (parsed && parsed.length) ? parsed : null;
            } catch (e) {
                $.writeln("Error reading wait-meta.json: " + getErrorMessage(e));
                return null;
            }
        }

        function mergeUsedRects(oldRects, newRects) {
            var merged = [];
            var seen = {};

            function rectKey(r) {
                return r.x + "," + r.y + "," + r.w + "," + r.h;
            }

            if (oldRects && oldRects.length) {
                for (var i = 0; i < oldRects.length; i++) {
                    var key = rectKey(oldRects[i]);
                    if (!seen[key]) {
                        merged.push(oldRects[i]);
                        seen[key] = true;
                    }
                }
            }

            if (newRects && newRects.length) {
                for (var j = 0; j < newRects.length; j++) {
                    var key2 = rectKey(newRects[j]);
                    if (!seen[key2]) {
                        merged.push(newRects[j]);
                        seen[key2] = true;
                    }
                }
            }

            return merged;
        }

        function readNoteFileIds(folder, baseName) {
            try {
                var txtFile = new File(folder.fsName + "/" + baseName + ".txt");
                if (!txtFile.exists) return [];

                if (!txtFile.open("r")) return [];

                txtFile.encoding = "UTF-8";
                var content = txtFile.read();
                txtFile.close();

                if (!content) return [];

                var ids = content.split(",");
                var result = [];
                var seen = {};
                for (var i = 0; i < ids.length; i++) {
                    var id = ids[i].trim();
                    if (id && !seen[id]) {
                        result.push(id);
                        seen[id] = true;
                    }
                }
                return result;
            } catch (e) {
                return [];
            }
        }

        function writeWaitMetaJsonByFileName(waitMetaFolder, fileNameNoExtension, usedRects) {
            if (!waitMetaFolder.exists) {
                if (!waitMetaFolder.create()) {
                    throw new Error("Cannot create wait-meta folder: " + waitMetaFolder.fsName);
                }
            }

            var metaFile = new File(waitMetaFolder.fsName + "/" + fileNameNoExtension + ".json");
            var jsonText = safeJsonStringifyRects(usedRects);

            if (!metaFile.open("w")) {
                throw new Error("Cannot open meta file for write: " + metaFile.fsName);
            }

            metaFile.encoding = "UTF-8";
            metaFile.write(jsonText);
            metaFile.close();

            if (!metaFile.exists) {
                throw new Error("Meta file was not created: " + metaFile.fsName);
            }
        }

        function writeWaitMetaJson(waitMetaFolder, baseName, maxInch, usedRects) {
            var fileNameNoExtension = waitArtifactBaseName(baseName, maxInch);
            return writeWaitMetaJsonByFileName(waitMetaFolder, fileNameNoExtension, usedRects);
        }

        function deleteWaitMetaJson(waitMetaFolder, baseName, maxInch) {
            try {
                if (!waitMetaFolder || !waitMetaFolder.exists) return;

                var sizePart = String(maxInch).replace(".", "_");
                var metaFile = new File(waitMetaFolder.fsName + "/" + waitArtifactBaseName(baseName, maxInch) + ".json");
                var legacyMetaFile = new File(waitMetaFolder.fsName + "/" + baseName + "wait" + sizePart + ".json");

                if (metaFile.exists) {
                    var removed = metaFile.remove();
                    if (!removed) {
                        throw new Error("Cannot remove wait-meta file: " + metaFile.fsName);
                    }
                }

                if (legacyMetaFile.exists) {
                    var removedLegacy = legacyMetaFile.remove();
                    if (!removedLegacy) {
                        throw new Error("Cannot remove legacy wait-meta file: " + legacyMetaFile.fsName);
                    }
                }
            } catch (e) {
                $.writeln("Warning: Cannot delete wait-meta.json - " + getErrorMessage(e));
            }
        }

        function saveCurrentSheetAs(doc, outFolder, idList, waitMetaFolder, doneFolder, forceWaitSave, waitInchOverride) {
            if (!outFolder.exists) outFolder.create();
            if (!noteDoneFolder.exists) noteDoneFolder.create();
            if (!waitFolder.exists) waitFolder.create();
            if (waitMetaFolder && !waitMetaFolder.exists) waitMetaFolder.create();

            var baseName = RUN_WAIT_MODE ? WAIT_BASE_NAME : WAIT_FILE_PREFIX;
            var waitInfo = getWaitInfo(packer);
            var isWaitSave = (forceWaitSave === true) || (waitInfo && waitInfo.count > 0);

            if (forceWaitSave && !waitInfo) {
                waitInfo = {
                    inch: waitInchOverride || 1.5,
                    count: currentSheetDoneFiles.length
                };
            }

            // Compute saveBaseName early so it can be used consistently for both .ai file and .json meta file
            var saveFolder = isWaitSave ? waitFolder : outFolder;
            var saveBaseName = baseName;
            if (isWaitSave) {
                saveBaseName = waitArtifactBaseName(baseName, waitInfo.inch);
            }

            // When resuming wait mode, update wait-meta.json immediately to save current usedRects state
            // Use saveBaseName so JSON name matches .ai file name (only extension differs)
            if (RUN_WAIT_MODE && isWaitSave && waitInfo) {
                try {
                    var usedRectsNow = packer.getUsedRects();
                    writeWaitMetaJsonByFileName(waitMetaFolder, saveBaseName, usedRectsNow);
                    $.writeln("Resume wait: updated wait-meta immediately with current usedRects");
                } catch (earlyMetaErr) {
                    $.writeln("Warning: could not update wait-meta early: " + getErrorMessage(earlyMetaErr));
                }
            }

            var outFile = isWaitSave
                ? new File(saveFolder.fsName + "/" + saveBaseName + ".ai")
                : uniqueAiFile(saveFolder, saveBaseName);

            var opts = new IllustratorSaveOptions();
            opts.compatibility = Compatibility.ILLUSTRATOR17;
            opts.pdfCompatible = true;

            doc.selection = null;

            // When resuming in wait mode, merge old data and clean up obsolete files
            if (RUN_WAIT_MODE && isWaitSave && WAIT_BASE_NAME && WAIT_MAX_INCH) {
                try {
                    // Merge usedRects from old JSON (if size changed) with new usedRects
                    var oldSizePart = String(WAIT_MAX_INCH).replace(".", "_");
                    var oldMetaFileName = waitArtifactBaseName(WAIT_BASE_NAME, WAIT_MAX_INCH) + ".json";
                    var oldMetaFile = new File(waitMetaFolder.fsName + "/" + oldMetaFileName);

                    if (oldMetaFile.exists && oldSizePart !== String(waitInfo.inch).replace(".", "_")) {
                        var oldUsedRects = readWaitMetaJson(waitMetaFolder, WAIT_BASE_NAME, WAIT_MAX_INCH);
                        var newUsedRects = packer.getUsedRects();
                        var mergedRects = mergeUsedRects(oldUsedRects, newUsedRects);

                        // Write merged rects with NEW size name
                        writeWaitMetaJsonByFileName(waitMetaFolder, saveBaseName, mergedRects);
                        $.writeln("Merged usedRects from old size " + WAIT_MAX_INCH + " to new size " + waitInfo.inch);
                    }
                } catch (metaMergeErr) {
                    $.writeln("Warning: could not merge wait-meta: " + getErrorMessage(metaMergeErr));
                }

                try {
                    // Merge note IDs from old file (if size changed) with new IDs
                    var oldNoteBaseName = waitArtifactBaseName(WAIT_BASE_NAME, WAIT_MAX_INCH);
                    var oldNoteFile = new File(noteDoneFolder.fsName + "/" + oldNoteBaseName + ".txt");

                    if (oldNoteFile.exists && String(WAIT_MAX_INCH).replace(".", "_") !== String(waitInfo.inch).replace(".", "_")) {
                        var oldIds = readNoteFileIds(noteDoneFolder, oldNoteBaseName);
                        var allIds = (oldIds && oldIds.length > 0) ? oldIds.concat(idList) : idList;

                        // Will be written later with NEW size name by writeDoneNoteFile
                        var idListToWrite = allIds;
                    } else {
                        var idListToWrite = idList;
                    }
                } catch (noteMergeErr) {
                    $.writeln("Warning: could not merge note file: " + getErrorMessage(noteMergeErr));
                    var idListToWrite = idList;
                }
            } else {
                var idListToWrite = idList;
            }

            // If done mode (not wait) but came from wait resume, merge old note IDs into final note
            if (!isWaitSave && RUN_WAIT_MODE && WAIT_BASE_NAME && WAIT_MAX_INCH) {
                try {
                    var oldNoteBaseName = waitArtifactBaseName(WAIT_BASE_NAME, WAIT_MAX_INCH);
                    var oldIds = readNoteFileIds(noteDoneFolder, oldNoteBaseName);
                    if (oldIds && oldIds.length > 0) {
                        idListToWrite = oldIds.concat(idListToWrite);
                        $.writeln("Merged note file IDs from wait mode into final note");
                    }
                } catch (noteMergeErr) {
                    $.writeln("Warning: could not merge old note into final note: " + getErrorMessage(noteMergeErr));
                }
            }

            if (isWaitSave && outFile.exists) {
                try { outFile.remove(); } catch (removeErr) { }
            }

            if (isWaitSave && waitInfo) {
                try {
                    var usedRectsToSave = packer.getUsedRects();
                    writeWaitMetaJsonByFileName(waitMetaFolder, saveBaseName, usedRectsToSave);
                    $.writeln("Saved wait-meta before saveAs: " + saveBaseName + ".json");
                } catch (metaErr) {
                    throw new Error("Cannot save wait-meta.json before saveAs: " + getErrorMessage(metaErr));
                }
            }

            var reservedLayers = hideReservedLayersForSave(doc, saveFolder, outFolder);

            try {
                doc.saveAs(outFile, opts);
            } finally {
                restoreReservedLayersVisibility(reservedLayers);
            }

            removeWorkNote();
            SHOULD_CLOSE_AFTER_SAVE = true;

            var finalBaseName = stripExt(outFile.name);
            writeDoneNoteFile(noteDoneFolder, finalBaseName, idListToWrite);

            // Move queued done files before closing
            try {
                if (typeof moveQueuedDoneFiles === 'function') {
                    moveQueuedDoneFiles(doneFolder);
                }
            } catch (e) { $.writeln("Warning moving queued done files: " + getErrorMessage(e)); }

            // Close doc before renaming files
            try {
                app.userInteractionLevel = OLD_USER_INTERACTION_LEVEL;
            } catch (e) { }

            try {
                doc.close(SaveOptions.DONOTSAVECHANGES);
            } catch (e) { }

            // After closing doc, cleanup old files if size changed during wait resume
            // (don't copy, just delete - merged data already written by writeDoneNoteFile)
            if (RUN_WAIT_MODE && isWaitSave && WAIT_BASE_NAME && WAIT_MAX_INCH) {
                var oldFileBaseName = waitArtifactBaseName(WAIT_BASE_NAME, WAIT_MAX_INCH);
                if (oldFileBaseName !== saveBaseName) {
                    $.writeln("=== CLEANUP OLD WAIT FILES ===");
                    $.writeln("Old: " + oldFileBaseName + " -> New: " + saveBaseName);

                    try {
                        // Delete old .ai file (saveAs created new one with new name)
                        var oldAiFile = new File(waitFolder.fsName + "/" + oldFileBaseName + ".ai");
                        $.writeln("Check old .ai: " + oldAiFile.fsName + " exists=" + oldAiFile.exists);
                        if (oldAiFile.exists) {
                            oldAiFile.remove();
                            $.writeln("Deleted old .ai");
                        }
                    } catch (e) { $.writeln("ERROR delete .ai: " + getErrorMessage(e)); }

                    try {
                        // Delete old JSON file (merged data already saved to new JSON before saveAs)
                        var oldJsonFile = new File(waitMetaFolder.fsName + "/" + oldFileBaseName + ".json");
                        $.writeln("Check old JSON: " + oldJsonFile.fsName + " exists=" + oldJsonFile.exists);
                        if (oldJsonFile.exists) {
                            oldJsonFile.remove();
                            $.writeln("Deleted old JSON");
                        }
                    } catch (e) { $.writeln("ERROR delete JSON: " + getErrorMessage(e)); }

                    try {
                        // Delete old TXT file (merged data already written by writeDoneNoteFile)
                        var oldTxtFile = new File(noteDoneFolder.fsName + "/" + oldFileBaseName + ".txt");
                        $.writeln("Check old TXT: " + oldTxtFile.fsName + " exists=" + oldTxtFile.exists);
                        if (oldTxtFile.exists) {
                            oldTxtFile.remove();
                            $.writeln("Deleted old TXT");
                        }
                    } catch (e) { $.writeln("ERROR delete TXT: " + getErrorMessage(e)); }

                    $.writeln("=== CLEANUP COMPLETE ===");
                }
            }

            // Wait file management logic:
            // 1. If isWaitSave=false (done): delete ALL wait files (.ai, .txt, .json) - we're done
            // 2. If isWaitSave=true (wait): delete old sizes, keep current size for next run

            if (!isWaitSave) {
                // Done mode: clean up all wait files for this baseName
                if (RUN_WAIT_MODE && WAIT_BASE_NAME) {
                    try {
                        // Delete ALL wait .ai files for this baseName
                        var waitFilesInFolder = waitFolder.getFiles();
                        if (waitFilesInFolder && waitFilesInFolder.length > 0) {
                            for (var idx = 0; idx < waitFilesInFolder.length; idx++) {
                                var f = waitFilesInFolder[idx];
                                if (!(f instanceof File)) continue;
                                var fname = f.name;
                                if (isWaitArtifactName(fname, WAIT_BASE_NAME)) {
                                    try { f.remove(); } catch (re) { }
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        // Delete ALL wait-meta JSON files for this baseName (meta not needed when done)
                        var metaFilesInFolder = waitMetaFolder.getFiles();
                        if (metaFilesInFolder && metaFilesInFolder.length > 0) {
                            for (var jdx = 0; jdx < metaFilesInFolder.length; jdx++) {
                                var mf = metaFilesInFolder[jdx];
                                if (!(mf instanceof File)) continue;
                                var mfname = mf.name;
                                if (isWaitArtifactName(mfname, WAIT_BASE_NAME)) {
                                    try { mf.remove(); } catch (me) { }
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        // Delete ALL wait note_done files for this baseName (replaced with final done note)
                        var noteFilesInFolder = noteDoneFolder.getFiles();
                        if (noteFilesInFolder && noteFilesInFolder.length > 0) {
                            for (var ndx = 0; ndx < noteFilesInFolder.length; ndx++) {
                                var nf = noteFilesInFolder[ndx];
                                if (!(nf instanceof File)) continue;
                                var nfname = nf.name;
                                if (isWaitArtifactName(nfname, WAIT_BASE_NAME)) {
                                    try { nf.remove(); } catch (ne) { }
                                }
                            }
                        }
                    } catch (e) { }
                }

                // Also delete original wait source file if it exists
                if (RUN_WAIT_MODE && WAIT_SOURCE_FILE && WAIT_SOURCE_FILE.exists) {
                    try { WAIT_SOURCE_FILE.remove(); } catch (e) { }
                }

                $.writeln("Wait completed: all wait files deleted, result moved to output_ai");
            } else {
                // Wait mode: delete old sizes, keep current size for next resume
                if (RUN_WAIT_MODE && WAIT_BASE_NAME && WAIT_MAX_INCH) {
                    try {
                        // Delete old wait .ai files (but NOT the new saveBaseName file we just created)
                        var waitFilesInFolder2 = waitFolder.getFiles();
                        if (waitFilesInFolder2 && waitFilesInFolder2.length > 0) {
                            for (var idx2 = 0; idx2 < waitFilesInFolder2.length; idx2++) {
                                var f2 = waitFilesInFolder2[idx2];
                                if (!(f2 instanceof File)) continue;
                                var fname2 = f2.name;
                                if (isWaitArtifactName(fname2, WAIT_BASE_NAME) && fname2 !== (saveBaseName + ".ai")) {
                                    $.writeln("Deleting old wait .ai: " + fname2);
                                    try { f2.remove(); } catch (re2) { }
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        // Delete old wait-meta JSON files (but NOT the new saveBaseName file)
                        var metaFilesInFolder2 = waitMetaFolder.getFiles();
                        if (metaFilesInFolder2 && metaFilesInFolder2.length > 0) {
                            for (var jdx2 = 0; jdx2 < metaFilesInFolder2.length; jdx2++) {
                                var mf2 = metaFilesInFolder2[jdx2];
                                if (!(mf2 instanceof File)) continue;
                                var mfname2 = mf2.name;
                                if (isWaitArtifactName(mfname2, WAIT_BASE_NAME) && mfname2 !== (saveBaseName + ".json")) {
                                    $.writeln("Deleting old wait .json: " + mfname2);
                                    try { mf2.remove(); } catch (me2) { }
                                }
                            }
                        }
                    } catch (e) { }

                    try {
                        // Delete old wait note_done files (but NOT the new saveBaseName file)
                        var noteFilesInFolder2 = noteDoneFolder.getFiles();
                        if (noteFilesInFolder2 && noteFilesInFolder2.length > 0) {
                            for (var ndx2 = 0; ndx2 < noteFilesInFolder2.length; ndx2++) {
                                var nf2 = noteFilesInFolder2[ndx2];
                                if (!(nf2 instanceof File)) continue;
                                var nfname2 = nf2.name;
                                if (isWaitArtifactName(nfname2, WAIT_BASE_NAME) && nfname2 !== (saveBaseName + ".txt")) {
                                    $.writeln("Deleting old wait .txt: " + nfname2);
                                    try { nf2.remove(); } catch (ne2) { }
                                }
                            }
                        }
                    } catch (e) { }
                }

                $.writeln("Saved as wait: keeping wait file and meta for next resume: " + saveBaseName + ".ai/.txt/.json");
            }

            // Ensure we stop further processing and close app immediately after save
            stoppedByUser = true;

            try {
               app.quit();
            } catch (e) { }

            return;
        }

        function hideReservedLayersForSave(doc, saveFolder, outFolder) {
            var layerNames = ["kiss", "die"];
            var states = [];
            var shouldHide = false;

            try {
                shouldHide = saveFolder && outFolder && saveFolder.fsName === outFolder.fsName;
            } catch (e) {
                shouldHide = false;
            }

            for (var i = 0; i < layerNames.length; i++) {
                try {
                    var layer = doc.layers[layerNames[i]];
                    if (!layer) continue;

                    states.push({ layer: layer, visible: layer.visible });
                    // Chỉ ẩn kiss/die khi lưu sang output_ai.
                    if (shouldHide) {
                        layer.visible = false;
                    }
                } catch (e) { }
            }

            return states;
        }

        function restoreReservedLayersVisibility(states) {
            if (!states) return;

            for (var i = 0; i < states.length; i++) {
                try {
                    states[i].layer.visible = states[i].visible;
                } catch (e) { }
            }
        }

        function getWaitInfo(packer) {
            var sizes = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2.5, 2, 1.5];
            var minWaitSize = 3;  // Chỉ WAIT nếu size >= 3

            for (var i = 0; i < sizes.length; i++) {
                var inch = sizes[i];
                var count = packer.countFitInch(inch);

                if (count > 0) {
                    // Chỉ return wait nếu size >= minWaitSize
                    if (inch >= minWaitSize) {
                        return {
                            inch: inch,
                            count: count
                        };
                    }
                    // Nếu fit nhưng size < minWaitSize, continue thử size khác
                }
            }

            return null;
        }

        function makeTimeFileName() {
            var d = new Date();

            var month = d.getMonth() + 1;
            var day = d.getDate();

            var hour = pad2(d.getHours());
            var minute = pad2(d.getMinutes());
            var second = pad2(d.getSeconds());
            var ms = d.getMilliseconds();
            return month + "_" + day + "_" + hour + "_" + minute + "_" + second + "_" + ms;
        }

        function makeDateTimeText() {
            var d = new Date();
            return d.getFullYear() + "-" +
                pad2(d.getMonth() + 1) + "-" +
                pad2(d.getDate()) + " " +
                pad2(d.getHours()) + ":" +
                pad2(d.getMinutes()) + ":" +
                pad2(d.getSeconds());
        }

        function makeDateTimeFilePart() {
            var d = new Date();
            return d.getFullYear() + "-" +
                pad2(d.getMonth() + 1) + "-" +
                pad2(d.getDate()) + "_" +
                pad2(d.getHours()) + "-" +
                pad2(d.getMinutes()) + "-" +
                pad2(d.getSeconds());
        }
        function writeWorkNote(jobName, idList) {
            var folder = new Folder(NOTEWORKFOLDER);
            if (!folder.exists) folder.create();

            var txtFile = new File(folder.fsName + "\\working.txt");
            txtFile.encoding = "UTF-8";
            txtFile.open("w");
            txtFile.write("Start: " + makeDateTimeText() + "\r\n");
            txtFile.write("Working: " + jobName + "\r\n");

            if (idList && idList.length > 0) {
                txtFile.write("IDs: " + idList.join(", ") + "\r\n");
            }

            txtFile.close();
            CURRENTWORKFILE = txtFile;
        }
        function removeWorkNote() {
            try {
                if (CURRENTWORKFILE && CURRENTWORKFILE.exists) {
                    CURRENTWORKFILE.remove();
                }
            } catch (e) { }
            CURRENTWORKFILE = null;
        }




        function writeDoneNoteFile(folder, baseName, idList) {
            var ids = [];
            var seen = {};

            for (var i = 0; i < idList.length; i++) {
                var id = safeFilePart(idList[i]);
                if (!id) continue;
                if (seen[id]) continue;

                seen[id] = true;
                ids.push(id);
            }

            var txtFile = new File(folder.fsName + "/" + baseName + ".txt");

            txtFile.encoding = "UTF-8";

            txtFile.open("w");
            txtFile.write(ids.join(","));
            txtFile.close();
        }

        function pad2(n) {
            return n < 10 ? "0" + n : String(n);
        }

        function ungroupTempFinalGroup(doc, finalGroup) {
            try {
                doc.selection = null;
                finalGroup.selected = true;
                app.executeMenuCommand("ungroup");
                doc.selection = null;
                fastSleep(80);
            } catch (e) { }
        }

        function moveCutPathsToTargetLayers(doc, sourceLayer) {
            var dieLayer = getOrCreateLayer(doc, "die");
            var kissLayer = getOrCreateLayer(doc, "kiss");

            var paths = [];

            function collectCutItems(item) {
                try {
                    if (!item) return;

                    if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
                        paths.push(item);
                        return;
                    }

                    if (item.typename === "GroupItem") {
                        for (var i = 0; i < item.pageItems.length; i++) {
                            collectCutItems(item.pageItems[i]);
                        }
                        return;
                    }

                    if (item.typename === "Layer") {
                        for (var j = 0; j < item.pageItems.length; j++) {
                            collectCutItems(item.pageItems[j]);
                        }
                    }
                } catch (e) { }
            }

            collectCutItems(sourceLayer);

            if (paths.length >= 1) {
                try {
                    paths[0].move(kissLayer, ElementPlacement.PLACEATBEGINNING);
                } catch (e) { }
            }

            if (paths.length >= 2) {
                try {
                    paths[1].move(dieLayer, ElementPlacement.PLACEATBEGINNING);
                } catch (e) { }
            }
        }

        function getOrCreateLayer(doc, layerName) {
            try {
                return doc.layers[layerName];
            } catch (e) {
                var l = doc.layers.add();
                l.name = layerName;
                return l;
            }
        }

        function makeIdFileName(idList) {
            var ids = [];
            var seen = {};

            for (var i = 0; i < idList.length; i++) {
                var id = safeFilePart(idList[i]);
                if (!id) continue;
                if (seen[id]) continue;

                seen[id] = true;
                ids.push(id);
            }

            var name = ids.join(",");
            if (name.length > 140) name = name.substring(0, 140);
            if (!name) name = "sheet";

            return name;
        }

        function getFileKey(file) {
            try {
                return file.fsName || file.name;
            } catch (e) {
                return String(file);
            }
        }

        function uniqueAiFile(outFolder, baseName) {
            var f = new File(outFolder.fsName + "/" + baseName + ".ai");
            var n = 2;

            while (f.exists) {
                f = new File(outFolder.fsName + "/" + baseName + " (" + n + ").ai");
                n++;
            }

            return f;
        }

        function safeFilePart(s) {
            return String(s)
                .replace(/[\\\/:*?"<>|]/g, "_")
                .replace(/^\s+|\s+$/g, "");
        }

        function removeLayersList(layers) {
            for (var i = layers.length - 1; i >= 0; i--) {
                try {
                    layers[i].locked = false;
                    layers[i].visible = true;
                    layers[i].remove();
                } catch (e) { }
            }

            if (doc.layers.length > 0) doc.activeLayer = doc.layers[0];
            safeRedraw();
        }

        function clearCutLayers(doc) {
            var layerNames = ["die", "kiss"];

            for (var i = 0; i < layerNames.length; i++) {
                var layer = null;

                try {
                    layer = doc.layers[layerNames[i]];
                } catch (e) {
                    continue;
                }

                if (!layer) continue;

                for (var pi = layer.pageItems.length - 1; pi >= 0; pi--) {
                    try {
                        var item = layer.pageItems[pi];

                        if (!item.locked) {
                            item.remove();
                        }
                    } catch (e) { }
                }
            }

            safeRedraw();
        }

        function parseFileName(fileName) {
            var cleanName = cleanFileName(fileName);
            var base = stripExt(cleanName);

            // ID: lấy số đầu tiên trước "_item"
            var idMatch = base.match(/^(\d+)_item/i);
            if (!idMatch) {
                throw new Error("Không đọc được ID từ file: " + fileName);
            }

            var id = idMatch[1];

            // SIZE: hỗ trợ 1in, 1.5in, 1,5in, 1-5in
            var sizeMatch = base.match(
                /sticker-vinyl-([0-9]+(?:[-.,][0-9]+)?)in/i
            );

            if (!sizeMatch) {
                throw new Error("Không đọc được size từ file: " + fileName);
            }
            var sizeText = sizeMatch[1]
                .replace(/-/g, ".")
                .replace(/,/g, ".");

            var inch = parseFloat(sizeText);

            // QTY: lấy qty_1, qty_20...
            var qtyMatch = base.match(/qty_(\d+)/i);
            if (!qtyMatch) {
                throw new Error("Không đọc được qty từ file: " + fileName);
            }

            var qty = parseInt(qtyMatch[1], 10);
            if (isNaN(qty) || qty < 1) qty = 1;

            // PACK: nếu có pack-3 thì qty = qty * pack
            var packMatch = base.match(/pack-(\d+)/i);
            var packQty = 1;

            if (packMatch) {
                packQty = parseInt(packMatch[1], 10);
                if (isNaN(packQty) || packQty < 1) packQty = 1;
            }

            qty = qty * packQty;

            // STT / ghi chú: lấy phần cuối sau _f1_
            var stt = "";
            var sttMatch = base.match(/_f\d+_(.+)$/i);
            if (sttMatch) {
                stt = sttMatch[1];
            }

            var isSll = /\bSLL\b/i.test(base);

            return {
                id: id,
                sizeText: inch + "in",
                inch: inch,
                qty: qty,
                stt: stt,
                isSll: isSll,
                targetSizePt: getCorrectedTargetPt(inch),
                base: base
            };
        }

        function parseInch(sizeText) {
            var s = cleanFileName(sizeText).toLowerCase();

            s = s.replace(/,/g, ".");
            s = s.replace(/\s/g, "");
            s = s.replace(/inch(es)?/g, "in");

            var m = s.match(/(\d+(?:\.\d+)?)in/);
            if (!m) m = s.match(/(\d+(?:\.\d+)?)/);
            if (!m) return NaN;

            return parseFloat(m[1]);
        }

        function logProcessStep(stepName, file, useInvert) {
            try {
                $.writeln(
                    "[process-step] " + stepName +
                    " | file=" + (file ? file.fsName : "") +
                    " | invert=" + (useInvert === false ? "false" : "true")
                );
            } catch (e) { }
        }

        function assertSelection(stepName, doc, minCount) {
            minCount = minCount || 1;

            if (!doc.selection || doc.selection.length < minCount) {
                throw new Error(stepName + ": selection not ready");
            }
        }

        function assertLayerItems(stepName, layer, minCount) {
            minCount = minCount || 1;

            if (!layer || !layer.pageItems || layer.pageItems.length < minCount) {
                throw new Error(stepName + ": no artwork on target layer");
            }
        }

        function waitArtifactBaseName(baseName, maxInch) {
            var sizePart = String(maxInch).replace(".", "_");
            return (baseName === "wait" || baseName === "wait_holo") ? baseName + "_" + sizePart : baseName + "_wait_" + sizePart;
        }

        function isWaitArtifactName(fileName, baseName) {
            var escapedBase = String(baseName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            var separator = (baseName === "wait" || baseName === "wait_holo") ? "_" : "_wait_";
            return new RegExp("^" + escapedBase + separator + "[0-9]+(?:_[0-9]+)?\\.(?:ai|json|txt)$", "i").test(String(fileName));
        }




        function processPlacedImageOnActiveLayer(doc, file, targetLayer, img, targetSize, inch, actionSet, actionMerge, actionUnite, useInvert) {
            function debugStep(stepName, inspectItem) {
                if (typeof DEBUG_STEP_MODE !== "undefined" && DEBUG_STEP_MODE === true) {
                    try {
                        targetLayer.visible = true;
                        targetLayer.locked = false;
                        doc.selection = null;
                        if (inspectItem) inspectItem.selected = true;
                        app.redraw();
                    } catch (e) { }

                    var ok = confirm(
                        "ĐÃ XONG BƯỚC: " + stepName + "\n\n" +
                        "Bấm OK để chạy bước tiếp theo.\n" +
                        "Bấm Cancel để dừng lại xem file."
                    );

                    if (!ok) {
                        throw new Error("__USER_STOP_DEBUG__ Dừng tại bước: " + stepName);
                    }
                }
            }

            doc.selection = null;
            img.selected = true;

            logProcessStep("embed", file, useInvert);
            img.embed();
            safeRedraw();
            fastSleep(500);
            assertSelection("embed", doc, 1);
            debugStep("1. Embed ảnh", doc.selection[0]);

            var raster = doc.selection[0];

            var imgCopy = raster.duplicate();
            safeRedraw();
            fastSleep(500);
            debugStep("2. Duplicate raster", imgCopy);

            doc.selection = null;
            imgCopy.selected = true;
            safeRedraw();
            fastSleep(1000);

            logProcessStep("colorBalance", file, useInvert);
            app.doScript("Adjust Color Balance Black", actionSet);
            safeRedraw();
            fastSleep(1000);
            assertSelection("colorBalance", doc, 1);
            debugStep("3. Adjust Color Balance Black", doc.selection[0]);

            logProcessStep("traceLazerSilhouette", file, useInvert);
            // This is intentionally the same sequence as Acrylic's
            // traceLazerSilhouette(): trace -> load Silhouettes -> redraw.
            var traceSource = doc.selection[0];
            var traceObj = traceSource.trace();
            app.redraw();
            $.sleep(2000);
            var tracingObject = traceObj.tracing;
            // Use the built-in Illustrator preset directly. The local Action
            // named Silhouettes only runs the default tracing command.
            var presetLoaded = tracingObject.tracingOptions.loadFromPreset("Silhouettes");
            if (presetLoaded !== true) {
                throw new Error("Không tìm thấy Image Trace preset Silhouettes.");
            }
            app.redraw();
            $.sleep(800);
            // Match Acrylic debugLazerStep: select the active PluginItem before
            // pausing, so Illustrator can display its real Trace preset.
            debugStep("4. Trace Lazer - Silhouettes", traceObj);

            logProcessStep("expandTracing", file, useInvert);
            var expandedTrace = tracingObject.expandTracing();
            fastSleep(3000);
            safeRedraw();
            if (expandedTrace === null) {
                throw new Error("Không thể Expand Image Trace Lazer.");
            }
            debugStep("5. Expand Trace Lazer", expandedTrace);

            var expandedSelection = doc.selection;

            if (!expandedSelection || expandedSelection.length === 0) {
                if (targetLayer.pageItems.length === 0) {
                    throw new Error("Không tìm thấy object sau Expand");
                }

                targetLayer.pageItems[0].selected = true;
                expandedSelection = doc.selection;
            }

            doc.selection = null;

            for (var i = 0; i < expandedSelection.length; i++) {
                expandedSelection[i].selected = true;
            }

            fastSleep(500);

            logProcessStep("merge", file, useInvert);
            app.doScript(actionMerge, actionSet);
            safeRedraw();
            fastSleep(500);
            debugStep("6. Merge");

            var mergedSelection = doc.selection;

            if (!mergedSelection || mergedSelection.length === 0) {
                if (targetLayer.pageItems.length === 0) {
                    throw new Error("Không tìm thấy object sau Merge");
                }

                targetLayer.pageItems[0].selected = true;
                mergedSelection = doc.selection;
            }

            doc.selection = null;

            for (var j = 0; j < mergedSelection.length; j++) {
                mergedSelection[j].selected = true;
            }

            fastSleep(500);

            logProcessStep("unite", file, useInvert);
            app.doScript(actionUnite, actionSet);
            fastSleep(2000);
            safeRedraw();
            debugStep("7. Unite");

            var unitedSelection = doc.selection;

            if (!unitedSelection || unitedSelection.length === 0) {
                if (targetLayer.pageItems.length === 0) {
                    throw new Error("Không tìm thấy object sau Unite");
                }

                targetLayer.pageItems[0].selected = true;
                unitedSelection = doc.selection;
            }

            var cmykRed = new CMYKColor();
            cmykRed.cyan = 0;
            cmykRed.magenta = 100;
            cmykRed.yellow = 100;
            cmykRed.black = 0;

            var item = unitedSelection[0];

            item.filled = true;
            item.fillColor = cmykRed;
            item.stroked = false;
            safeRedraw();

            var currentFill = item.fillColor;

            item.strokeColor = currentFill;
            item.fillColor = new NoColor();
            item.filled = false;
            item.stroked = true;
            item.strokeWidth = 0.25;
            safeRedraw();

            debugStep("8. Đổi path sang stroke đỏ");

            var offsetXML = '<LiveEffect name="Adobe Offset Path">' +
                '<Dict data="R mlim 4 R ofst -1 I jntp Round "/>' +
                '</LiveEffect>';

            item.applyEffect(offsetXML);
            safeRedraw();

            doc.selection = null;
            item.selected = true;
            fastSleep(500);

            logProcessStep("expandStyle", file, useInvert);
            app.executeMenuCommand("expandStyle");
            fastSleep(1000);
            safeRedraw();
            debugStep("9. Offset Path âm + Expand Style");

            var expandedItem = doc.selection[0];
            var duplicatedItem = expandedItem.duplicate();

            doc.selection = null;
            fastSleep(1000);
            debugStep("10. Duplicate path để tạo mask / die kiss");

            expandedItem.selected = true;
            raster.selected = true;
            duplicatedItem.selected = false;
            fastSleep(2000);

            app.executeMenuCommand("makeMask");
            fastSleep(1000);
            safeRedraw();
            debugStep("11. Make Clipping Mask");

            doc.selection = null;

            assertLayerItems("makeMask", targetLayer, 1);

            for (var k = 0; k < targetLayer.pageItems.length; k++) {
                targetLayer.pageItems[k].selected = true;
            }

            if (doc.selection.length > 0) {
                app.executeMenuCommand("group");
                var groupItem = doc.selection[0];

                var b = getClippingMaskBounds(groupItem);

                var width = Math.abs(b[2] - b[0]);
                var height = Math.abs(b[1] - b[3]);

                var longSide = Math.max(width, height);
                var scalePercent = (targetSize / longSide) * 100;

                groupItem.resize(
                    scalePercent,
                    scalePercent,
                    true,
                    true,
                    true,
                    true,
                    scalePercent
                );

                var b2 = getClippingMaskBounds(groupItem);
                var width2 = Math.abs(b2[2] - b2[0]);
                var height2 = Math.abs(b2[1] - b2[3]);
                var longSide2 = Math.max(width2, height2);

                var fixPercent = (targetSize / longSide2) * 100;

                groupItem.resize(
                    fixPercent,
                    fixPercent,
                    true,
                    true,
                    true,
                    true,
                    fixPercent
                );

                safeRedraw();
                debugStep("12. Resize theo clipping mask");

                app.executeMenuCommand("ungroup");
                doc.selection = null;
                targetLayer.hasSelectedArtwork = true;
                safeRedraw();
                debugStep("13. Ungroup sau resize");
            }

            doc.selection = null;

            if (targetLayer.pathItems.length > 0) {
                var firstPath = targetLayer.pathItems[0];

                firstPath.selected = true;
                firstPath.duplicate();

                doc.selection = null;
                firstPath.selected = true;

                var greenCMYK = new CMYKColor();
                greenCMYK.cyan = 75;
                greenCMYK.magenta = 0;
                greenCMYK.yellow = 100;
                greenCMYK.black = 0;

                firstPath.filled = false;
                firstPath.fillColor = new NoColor();
                firstPath.stroked = true;
                firstPath.strokeColor = greenCMYK;

                var offsetMM;

                if (inch >= 2 && inch < 4) {
                    offsetMM = 2.5;
                } else if (inch >= 4 && inch <= 20) {
                    offsetMM = inch;
                } else {
                    offsetMM = 2.5;
                }

                var offsetValue = offsetMM * 2.834645669;

                var offsetXML2 = '<LiveEffect name="Adobe Offset Path">' +
                    '<Dict data="R mlim 4 R ofst ' + offsetValue + ' I jntp Round "/>' +
                    '</LiveEffect>';

                firstPath.applyEffect(offsetXML2);
                safeRedraw();

                doc.selection = null;
                firstPath.selected = true;
                fastSleep(300);

                app.executeMenuCommand("expandStyle");
                fastSleep(500);
                safeRedraw();

                debugStep("14. Tạo đường xanh Die offset ngoài");
            }

            var check = hasRequiredItems(targetLayer);
            debugStep("15. Validation: Path=" + check.pathCount + " | ClipGroup=" + check.clipGroupCount);

            if (!check.ok) {
                try {
                    try {
                        targetLayer.locked = false;
                        targetLayer.visible = true;
                        targetLayer.remove();
                    } catch (removeErr) { }

                    $.writeln(
                        "Validation failed after full run: " + file.fsName +
                        " | Path: " + check.pathCount +
                        " | ClipGroup: " + check.clipGroupCount
                    );

                } catch (cleanupErr) {
                    $.writeln("Cleanup failed after validation error: " + getErrorMessage(cleanupErr));
                }

                throw new Error(
                    "Validation failed after full run. Path: " + check.pathCount +
                    ", ClipGroup: " + check.clipGroupCount
                );
            }

            var finalGroup = groupAllPageItemsInLayer(doc, targetLayer);

            if (!finalGroup) {
                throw new Error("Không group được artwork cuối cùng ở layer " + targetLayer.name);
            }

            doc.selection = null;
            debugStep("16. Group final artwork");

            return finalGroup;
        }

        function getClippingMaskBounds(item) {
            var found = null;

            function scan(obj) {
                if (found) return;

                try {
                    if (obj.typename === "GroupItem") {
                        if (obj.clipped) {
                            for (var i = 0; i < obj.pageItems.length; i++) {
                                var child = obj.pageItems[i];

                                if (child.typename === "PathItem" && child.clipping) {
                                    found = child.geometricBounds;
                                    return;
                                }
                            }
                        }

                        for (var g = 0; g < obj.pageItems.length; g++) {
                            scan(obj.pageItems[g]);
                        }
                    }
                } catch (e) { }
            }

            scan(item);

            if (found) return found;

            return item.geometricBounds;
        }
        function hasRequiredItems(layer) {
            var pathCount = 0;
            var clipGroupCount = 0;

            for (var i = 0; i < layer.pageItems.length; i++) {
                var item = layer.pageItems[i];

                if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
                    pathCount++;
                }

                if (item.typename === "GroupItem") {
                    try {
                        if (item.clipped) {
                            clipGroupCount++;
                        }
                    } catch (e) { }
                }
            }

            return {
                ok: pathCount >= 2 && clipGroupCount >= 1,
                pathCount: pathCount,
                clipGroupCount: clipGroupCount
            };
        }

        function groupAllPageItemsInLayer(doc, layer) {
            doc.selection = null;

            for (var i = 0; i < layer.pageItems.length; i++) {
                try {
                    layer.pageItems[i].selected = true;
                } catch (e) { }
            }

            if (doc.selection.length === 0) return null;

            if (doc.selection.length === 1 && doc.selection[0].typename === "GroupItem") {
                return doc.selection[0];
            }

            app.executeMenuCommand("group");
            fastSleep(300);

            return doc.selection.length > 0 ? doc.selection[0] : null;
        }

        function getLockedRectangleBoundsInLayer(doc, layerName) {
            var layer = null;

            try {
                layer = doc.layers[layerName];
            } catch (e) {
                return null;
            }

            var bestBounds = null;
            var bestArea = -1;

            function scanItem(item) {
                try {
                    if (item.typename === "PathItem") {
                        var b = item.geometricBounds;
                        var w = Math.abs(b[2] - b[0]);
                        var h = Math.abs(b[1] - b[3]);
                        var area = w * h;

                        if (area > bestArea) {
                            bestArea = area;
                            bestBounds = b;
                        }
                    }

                    if (item.typename === "GroupItem") {
                        for (var i = 0; i < item.pageItems.length; i++) {
                            scanItem(item.pageItems[i]);
                        }
                    }

                    if (item.typename === "CompoundPathItem") {
                        for (var c = 0; c < item.pathItems.length; c++) {
                            scanItem(item.pathItems[c]);
                        }
                    }
                } catch (e) { }
            }

            for (var i = 0; i < layer.pageItems.length; i++) {
                scanItem(layer.pageItems[i]);
            }

            return bestBounds;
        }

        function getArtworkSortSize(item) {
            var paths = [];
            var boundsList = [];

            collectArtworkSortPathItems(item, paths);

            for (var i = 0; i < paths.length; i++) {
                try {
                    boundsList.push(paths[i].visibleBounds || paths[i].geometricBounds);
                } catch (e) { }
            }

            var b = unionArtworkSortBounds(boundsList);

            if (!b) {
                try {
                    b = item.visibleBounds || item.geometricBounds;
                } catch (fallbackErr) { }
            }

            if (!b) return {
                w: 0,
                h: 0
            };

            return {
                w: Math.abs(b[2] - b[0]),
                h: Math.abs(b[1] - b[3])
            };
        }

        function collectArtworkSortPathItems(item, arr) {
            try {
                if (item.typename === "PathItem") {
                    arr.push(item);
                    return;
                }

                if (item.typename === "CompoundPathItem") {
                    for (var c = 0; c < item.pathItems.length; c++) {
                        arr.push(item.pathItems[c]);
                    }

                    return;
                }

                if (item.typename === "GroupItem") {
                    try {
                        if (item.clipped) return;
                    } catch (clipErr) { }

                    for (var i = 0; i < item.pageItems.length; i++) {
                        collectArtworkSortPathItems(item.pageItems[i], arr);
                    }
                }
            } catch (e) { }
        }

        function unionArtworkSortBounds(boundsList) {
            if (!boundsList || boundsList.length === 0) return null;

            var l = boundsList[0][0];
            var t = boundsList[0][1];
            var r = boundsList[0][2];
            var b = boundsList[0][3];

            for (var i = 1; i < boundsList.length; i++) {
                var bb = boundsList[i];

                if (bb[0] < l) l = bb[0];
                if (bb[1] > t) t = bb[1];
                if (bb[2] > r) r = bb[2];
                if (bb[3] < b) b = bb[3];
            }

            return [l, t, r, b];
        }
        // function makeOccupiedRectFromBounds(b) {
        //     if (!b) return null;

        //     var left = b[0];
        //     var top = b[1];
        //     var right = b[2];
        //     var bottom = b[3];

        //     var w = Math.abs(right - left);
        //     var h = Math.abs(top - bottom);
        //     if (w <= 2 || h <= 2) return null;

        //     var halfGap = gap / 2;

        //     return {
        //         x: left - halfGap,
        //         y: top + halfGap,
        //         w: w + gap,
        //         h: h + gap
        //     };
        // }

        // function rebuildFreeRectsFromUsedRects() {
        //     freeRects = [{ x: left, y: top, w: binW, h: binH }];

        //     for (var i = 0; i < usedRects.length; i++) {
        //         var r = usedRects[i];
        //         var newFreeRects = [];

        //         for (var j = 0; j < freeRects.length; j++) {
        //             splitFreeNode(freeRects[j], r, newFreeRects);
        //         }

        //         freeRects = newFreeRects;
        //         pruneFreeRects();
        //     }
        // }

        // function normalizeLoadedRects(rects) {
        //     var out = [];
        //     if (!rects || !rects.length) return out;

        //     for (var i = 0; i < rects.length; i++) {
        //         var r = rects[i];
        //         if (!r) continue;

        //         var x = Number(r.x);
        //         var y = Number(r.y);
        //         var w = Number(r.w);
        //         var h = Number(r.h);

        //         if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) continue;
        //         if (w <= 2 || h <= 2) continue;

        //         out.push({ x: x, y: y, w: w, h: h });
        //     }

        //     return out;
        // }
        function createSmartPacker(doc, margin, gap, allowRotate, waitBaseName, waitMaxInch, waitMetaFolder) {
            var boundary = getLockedRectangleBoundsInLayer(doc, "kiss");
            var areaRect = boundary ? boundary : doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;

            var left = areaRect[0] + margin;
            var top = areaRect[1] - margin;
            var right = areaRect[2] - margin;
            var bottom = areaRect[3] + margin;

            var binW = right - left;
            var binH = top - bottom;

            var freeRects = [{ x: left, y: top, w: binW, h: binH }];
            var usedRects = [];

            function normalizeLoadedRects(rects) {
                var out = [];
                if (!rects || !rects.length) return out;

                for (var i = 0; i < rects.length; i++) {
                    var r = rects[i];
                    if (!r) continue;

                    var x = Number(r.x);
                    var y = Number(r.y);
                    var w = Number(r.w);
                    var h = Number(r.h);

                    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) continue;
                    if (w <= 2 || h <= 2) continue;

                    out.push({ x: x, y: y, w: w, h: h });
                }

                return out;
            }

            function rectsOverlap(a, b) {
                var aLeft = a.x;
                var aRight = a.x + a.w;
                var aTop = a.y;
                var aBottom = a.y - a.h;

                var bLeft = b.x;
                var bRight = b.x + b.w;
                var bTop = b.y;
                var bBottom = b.y - b.h;

                return !(aRight <= bLeft || aLeft >= bRight || aBottom >= bTop || aTop <= bBottom);
            }

            function isContainedIn(a, b) {
                return (
                    a.x >= b.x &&
                    a.y <= b.y &&
                    a.x + a.w <= b.x + b.w &&
                    a.y - a.h >= b.y - b.h
                );
            }

            function splitFreeNode(freeNode, usedNode, out) {
                if (!rectsOverlap(freeNode, usedNode)) {
                    out.push(freeNode);
                    return;
                }

                var freeLeft = freeNode.x;
                var freeRight = freeNode.x + freeNode.w;
                var freeTop = freeNode.y;
                var freeBottom = freeNode.y - freeNode.h;

                var usedLeft = usedNode.x;
                var usedRight = usedNode.x + usedNode.w;
                var usedTop = usedNode.y;
                var usedBottom = usedNode.y - usedNode.h;

                if (usedTop < freeTop && usedTop > freeBottom) {
                    out.push({ x: freeLeft, y: freeTop, w: freeNode.w, h: freeTop - usedTop });
                }

                if (usedBottom > freeBottom && usedBottom < freeTop) {
                    out.push({ x: freeLeft, y: usedBottom, w: freeNode.w, h: usedBottom - freeBottom });
                }

                if (usedLeft > freeLeft && usedLeft < freeRight) {
                    out.push({ x: freeLeft, y: freeTop, w: usedLeft - freeLeft, h: freeNode.h });
                }

                if (usedRight < freeRight && usedRight > freeLeft) {
                    out.push({ x: usedRight, y: freeTop, w: freeRight - usedRight, h: freeNode.h });
                }
            }

            function pruneFreeRects() {
                for (var i = freeRects.length - 1; i >= 0; i--) {
                    if (freeRects[i].w <= 2 || freeRects[i].h <= 2) freeRects.splice(i, 1);
                }

                for (var a = freeRects.length - 1; a >= 0; a--) {
                    for (var b = freeRects.length - 1; b >= 0; b--) {
                        if (a === b) continue;
                        if (isContainedIn(freeRects[a], freeRects[b])) {
                            freeRects.splice(a, 1);
                            break;
                        }
                    }
                }

                freeRects.sort(function (r1, r2) {
                    if (r2.y !== r1.y) return r2.y - r1.y;
                    return r1.x - r2.x;
                });
            }

            function rebuildFreeRectsFromUsedRects() {
                freeRects = [{ x: left, y: top, w: binW, h: binH }];

                for (var i = 0; i < usedRects.length; i++) {
                    var r = usedRects[i];
                    var newFreeRects = [];

                    for (var j = 0; j < freeRects.length; j++) {
                        splitFreeNode(freeRects[j], r, newFreeRects);
                    }

                    freeRects = newFreeRects;
                    pruneFreeRects();
                }
            }

            function collectPackPathItems(item, arr) {
                try {
                    if (item.typename === "PathItem") {
                        arr.push(item);
                        return;
                    }
                    if (item.typename === "CompoundPathItem") {
                        for (var c = 0; c < item.pathItems.length; c++) arr.push(item.pathItems[c]);
                        return;
                    }
                    if (item.typename === "GroupItem") {
                        try {
                            if (item.clipped) return;
                        } catch (clipErr) { }
                        for (var i = 0; i < item.pageItems.length; i++) {
                            collectPackPathItems(item.pageItems[i], arr);
                        }
                    }
                } catch (e) { }
            }

            function unionBounds(boundsList) {
                if (!boundsList || !boundsList.length) return null;

                var l = boundsList[0][0];
                var t = boundsList[0][1];
                var r = boundsList[0][2];
                var b = boundsList[0][3];

                for (var i = 1; i < boundsList.length; i++) {
                    var bb = boundsList[i];
                    if (bb[0] < l) l = bb[0];
                    if (bb[1] > t) t = bb[1];
                    if (bb[2] > r) r = bb[2];
                    if (bb[3] < b) b = bb[3];
                }

                return [l, t, r, b];
            }

            function getArtworkPackBounds(item) {
                var paths = [];
                var boundsList = [];
                collectPackPathItems(item, paths);

                for (var i = 0; i < paths.length; i++) {
                    try {
                        boundsList.push(paths[i].visibleBounds || paths[i].geometricBounds);
                    } catch (e) { }
                }

                var ub = unionBounds(boundsList);
                return ub || item.visibleBounds || item.geometricBounds;
            }

            function getItemSize(item) {
                var b = getArtworkPackBounds(item);
                return { w: Math.abs(b[2] - b[0]), h: Math.abs(b[1] - b[3]) };
            }

            function isSafeAgainstUsed(candidate) {
                var candWithGap = {
                    x: candidate.x,
                    y: candidate.y,
                    w: candidate.w + gap,
                    h: candidate.h + gap
                };

                for (var i = 0; i < usedRects.length; i++) {
                    if (rectsOverlap(candWithGap, usedRects[i])) return false;
                }
                return true;
            }

            function findBestRect(w, h) {
                var best = null;

                if (useGridScanMode) {
                    // coarse grid scan (points) inside freeRects to find any
                    // placement that doesn't overlap usedRects (with gap).
                    var step = Math.max(10, Math.round(gap));

                    for (var i = 0; i < freeRects.length; i++) {
                        var r = freeRects[i];

                        for (var yy = r.y; yy - h >= r.y - r.h; yy -= step) {
                            for (var xx = r.x; xx + w <= r.x + r.w; xx += step) {
                                var cand = { index: i, rect: r, rotated: false, x: xx, y: yy, w: w, h: h };
                                if (isSafeAgainstUsed(cand)) return cand;
                            }
                        }
                    }

                    if (allowRotate) {
                        for (var i2 = 0; i2 < freeRects.length; i2++) {
                            var r2 = freeRects[i2];
                            for (var yy2 = r2.y; yy2 - w >= r2.y - r2.h; yy2 -= step) {
                                for (var xx2 = r2.x; xx2 + h <= r2.x + r2.w; xx2 += step) {
                                    var candR = { index: i2, rect: r2, rotated: true, x: xx2, y: yy2, w: h, h: w };
                                    if (isSafeAgainstUsed(candR)) return candR;
                                }
                            }
                        }
                    }

                    return null;
                }

                for (var i = 0; i < freeRects.length; i++) {
                    var r = freeRects[i];

                    if (w <= r.w && h <= r.h) {
                        var cand = { index: i, rect: r, rotated: false, x: r.x, y: r.y, w: w, h: h };

                        if (isSafeAgainstUsed(cand)) {
                            var scoreY = -r.y - h;
                            var scoreX = r.x;
                            if (!best || scoreY > best.scoreY || (scoreY === best.scoreY && scoreX < best.scoreX)) {
                                cand.scoreY = scoreY;
                                cand.scoreX = scoreX;
                                best = cand;
                            }
                        }
                    }

                    if (allowRotate && h <= r.w && w <= r.h) {
                        var candRot = { index: i, rect: r, rotated: true, x: r.x, y: r.y, w: h, h: w };

                        if (isSafeAgainstUsed(candRot)) {
                            var scoreYR = -r.y - w;
                            var scoreXR = r.x;
                            if (!best || scoreYR > best.scoreY || (scoreYR === best.scoreY && scoreXR < best.scoreX)) {
                                candRot.scoreY = scoreYR;
                                candRot.scoreX = scoreXR;
                                best = candRot;
                            }
                        }
                    }
                }

                return best;
            }

            function registerUsedRect(placedRect) {
                var occupied = {
                    x: placedRect.x - gap / 2,
                    y: placedRect.y + gap / 2,
                    w: placedRect.w + gap,
                    h: placedRect.h + gap
                };

                usedRects.push(occupied);
                try {
                    $.writeln('[usedRect] add x=' + Math.round(occupied.x) + ' y=' + Math.round(occupied.y) + ' w=' + Math.round(occupied.w) + ' h=' + Math.round(occupied.h));
                } catch (e) { }

                var newFreeRects = [];
                for (var i = 0; i < freeRects.length; i++) {
                    splitFreeNode(freeRects[i], occupied, newFreeRects);
                }

                freeRects = newFreeRects;
                pruneFreeRects();
            }

            function moveItemTopLeftTo(item, targetLeft, targetTop) {
                var b = getArtworkPackBounds(item);
                var dx = targetLeft - b[0];
                var dy = targetTop - b[1];
                item.translate(dx, dy);
            }

            function makeBoundsKey(b) {
                return [
                    Math.round(b[0] * 10) / 10,
                    Math.round(b[1] * 10) / 10,
                    Math.round(b[2] * 10) / 10,
                    Math.round(b[3] * 10) / 10
                ].join("|");
            }

            function makeOccupiedRectFromBounds(b) {
                if (!b) return null;

                var leftB = b[0];
                var topB = b[1];
                var rightB = b[2];
                var bottomB = b[3];

                var w = Math.abs(rightB - leftB);
                var h = Math.abs(topB - bottomB);
                if (w <= 2 || h <= 2) return null;

                var halfGap = gap / 2;
                return {
                    x: leftB - halfGap,
                    y: topB + halfGap,
                    w: w + gap,
                    h: h + gap
                };
            }

            function collectExistingUsedRects() {
                var seenBounds = {};

                function addItemBounds(item, out) {
                    try {
                        var b = item.geometricBounds || item.visibleBounds;
                        if (!b) return;

                        if (item.typename === "PathItem" && boundary) {
                            var bb = item.geometricBounds;
                            if (
                                Math.abs(bb[0] - boundary[0]) < 1 &&
                                Math.abs(bb[1] - boundary[1]) < 1 &&
                                Math.abs(bb[2] - boundary[2]) < 1 &&
                                Math.abs(bb[3] - boundary[3]) < 1
                            ) {
                                return;
                            }
                        }

                        var occ = makeOccupiedRectFromBounds(b);
                        if (!occ) return;

                        var key = makeBoundsKey([occ.x, occ.y, occ.x + occ.w, occ.y - occ.h]);
                        if (seenBounds[key]) return;
                        seenBounds[key] = true;

                        out.push(occ);
                    } catch (e) { }
                }

                function scanItemRecursive(item, out) {
                    try {
                        if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
                            addItemBounds(item, out);
                            return;
                        }
                        if (item.typename === "GroupItem") {
                            for (var gi = 0; gi < item.pageItems.length; gi++) {
                                scanItemRecursive(item.pageItems[gi], out);
                            }
                            return;
                        }
                        if (item.typename === "Layer") {
                            for (var li = 0; li < item.pageItems.length; li++) {
                                scanItemRecursive(item.pageItems[li], out);
                            }
                        }
                    } catch (e) { }
                }

                function addExistingItem(item) {
                    try {
                        if (!RUN_WAIT_MODE && !item.visible) return;
                        if (!RUN_WAIT_MODE && isOnHiddenLayer(item)) return;
                        if (isPreviewLayer(item)) return;
                        if (!RUN_WAIT_MODE && isAutoBatchLayer(item)) return;
                        addItemBounds(item, usedRects);
                    } catch (e) { }
                }

                for (var li = 0; li < doc.layers.length; li++) {
                    try {
                        var layer = doc.layers[li];
                        if (!RUN_WAIT_MODE && !layer.visible) continue;
                        if (isReservedLayerName(layer.name)) continue;
                        if (!RUN_WAIT_MODE && String(layer.name).indexOf(AUTO_LAYER_PREFIX) === 0) continue;

                        if (RUN_WAIT_MODE) {
                            scanItemRecursive(layer, usedRects);
                        } else {
                            for (var pi = 0; pi < layer.pageItems.length; pi++) {
                                addExistingItem(layer.pageItems[pi]);
                            }
                        }
                    } catch (e) { }
                }
            }

            function getItemLayerName(item) {
                try {
                    if (item.layer && item.layer.name) return String(item.layer.name);
                } catch (e) { }
                return "";
            }

            function isOnHiddenLayer(item) {
                try {
                    return item.layer && !item.layer.visible;
                } catch (e) {
                    return false;
                }
            }

            function isPreviewLayer(item) {
                return false;
            }

            function isAutoBatchLayer(item) {
                var layerName = getItemLayerName(item);
                return layerName.indexOf(AUTO_LAYER_PREFIX) === 0;
            }

            function isReservedLayerName(name) {
                var n = String(name || "");
                return n === "kiss" || n === "die";
            }

            function mergeUsedRectsFromSource(rects) {
                if (!rects || !rects.length) return;

                var seen = {};
                for (var i = 0; i < usedRects.length; i++) {
                    var exist = usedRects[i];
                    var existKey = [
                        Math.round(exist.x * 100) / 100,
                        Math.round(exist.y * 100) / 100,
                        Math.round(exist.w * 100) / 100,
                        Math.round(exist.h * 100) / 100
                    ].join("|");
                    seen[existKey] = true;
                }

                for (var j = 0; j < rects.length; j++) {
                    var rr = rects[j];
                    var key = [
                        Math.round(rr.x * 100) / 100,
                        Math.round(rr.y * 100) / 100,
                        Math.round(rr.w * 100) / 100,
                        Math.round(rr.h * 100) / 100
                    ].join("|");

                    if (seen[key]) continue;
                    seen[key] = true;
                    usedRects.push(rr);
                }
            }

            var loadedRects = null;
            if (waitBaseName && waitMaxInch && waitMetaFolder) {
                loadedRects = normalizeLoadedRects(readWaitMetaJson(waitMetaFolder, waitBaseName, waitMaxInch));
            }

            collectExistingUsedRects();
            $.writeln("[wait-meta] existing usedRects before merge: " + (usedRects ? usedRects.length : 0));
            if (loadedRects && loadedRects.length > 0) {
                $.writeln("[wait-meta] loaded rects from JSON: " + loadedRects.length);
                mergeUsedRectsFromSource(loadedRects);
                $.writeln("[wait-meta] usedRects after merge: " + usedRects.length);
            }

            // When we have wait-meta from old files, don't aggressively
            // subtract usedRects from freeRects (that fragments the space and
            // blocks large placements). Instead, keep freeRects large and use
            // a grid-scan that checks overlap with usedRects (with gap padding).
            var useGridScanMode = loadedRects && loadedRects.length > 0;
            if (!useGridScanMode) {
                rebuildFreeRectsFromUsedRects();
            }

            function drawFitPreview(doc) {
                return;
            }

            return {
                canFit: function (w, h) {
                    return findBestRect(w, h) !== null;
                },

                countFitInch: function (inch) {
                    var offsetMM;
                    if (inch >= 2 && inch <= 4) offsetMM = 2.5;
                    else if (inch > 4 && inch <= 20) offsetMM = inch;
                    else offsetMM = 2.5;

                    var sizePt = getCorrectedTargetPt(inch);
                    var offsetPt = offsetMM * 2.834645669;
                    var testW = sizePt + offsetPt * 2;
                    var testH = sizePt + offsetPt * 2;

                    return findBestRect(testW, testH) ? 1 : 0;
                },

                place: function (item) {
                    var size = getItemSize(item);
                    var best = findBestRect(size.w, size.h);
                    if (!best) return false;

                    if (best.rotated) {
                        try {
                            item.rotate(90, true, true, true, true, Transformation.CENTER);
                        } catch (e) { }
                        size = getItemSize(item);
                        best = findBestRect(size.w, size.h);
                        if (!best) return false;
                    }

                    moveItemTopLeftTo(item, best.x, best.y);

                    var b = getArtworkPackBounds(item);
                    var placedRect = {
                        x: b[0],
                        y: b[1],
                        w: Math.abs(b[2] - b[0]),
                        h: Math.abs(b[1] - b[3])
                    };

                    registerUsedRect(placedRect);
                    return true;
                },

                drawFitPreview: function (doc) {
                    drawFitPreview(doc);
                },

                getUsedRects: function () {
                    return usedRects;
                }
            };
        }
        function renameToDone(file) {
            var cleanName = cleanFileName(file.name);
            var base = stripExt(cleanName);

            if (/-\s*done\s*$/i.test(base)) return;

            var ext = getExt(cleanName);
            var newName = base + " - done" + ext;
            var renamed = file.rename(newName);

            if (!renamed) {
                $.writeln("KhÃ´ng rename Ä‘Æ°á»£c file: " + file.fsName);
            }
        }

        function makeUniqueLayerName(doc, name) {
            var finalName = name;
            var n = 2;

            while (layerExists(doc, finalName)) {
                finalName = name + " (" + n + ")";
                n++;
            }

            return finalName;
        }

        function layerExists(doc, name) {
            try {
                var l = doc.layers[name];
                return l !== null;
            } catch (e) {
                return false;
            }
        }

        function cleanFileName(name) {
            var s = String(name);

            try {
                s = decodeURI(s);
            } catch (e) { }

            s = s.replace(/%20/g, " ");

            return s;
        }

        function stripExt(name) {
            return String(name).replace(/\.[^\.]+$/, "");
        }

        function getExt(name) {
            var m = String(name).match(/(\.[^\.]+)$/);
            return m ? m[1] : "";
        }

        function trim(s) {
            return String(s).replace(/^\s+|\s+$/g, "");
        }

        function toSizeKey(inch) {
            var n = Number(inch);
            if (isNaN(n)) return String(inch);
            return String(Math.round(n * 1000) / 1000);
        }

        function getErrorMessage(e) {
            if (!e) return "Unknown error";
            if (e.message) return e.message;
            return String(e);
        }
        function getCorrectedTargetPt(inch) {
            // fix cá»©ng inch chuáº©n
            var fixedPt = {
                2: 144,   // 50.8 mm
                3: 216,   // 76.2 mm
                4: 288,   // 101.6 mm
                5: 360,   // 127 mm
                6: 432,   // 152.4 mm
                7: 504,   // 177.8 mm
                8: 576,   // 203.2 mm
                9: 648,   // 228.6 mm
                10: 720,  // 254 mm
                11: 792,  // 279.4 mm
                12: 864,
                13: 936,
                14: 1008,
                15: 1080,
                16: 1152,
                17: 1224,
                18: 1296,
                19: 1368,
                20: 1440
            };

            if (fixedPt[inch]) return fixedPt[inch];

            return inch * 72;
        }

        function queueDoneFileForCurrentSheet(file, info, doneQty, remainQty) {
            var key = getFileKey(file);

            for (var i = 0; i < currentSheetDoneFiles.length; i++) {
                var queued = currentSheetDoneFiles[i];
                if (queued && queued.file && getFileKey(queued.file) === key) {
                    return;
                }
            }

            currentSheetDoneFiles.push({
                file: file,
                info: info,
                doneQty: doneQty,
                remainQty: remainQty
            });
        }

        function normalizePackQtyFileName(file, info) {
            var name = file.name;

            if (!/pack-\d+/i.test(name)) return file;

            var newName = name
                .replace(/-pack-\d+/i, "")
                .replace(/qty_\d+/i, "qty_" + info.qty);

            if (newName === name) return file;

            var newFile = new File(file.parent.fsName + "/" + newName);

            if (file.rename(newName)) {
                return newFile;
            }

            return file;
        }


        function moveQueuedDoneFiles(doneFolder) {
            if (!doneFolder.exists) doneFolder.create();

            for (var i = 0; i < currentSheetDoneFiles.length; i++) {
                try {
                    moveFileToDoneFolder(currentSheetDoneFiles[i], doneFolder);
                    processedFileCount++;
                } catch (e) {
                    $.writeln("Move done thất bại: " + getErrorMessage(e));
                }
            }

            currentSheetDoneFiles = [];
        }

        function moveFileToDoneFolder(doneItem, doneFolder) {
            var file = doneItem && doneItem.file ? doneItem.file : null;
            if (!file || !file.exists) {
                throw new Error("File nguá»“n khÃ´ng tá»“n táº¡i Ä‘á»ƒ move done");
            }

            var info = doneItem.info;
            var doneQty = Number(doneItem.doneQty);
            var remainQty = Number(doneItem.remainQty);

            if (isNaN(doneQty) || doneQty < 1) {
                throw new Error("doneQty khÃ´ng há»£p lá»‡");
            }

            if (isNaN(remainQty) || remainQty < 0) {
                throw new Error("remainQty khÃ´ng há»£p lá»‡");
            }

            var cleanName = cleanFileName(file.name);
            var ext = getExt(cleanName);
            var doneName = buildFileNameWithQty(info, doneQty, ext);
            var dest = uniqueFileInFolder(doneFolder, doneName);

            var copied = file.copy(dest);
            if (!copied) {
                throw new Error("KhÃ´ng move Ä‘Æ°á»£c file done");
            }

            if (remainQty > 0) {
                renameFileQty(file, info, remainQty);
            } else {
                file.remove();
            }
        }

        /**
         * moveFileToErrorFolder
         * - Di chuyển file nguồn sang folder lỗi `image-error`.
         * - Hiện tại chỉ copy -> xóa file gốc; nếu thất bại thì log thông báo.
         * - Có thể mở rộng: ghi file log lý do lỗi kèm theo (recommended).
         */
        function moveFileToErrorFolder(file, errorFolder) {

            try {
                if (!file.exists) return;
                if (!errorFolder.exists) errorFolder.create();
                var cleanName = cleanFileName(file.name);
                var dest = uniqueFileInFolder(errorFolder, cleanName);

                var copied = file.copy(dest);

                if (copied) {
                    file.remove();
                } else {
                    throw new Error("Không move được file lỗi");
                }
            } catch (e) {
                $.writeln("Move error thất bại: " + getErrorMessage(e));
            }
        }
        function pushUniqueCurrentSheetId(id) {
            id = String(id);

            for (var i = 0; i < currentSheetIds.length; i++) {
                if (String(currentSheetIds[i]) === id) {
                    return;
                }
            }

            currentSheetIds.push(id);
        }
        function uniqueFileInFolder(folder, fileName) {
            var base = stripExt(fileName);
            var ext = getExt(fileName);

            var f = new File(folder.fsName + "/" + fileName);
            var n = 2;

            while (f.exists) {
                f = new File(folder.fsName + "/" + base + " (" + n + ")" + ext);
                n++;
            }

            return f;
        }
        // function renameFileQty(file, info, remainQty) {
        //     try {
        //         var cleanName = cleanFileName(file.name);
        //         var ext = getExt(cleanName);

        //         var newName = buildFileNameWithQty(info, remainQty, ext);

        //         var target = new File(file.parent.fsName + "/" + newName);
        //         var n = 2;

        //         while (target.exists) {
        //             newName = buildFileNameWithQty(info, remainQty, ext, n);

        //             target = new File(file.parent.fsName + "/" + newName);
        //             n++;
        //         }

        //         file.rename(newName);

        //     } catch (e) {
        //         $.writeln("Äá»•i qty cÃ²n láº¡i tháº¥t báº¡i: " + getErrorMessage(e));
        //     }
        // }
        function renameFileQty(file, info, remainQty) {
            try {
                var cleanName = cleanFileName(file.name);
                var base = stripExt(cleanName);
                var ext = getExt(cleanName);

                // Bỏ pack-3, pack-10...
                var newBase = base.replace(/-pack-\d+/i, "");

                // Đổi qty cũ thành qty còn lại thực tế
                if (/qty_\d+/i.test(newBase)) {
                    newBase = newBase.replace(/qty_\d+/i, "qty_" + remainQty);
                } else {
                    newBase = newBase + "_qty_" + remainQty;
                }

                var newName = newBase + ext;
                var target = new File(file.parent.fsName + "/" + newName);
                var n = 2;

                while (target.exists) {
                    newName = newBase + " (" + n + ")" + ext;
                    target = new File(file.parent.fsName + "/" + newName);
                    n++;
                }

                file.rename(newName);

            } catch (e) {
                $.writeln("Đổi qty còn lại thất bại: " + getErrorMessage(e));
            }
        }

        function buildFileNameWithQty(info, qty, ext, suffix) {
            var base = info.base || "";

            base = base.replace(/-pack-\d+/i, "");

            if (/qty_\d+/i.test(base)) {
                base = base.replace(/qty_\d+/i, "qty_" + qty);
            } else {
                base = base + "_qty_" + qty;
            }

            if (suffix && suffix > 1) {
                base += " (" + suffix + ")";
            }

            return base + ext;
        }
    })();


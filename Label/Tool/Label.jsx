#target illustrator

var MAX_PER_FILE = 460;

var PT_PER_MM = 2.834645669;

var GAP_MM = 0.4;
var GAP = GAP_MM * PT_PER_MM;

// ITEM 1 né layer MARGIN thêm 0.1mm
var SIDE_MARGIN_MM = 0.1;
var SIDE_MARGIN = SIDE_MARGIN_MM * PT_PER_MM;

main();

function main() {

    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    var inputFolder = new Folder("D:/n8n/Label/File_Label");
    var doneRoot = new Folder("D:/n8n/Label/Label_done");
    var errorRoot = new Folder("D:/n8n/Label/Label_error");
    var outputRoot = new Folder("D:/n8n/Label/output_ai");
    var templateFile = new File("D:/n8n/Label/Template/Template Labell FBA.ai");

    if (!inputFolder.exists) {
        showAlert("Không tìm thấy folder File_Label");
        return;
    }

    if (!templateFile.exists) {
        showAlert("Không tìm thấy template:\n" + templateFile.fsName);
        return;
    }

    ensureFolder(doneRoot);
    ensureFolder(errorRoot);
    ensureFolder(outputRoot);

    var sheetNumber = 0;
    while (true) {
    var pdfFiles = inputFolder.getFiles("*.pdf");

    if (pdfFiles.length === 0) {
        break;
    }

    // ======================
    // SORT: CÙNG TÊN TRƯỚC, TRONG CÙNG TÊN THÌ ID NHỎ TRƯỚC
    // ======================
    pdfFiles.sort(function (a, b) {
        try {
            var ia = parseFileName(a);
            var ib = parseFileName(b);

            var nameCompare = String(ia.name).localeCompare(String(ib.name));

            if (nameCompare !== 0) {
                return nameCompare;
            }

            var ida = parseInt(ia.id, 10);
            var idb = parseInt(ib.id, 10);

            if (!isNaN(ida) && !isNaN(idb)) {
                return ida - idb;
            }

            return String(ia.id).localeCompare(String(ib.id));

        } catch (e) {
            return 0;
        }
    });

    // ======================
    // CHỈ CHỌN NHÓM PDF ĐỦ TỐI ĐA 460 ITEM
    // ======================
    var validFiles = [];
    var sheetFlow = null;
    for (var candidateIndex = 0; candidateIndex < pdfFiles.length; candidateIndex++) {
        var candidate = pdfFiles[candidateIndex];
        var candidateInfo;
        try { candidateInfo = parseFileName(candidate); }
        catch (parseError) {
            moveFileSafe(candidate, errorRoot);
            if (candidate.exists) throw new Error("Cannot move invalid PDF: " + candidate.fsName);
            continue;
        }
        if (sheetFlow === null) sheetFlow = candidateInfo.flow;
        if (candidateInfo.flow === sheetFlow) validFiles.push(candidate);
    }
    pdfFiles = pickPdfFilesForOneSheet(validFiles, MAX_PER_FILE);
    if (pdfFiles.length === 0) continue;

    var doc = app.open(templateFile);

    var boxes = getTemplateBoxes(doc);

    if (boxes.length === 0) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        showAlert("Không đọc được TEMPLATE W / TEMPLATE H");
        return;
    }

    var doneFolder = getTodayDoneFolder(doneRoot);

    var usedCount = 0;
    var pendingUpdates = [];
    var firstDoneInfo = null;

    for (var f = 0; f < pdfFiles.length; f++) {

        if (usedCount >= MAX_PER_FILE || usedCount >= boxes.length) {
            break;
        }

        var pdfFile = pdfFiles[f];

        try {

            var result = processOnePdf(doc, pdfFile, boxes, usedCount);

            if (firstDoneInfo === null) {
                firstDoneInfo = result.info;
            }

            usedCount += result.doneQty;

            if (result.doneQty <= 0) throw new Error("Label made no progress: " + pdfFile.name);
            pendingUpdates.push({ file: pdfFile, result: result });

        } catch (e) {

            throw new Error("Label failed before saving; input preserved: " + pdfFile.name + " | " + e);
        }
    }

    if (firstDoneInfo !== null) {
        saveAiAndClose(doc, outputRoot, firstDoneInfo);
        for (var updateIndex = 0; updateIndex < pendingUpdates.length; updateIndex++) {
            var pending = pendingUpdates[updateIndex];
            updatePdfAfterDone(pending.file, doneFolder, inputFolder, pending.result.info, pending.result.doneQty, pending.result.remainQty);
        }
        sheetNumber++;
    } else {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        throw new Error("Label made no progress; stopped to preserve input.");
    }
    }



    try {
        // app.quit();
    } catch (e) { }
}


// ======================
// CHỌN PDF CHO 1 TỜ 460 ITEM
// ======================
function pickPdfFilesForOneSheet(pdfFiles, maxQty) {

    var picked = [];
    var total = 0;

    for (var i = 0; i < pdfFiles.length; i++) {

        try {
            var info = parseFileName(pdfFiles[i]);

            if (total >= maxQty) {
                break;
            }

            picked.push(pdfFiles[i]);
            total += info.qty;

            if (total >= maxQty) {
                break;
            }

        } catch (e) { }
    }

    return picked;
}


// ======================
// XỬ LÝ 1 PDF
// ======================
function processOnePdf(doc, pdfFile, boxes, startIndex) {

    var info = parseFileName(pdfFile);

    var maxSlot = Math.min(MAX_PER_FILE, boxes.length);
    var remainSlot = maxSlot - startIndex;
    var maxCount = Math.min(info.qty, remainSlot);

    if (maxCount <= 0) {
        throw new Error("Hết chỗ để xếp");
    }

    var layerName = info.id + " - " + info.qty + " - " + info.name;

    var pdfLayer = doc.layers.add();
    pdfLayer.name = layerName;
    pdfLayer.locked = false;
    pdfLayer.visible = true;

    doc.activeLayer = pdfLayer;

    var pair = makeOnePdfItemPair(doc, pdfLayer, pdfFile);

    if (!pair.item1 && !pair.item2) {
        throw new Error("Không đọc được ITEM 1 / ITEM 2");
    }

    for (var i = 0; i < maxCount; i++) {

        var box = boxes[startIndex + i];

        var item1Copy = null;
        var item2Copy = null;

        if (pair.item1) {

            if (i === 0) {
                item1Copy = pair.item1;
            } else {
                item1Copy = pair.item1.duplicate(pdfLayer, ElementPlacement.PLACEATEND);
            }

            item1Copy.name = info.id + " - " + info.name + " - ITEM 1 - " + (i + 1);

            fitItemToArea(
                item1Copy,
                box.item1Left,
                box.item1Right,
                box.top,
                box.bottom
            );
        }

        if (pair.item2) {

            if (i === 0) {
                item2Copy = pair.item2;
            } else {
                item2Copy = pair.item2.duplicate(pdfLayer, ElementPlacement.PLACEATEND);
            }

            item2Copy.name = info.id + " - " + info.name + " - ITEM 2 - " + (i + 1);

            fitItemToArea(
                item2Copy,
                box.item2Left,
                box.item2Right,
                box.top,
                box.bottom
            );
        }
    }

    createNameLabels(doc, info, boxes, startIndex, maxCount);

    return {
        info: info,
        doneQty: maxCount,
        remainQty: info.qty - maxCount
    };
}


// ======================
// LÀM 1 PDF GỐC RỒI TÁCH ITEM 1 / ITEM 2
// ======================
function makeOnePdfItemPair(doc, layer, pdfFile) {

    var placed = doc.placedItems.add();
    placed.file = pdfFile;
    placed.move(layer, ElementPlacement.PLACEATBEGINNING);
    placed.rotate(270);

    app.redraw();
    $.sleep(300);

    placed.embed();

    app.redraw();
    $.sleep(500);

    selectAllInLayer(doc, layer);
    ungroupSelected();

    app.redraw();
    $.sleep(300);

    releaseAllClipGroups(doc, layer);

    app.redraw();
    $.sleep(300);

    deleteLoosePaths(layer);

    app.redraw();
    $.sleep(300);

    var item1Arr = [];
    var item2Arr = [];

    for (var i = layer.pageItems.length - 1; i >= 0; i--) {

        var item = layer.pageItems[i];

        try {
            if (isItem2(item)) {
                item2Arr.push(item);
            } else {
                item1Arr.push(item);
            }
        } catch (e) { }
    }

    return {
        item1: groupItems(doc, item1Arr, "ITEM 1"),
        item2: groupItems(doc, item2Arr, "ITEM 2")
    };
}


// ======================
// ITEM 2 = COMPOUND PATH HOẶC CLIP GROUP
// ======================
function isItem2(item) {

    try {
        if (item.typename === "GroupItem" && item.clipped === true) {
            return true;
        }

        if (item.typename === "CompoundPathItem") {
            return true;
        }
    } catch (e) { }

    return false;
}


// ======================
// GROUP ITEMS
// ======================
function groupItems(doc, items, groupName) {

    if (!items || items.length === 0) {
        return null;
    }

    doc.selection = null;

    for (var i = 0; i < items.length; i++) {
        try {
            items[i].selected = true;
        } catch (e) { }
    }

    if (!doc.selection || doc.selection.length === 0) {
        return null;
    }

    app.executeMenuCommand("group");
    app.redraw();
    $.sleep(150);

    if (doc.selection && doc.selection.length > 0) {
        doc.selection[0].name = groupName;
        return doc.selection[0];
    }

    return null;
}


// ======================
// FIT ITEM VÀO VÙNG
// ======================
function fitItemToArea(item, left, right, top, bottom) {

    var b = item.visibleBounds;

    var currentW = b[2] - b[0];
    var currentH = b[1] - b[3];

    var targetW = right - left;
    var targetH = top - bottom;

    if (targetW <= 0 || targetH <= 0) return;

    var scaleX = targetW / currentW;
    var scaleY = targetH / currentH;

    var scale = Math.min(scaleX, scaleY) * 95;

    item.resize(
        scale,
        scale,
        true,
        true,
        true,
        true,
        scale,
        Transformation.CENTER
    );

    app.redraw();

    moveItemToArea(item, left, right, top, bottom);
}


// ======================
// MOVE GIỮA VÙNG
// ======================
function moveItemToArea(item, left, right, top, bottom) {

    var b = item.visibleBounds;

    var currentCenterX = (b[0] + b[2]) / 2;
    var currentCenterY = (b[1] + b[3]) / 2;

    var targetCenterX = (left + right) / 2;
    var targetCenterY = (top + bottom) / 2;

    item.translate(
        targetCenterX - currentCenterX,
        targetCenterY - currentCenterY
    );
}

// ======================
// ======================
// PARSE FILE NAME
// Hỗ trợ dạng mới:
// 123_item_xxx_sticker-vinyl-3in_qty_20_f1_TEN.pdf
// 123_item_xxx_sticker-vinyl-3in_qty_20-pack-3_f1_TEN.pdf
// ======================
function parseFileName(file) {

    var cleanName = decodeURI(file.name);
    var base = cleanName.replace(/\.pdf$/i, "");

    var headerMatch = base.match(/^(FBA|FBM)_([^_]+)_item([0-9]+)_/i);
    if (!headerMatch) throw new Error("Tên PDF phải có dạng FBA_806_item1_... hoặc FBM_806_item1_...: " + file.name);
    var flow = String(headerMatch[1]).toUpperCase();
    var id = trimText(headerMatch[2]);

    // QTY: lấy qty_1, qty_20...
    var qtyMatch = base.match(/qty_(\d+)/i);
    if (!qtyMatch) {
        throw new Error("Không đọc được qty từ file: " + file.name);
    }

    var qty = parseInt(qtyMatch[1], 10);
    if (isNaN(qty) || qty <= 0) qty = 1;

    // PACK: nếu có pack-3 thì qty = qty * pack
    var packMatch = base.match(/pack-(\d+)/i);
    var packQty = 1;

    if (packMatch) {
        packQty = parseInt(packMatch[1], 10);
        if (isNaN(packQty) || packQty < 1) packQty = 1;
    }

    qty = qty * packQty;

    var itemStart = base.indexOf("_item" + headerMatch[3] + "_");
    var qtyStart = base.toLowerCase().indexOf("_qty_");
    var itemName = trimText(base.substring(headerMatch[0].length, qtyStart));
    if (qtyStart < headerMatch[0].length || !/(^|[-_ ])label([-_ ]|$)/i.test(itemName)) throw new Error("Product name must contain label: " + file.name);

    return {
        id: id,
        flow: flow,
        qty: qty,
        name: itemName,
        item: itemName,
        base: base
    };
}

function buildPdfName(info, qty) {

    var base = info.base || "";

    // bỏ pack-3, pack-10 nếu có
    base = base.replace(/-pack-\d+/i, "");

    // đổi qty cũ thành qty mới
    if (/qty_\d+/i.test(base)) {
        base = base.replace(/qty_\d+/i, "qty_" + qty);
    } else {
        base = base + "_qty_" + qty;
    }

    return base + ".pdf";
}

function trimText(s) {
    return String(s).replace(/^\s+|\s+$/g, "");
}


// ======================
// TEMPLATE BOX
// ======================
function getTemplateBoxes(doc) {

    var wLayer, hLayer;

    try {
        wLayer = doc.layers.getByName("TEMPLATE W");
        hLayer = doc.layers.getByName("TEMPLATE H");
    } catch (e) {
        return [];
    }

    var xs = [];
    var ys = [];

    for (var i = 0; i < wLayer.pageItems.length; i++) {
        try {
            var b = wLayer.pageItems[i].geometricBounds;
            xs.push((b[0] + b[2]) / 2);
        } catch (e) { }
    }

    for (var j = 0; j < hLayer.pageItems.length; j++) {
        try {
            var b2 = hLayer.pageItems[j].geometricBounds;
            ys.push((b2[1] + b2[3]) / 2);
        } catch (e) { }
    }

    xs = uniqueNumbers(xs);
    ys = uniqueNumbers(ys);

    xs.sort(function (a, b) { return a - b; });
    ys.sort(function (a, b) { return b - a; });

    var margins = getMarginAreas(doc);

    var boxes = [];
    var rowsPerColumn = ys.length - 1;
    var colIndex = 0;

    for (var col = 0; col < xs.length - 2; col += 2) {

        for (var row = 0; row < rowsPerColumn; row++) {

            var left = xs[col];
            var middle = xs[col + 1];
            var right = xs[col + 2];

            var top = ys[row];
            var bottom = ys[row + 1];

            var item1Left = getItem1LeftWithMarginAreas(
                margins,
                left,
                middle,
                top,
                bottom
            );

            boxes.push({
                left: left,
                middle: middle,
                right: right,

                top: top,
                bottom: bottom,

                width: right - left,
                height: top - bottom,

                item1Left: item1Left,
                item1Right: middle - GAP,

                item2Left: middle + GAP,
                item2Right: right,

                labelY: ys[0] + 20,

                colIndex: colIndex,
                rowIndex: row
            });
        }

        colIndex++;
    }

    boxes.rowsPerColumn = rowsPerColumn;

    return boxes;
}


// ======================
// ĐỌC LAYER MARGIN THEO VÙNG OBJECT
// ======================
function getMarginAreas(doc) {

    var marginLayer;

    try {
        marginLayer = doc.layers.getByName("MARGIN");
    } catch (e) {
        return [];
    }

    var result = [];

    collectMarginItems(marginLayer, result);

    return result;
}


// ======================
// LẤY OBJECT TRONG MARGIN
// ======================
function collectMarginItems(container, result) {

    for (var i = 0; i < container.pageItems.length; i++) {

        try {
            var item = container.pageItems[i];

            if (item.hidden || item.locked) {
                continue;
            }

            var b = item.geometricBounds;

            result.push({
                left: b[0],
                top: b[1],
                right: b[2],
                bottom: b[3],
                width: b[2] - b[0],
                height: b[1] - b[3]
            });

        } catch (e) { }
    }
}


// ======================
// ITEM 1 NÉ VÙNG MARGIN
// ======================
function getItem1LeftWithMarginAreas(margins, boxLeft, boxMiddle, boxTop, boxBottom) {

    var item1Left = boxLeft + SIDE_MARGIN;

    for (var i = 0; i < margins.length; i++) {

        var mg = margins[i];

        var overlapX =
            mg.right > boxLeft &&
            mg.left < boxMiddle;

        var overlapY =
            mg.bottom < boxTop &&
            mg.top > boxBottom;

        if (overlapX && overlapY) {

            var newLeft = mg.right + SIDE_MARGIN;

            if (newLeft > item1Left) {
                item1Left = newLeft;
            }
        }
    }

    return item1Left;
}


// ======================
// TẠO NAME + BOX MÀU
// ======================
// function createNameLabels(doc, info, boxes, startIndex, count) {

//     var nameLayer = getOrCreateLayer(doc, "Name");
//     nameLayer.locked = false;
//     nameLayer.visible = true;

//     var firstBox = boxes[startIndex];
//     var lastBox = boxes[startIndex + count - 1];

//     if (!firstBox || !lastBox) return;

//     var textValue = info.id + " - " + info.name;
//     var color = getNameColor(info.id);

//     // Name chỉ nằm trên cột bắt đầu
//     var left = firstBox.left;
//     var right = firstBox.right;

//     var top = firstBox.labelY + 4;
//     var bottom = firstBox.top + 4;

//     var rect = nameLayer.pathItems.rectangle(
//         top,
//         left,
//         right - left,
//         top - bottom
//     );

//     rect.name = "BOX - " + textValue;
//     rect.stroked = true;
//     rect.filled = false;
//     rect.strokeWidth = 1.5;
//     rect.strokeColor = color;

//     var centerX = (left + right) / 2;
//     var labelY = firstBox.labelY;

//     var tf = nameLayer.textFrames.add();
//     tf.contents = textValue;
//     tf.name = textValue;

//     tf.textRange.characterAttributes.size = 14;
//     tf.textRange.characterAttributes.fillColor = color;

//     try {
//         tf.textRange.justification = Justification.CENTER;
//     } catch (e) { }

//     tf.position = [centerX, labelY];

//     try {
//         var b = tf.visibleBounds;
//         var textCenterX = (b[0] + b[2]) / 2;
//         tf.translate(centerX - textCenterX, 0);
//     } catch (e2) { }
// }

function createNameLabels(doc, info, boxes, startIndex, count) {

    var nameLayer = getOrCreateLayer(doc, "Name");
    nameLayer.locked = false;
    nameLayer.visible = true;

    var firstBox = boxes[startIndex];
    if (!firstBox) return;

    var textValue = info.id + " - " + info.name;
    var color = getNameColor(info.id);

    var rowsPerColumn = boxes.rowsPerColumn;

    var startColFloat = startIndex / rowsPerColumn;
    var endColFloat = (startIndex + count) / rowsPerColumn;

    var left = getXFromColumnFloat(boxes, startColFloat, false);
    var right = getXFromColumnFloat(boxes, endColFloat, true);

    if (right <= left) {
        right = left + firstBox.width;
    }

    // ======================
    // BOX NAME KHÔNG ĐƯỢC CHẠM TEMPLATE H
    // ======================
    var NAME_BOX_H_MM = 6.5;      // chiều cao box name
    var SAFE_GAP_MM = 1.5;        // khoảng cách tránh TEMPLATE H

    var nameBoxH = NAME_BOX_H_MM * PT_PER_MM;
    var safeGap = SAFE_GAP_MM * PT_PER_MM;

    // TEMPLATE H đầu tiên / hàng trên cùng
    var templateHTop = boxes[0].top;

    // đáy box Name luôn nằm trên TEMPLATE H
    var bottom = templateHTop + safeGap;
    var top = bottom + nameBoxH;

    var rect = nameLayer.pathItems.rectangle(
        top,
        left,
        right - left,
        nameBoxH
    );

    rect.name = "BOX - " + textValue;
    rect.stroked = true;
    rect.filled = false;
    rect.strokeWidth = 1.5;
    rect.strokeColor = color;

    var centerX = (left + right) / 2;
    var labelY = bottom + (nameBoxH * 0.68);

    var tf = nameLayer.textFrames.add();
    tf.contents = textValue;
    tf.name = textValue;

    tf.textRange.characterAttributes.size = 14;
    tf.textRange.characterAttributes.fillColor = color;

    try {
        tf.textRange.justification = Justification.CENTER;
    } catch (e) { }

    tf.position = [centerX, labelY];

    try {
        var b = tf.visibleBounds;
        var textCenterX = (b[0] + b[2]) / 2;
        tf.translate(centerX - textCenterX, 0);
    } catch (e2) { }
    drawEndMarkForName(nameLayer, boxes, startIndex, count, color);
    try {
        nameLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
    } catch (e3) { }
}
function drawEndMarkForName(nameLayer, boxes, startIndex, count, color) {

    var endIndex = startIndex + count - 1;
    var endBox = boxes[endIndex];

    if (!endBox) return;

    // Gạch nằm trùng TEMPLATE H ở đáy của ô cuối
    var y = endBox.bottom;

    // Gạch ngắn 1 ô thôi
    var left = endBox.left;
    var right = endBox.right;

    var line = nameLayer.pathItems.add();
    line.name = "END MARK - " + (endIndex + 1);

    line.setEntirePath([
        [left, y],
        [right, y]
    ]);

    line.stroked = true;
    line.filled = false;
    line.strokeWidth = 2;
    line.strokeColor = color;
}
function getXFromColumnFloat(boxes, colFloat, isEnd) {

    var rowsPerColumn = boxes.rowsPerColumn;

    var colIndex = Math.floor(colFloat);
    var fraction = colFloat - colIndex;

    // Nếu là điểm kết thúc đúng cột chẵn:
    // ví dụ 20.0 thì lấy mép phải cột 19, không lấy mép trái cột 20
    if (isEnd && Math.abs(fraction) < 0.0001 && colFloat > 0) {
        colIndex = colIndex - 1;
        fraction = 1;
    }

    var boxIndex = colIndex * rowsPerColumn;
    var box = boxes[boxIndex];

    if (!box) {
        var lastBox = boxes[boxes.length - rowsPerColumn];
        return lastBox.right;
    }

    return box.left + ((box.right - box.left) * fraction);
}
// ======================
// MÀU THEO ID
// ======================
function getNameColor(seed) {

    var colors = [
        [100, 50, 0, 0],
        [0, 50, 100, 0],
        [50, 100, 0, 0],
        [0, 100, 0, 0],
        [100, 0, 0, 0],
        [0, 0, 100, 0],
        [30, 30, 0, 0],
        [60, 0, 80, 0],
        [20, 80, 0, 0]
    ];

    var index = parseInt(seed, 10);

    if (isNaN(index)) {
        index = 0;
        for (var i = 0; i < String(seed).length; i++) {
            index += String(seed).charCodeAt(i);
        }
    }

    var cmyk = colors[index % colors.length];

    var c = new CMYKColor();
    c.cyan = cmyk[0];
    c.magenta = cmyk[1];
    c.yellow = cmyk[2];
    c.black = cmyk[3];

    return c;
}


// ======================
// ĐỔI FILE SAU KHI DONE
// ======================
function updatePdfAfterDone(pdfFile, doneFolder, inputFolder, info, doneQty, remainQty) {

    ensureFolder(doneFolder);

    var existedDoneQty = removeOldDoneAndGetQty(doneFolder, info.id, info.name);
    var newDoneTotal = existedDoneQty + doneQty;

    // var doneName = buildPdfName(info.id, newDoneTotal, info.name);
    var doneName = buildPdfName(info, newDoneTotal);
    var doneFile = new File(doneFolder.fsName + "/" + doneName);

    if (doneFile.exists) {
        doneFile.remove();
    }

    var copied = pdfFile.copy(doneFile.fsName);

    if (!copied) {
        throw new Error("Không copy được file sang done: " + pdfFile.name);
    }

    if (remainQty > 0) {

        // var remainName = buildPdfName(info.id, remainQty, info.name);
        var remainName = buildPdfName(info, remainQty);
        var remainFile = new File(inputFolder.fsName + "/" + remainName);

        if (remainFile.exists) {
            remainFile.remove();
        }

        var renamed = pdfFile.rename(remainName);

        if (!renamed) {
            throw new Error("Không đổi tên file còn lại: " + remainName);
        }

    } else {

        var removed = pdfFile.remove();

        if (!removed) {
            throw new Error("Không xóa file gốc sau khi done hết: " + pdfFile.name);
        }
    }
}


// ======================
// TÌM FILE DONE CŨ, LẤY QTY RỒI XÓA
// ======================
function removeOldDoneAndGetQty(doneFolder, id, itemName) {

    var files = doneFolder.getFiles("*.pdf");
    var total = 0;

    for (var i = files.length - 1; i >= 0; i--) {

        try {
            var info = parseFileName(files[i]);

            if (info.id == id && info.name == itemName) {
                total += info.qty;
                files[i].remove();
            }

        } catch (e) { }
    }

    return total;
}


// ======================
// LƯU FILE AI VÀ ĐÓNG FILE
// ======================
// function saveAiAndClose(doc, outputRoot, info) {

//     var outputFolder = getTodayOutputFolder(outputRoot);

//     var safeItem = safeFileName(info.name);

//     var aiName = "label - " + safeItem + info.id + ".ai";
//     var aiFile = new File(outputFolder.fsName + "/" + aiName);

//     if (aiFile.exists) {
//         aiFile.remove();
//     }

//     var saveOptions = new IllustratorSaveOptions();
//     saveOptions.compatibility = Compatibility.ILLUSTRATOR17;
//     saveOptions.pdfCompatible = true;
//     saveOptions.compressed = true;

//     doc.saveAs(aiFile, saveOptions);

//     app.redraw();
//     $.sleep(500);

//     doc.close(SaveOptions.DONOTSAVECHANGES);
// }
function saveAiAndClose(doc, outputRoot, info) {

    // TẮT MẮT TEMPLATE H / TEMPLATE W / MARGIN TRƯỚC KHI LƯU
    hideTemplateLayersBeforeSave(doc);

    var outputFolder = getTodayOutputFolder(outputRoot);

    var aiName = buildOutputName(info, outputFolder);
    var aiFile = new File(outputFolder.fsName + "/" + aiName);

    if (aiFile.exists) throw new Error("File output đã tồn tại: " + aiFile.fsName);

    var saveOptions = new IllustratorSaveOptions();
    saveOptions.compatibility = Compatibility.ILLUSTRATOR17;
    saveOptions.pdfCompatible = true;
    saveOptions.compressed = true;

    doc.saveAs(aiFile, saveOptions);

    app.redraw();
    $.sleep(500);

    doc.close(SaveOptions.DONOTSAVECHANGES);
}

// ======================
// FOLDER DONE / OUTPUT THEO NGÀY
// ======================
function getTodayDoneFolder(doneRoot) {

    var d = new Date();

    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = String(d.getFullYear()).slice(-2);

    var monthFolder = new Folder(doneRoot.fsName + "/thang" + month);
    ensureFolder(monthFolder);

    var dateFolder = new Folder(monthFolder.fsName + "/" + day + "-" + month + "-" + year);
    ensureFolder(dateFolder);

    return dateFolder;
}

function getTodayOutputFolder(outputRoot) {

    var d = new Date();

    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = String(d.getFullYear()).slice(-2);

    var monthFolder = new Folder(outputRoot.fsName + "/thang" + month);
    ensureFolder(monthFolder);

    var dateFolder = new Folder(monthFolder.fsName + "/" + day + "-" + month + "-" + year);
    ensureFolder(dateFolder);

    return dateFolder;
}


// ======================
// RELEASE ALL CLIP GROUPS
// ======================
function releaseAllClipGroups(doc, container) {

    var changed = true;
    var loop = 0;

    while (changed && loop < 50) {

        changed = false;
        loop++;

        var found = findFirstClipGroup(container);

        if (found) {

            try {
                doc.selection = null;
                found.selected = true;

                app.executeMenuCommand("releaseMask");

                app.redraw();
                $.sleep(100);

                changed = true;

            } catch (e) { }
        }
    }
}

function findFirstClipGroup(container) {

    try {

        for (var i = container.groupItems.length - 1; i >= 0; i--) {

            var g = container.groupItems[i];

            try {
                if (g.clipped === true) {
                    return g;
                }
            } catch (e) { }

            var nested = findFirstClipGroup(g);

            if (nested) {
                return nested;
            }
        }

    } catch (e2) { }

    return null;
}


// ======================
// XÓA PATH THƯỜNG
// ======================
function deleteLoosePaths(layer) {

    for (var i = layer.pathItems.length - 1; i >= 0; i--) {

        try {
            var p = layer.pathItems[i];

            if (!p.guides && !p.clipping) {
                p.remove();
            }

        } catch (e) { }
    }
}


// ======================
// SELECT / UNGROUP
// ======================
function selectAllInLayer(doc, layer) {

    doc.selection = null;

    for (var i = 0; i < layer.pageItems.length; i++) {
        try {
            layer.pageItems[i].selected = true;
        } catch (e) { }
    }
}

function ungroupSelected() {

    for (var i = 0; i < 20; i++) {

        try {
            app.executeMenuCommand("ungroup");
            app.redraw();
            $.sleep(100);
        } catch (e) {
            break;
        }
    }
}


// ======================
// UNIQUE
// ======================
function uniqueNumbers(arr) {

    var result = [];
    var tolerance = 0.5;

    for (var i = 0; i < arr.length; i++) {

        var exists = false;

        for (var j = 0; j < result.length; j++) {

            if (Math.abs(arr[i] - result[j]) <= tolerance) {
                exists = true;
                break;
            }
        }

        if (!exists) {
            result.push(arr[i]);
        }
    }

    return result;
}


// ======================
// FILE / FOLDER
// ======================
function ensureFolder(folder) {

    if (!folder.exists) {
        folder.create();
    }
}

function moveFileSafe(file, targetFolder) {

    ensureFolder(targetFolder);

    var newFile = getUniqueFile(targetFolder, decodeURI(file.name));

    var copied = file.copy(newFile.fsName);

    if (!copied) {
        throw new Error("Không copy được file: " + file.fsName);
    }

    var removed = file.remove();

    if (!removed) {
        throw new Error("Copy được nhưng không xóa được file gốc: " + file.fsName);
    }
}

function getUniqueFile(folder, fileName) {

    var base = fileName.replace(/\.pdf$/i, "");
    var ext = ".pdf";

    var f = new File(folder.fsName + "/" + fileName);

    var count = 1;

    while (f.exists) {
        f = new File(folder.fsName + "/" + base + "_" + count + ext);
        count++;
    }

    return f;
}

function safeFileName(name) {

    return String(name)
        .replace(/[\\\/:\*\?"<>\|]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");
}


// ======================
// LAYER
// ======================
function getOrCreateLayer(doc, layerName) {

    try {
        return doc.layers.getByName(layerName);
    } catch (e) {
        var layer = doc.layers.add();
        layer.name = layerName;
        return layer;
    }
}

function clearLayer(layer) {

    for (var i = layer.pageItems.length - 1; i >= 0; i--) {

        try {
            layer.pageItems[i].remove();
        } catch (e) { }
    }
}

function showAlert(msg) {
    app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
    alert(msg);
}

// ======================
// TẮT MẮT LAYER TRƯỚC KHI LƯU
// ======================
function hideTemplateLayersBeforeSave(doc) {

    var names = ["TEMPLATE H", "TEMPLATE W", "MARGIN"];

    for (var i = 0; i < names.length; i++) {
        try {
            var layer = doc.layers.getByName(names[i]);
            layer.visible = false;
        } catch (e) { }
    }
}

function buildOutputName(info, outputFolder) {
    var flow = String(info.flow || "").toUpperCase();
    if (flow !== "FBA" && flow !== "FBM") throw new Error("Tên PDF phải bắt đầu bằng FBA hoặc FBM.");
    var today = new Date();
    var day = ("0" + today.getDate()).slice(-2);
    var month = ("0" + (today.getMonth() + 1)).slice(-2);
    var prefix = flow + "_" + day + "-" + month + "-" + today.getFullYear() + "_";
    var files = outputFolder.getFiles("*.ai");
    var nextNumber = 1;
    for (var fileIndex = 0; fileIndex < files.length; fileIndex++) {
        var fileName = decodeURI(files[fileIndex].name);
        if (fileName.indexOf(prefix) !== 0) continue;
        var suffix = fileName.substring(prefix.length).match(/^(\d+)\.ai$/i);
        if (suffix) nextNumber = Math.max(nextNumber, parseInt(suffix[1], 10) + 1);
    }
    return prefix + (nextNumber < 10 ? "0" : "") + nextNumber + ".ai";
}

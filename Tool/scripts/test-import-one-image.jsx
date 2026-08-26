var CODEX_RESULT_PATH = typeof CODEX_RESULT_PATH !== 'undefined' ? CODEX_RESULT_PATH : '';
var CODEX_IMAGE_PATH = typeof CODEX_IMAGE_PATH !== 'undefined' ? CODEX_IMAGE_PATH : '';
var CODEX_TEMPLATE_PATH = typeof CODEX_TEMPLATE_PATH !== 'undefined' ? CODEX_TEMPLATE_PATH : '';
var CODEX_TEST_EXPECTED_HEIGHT_CM = typeof CODEX_TEST_EXPECTED_HEIGHT_CM !== 'undefined' ? CODEX_TEST_EXPECTED_HEIGHT_CM : '60.96';
var CODEX_TEST_SIDE_COUNT = typeof CODEX_TEST_SIDE_COUNT !== 'undefined' ? Number(CODEX_TEST_SIDE_COUNT) : 1;
var CODEX_TEST_COLOR_REGIONS = typeof CODEX_TEST_COLOR_REGIONS !== 'undefined' ? CODEX_TEST_COLOR_REGIONS : null;
var CODEX_TEST_FACE_TOLERANCE_CM = typeof CODEX_TEST_FACE_TOLERANCE_CM !== 'undefined' ? Math.max(0, Number(CODEX_TEST_FACE_TOLERANCE_CM)) : 0.01;
var CODEX_TEST_CUT_TOLERANCE_CM = typeof CODEX_TEST_CUT_TOLERANCE_CM !== 'undefined' ? Math.max(0, Number(CODEX_TEST_CUT_TOLERANCE_CM)) : 0.05;
var TEST_TWO_SIDE_FAILURE_REASONS = [];
function addTestTwoSideFailure(axis, frontValue, backValue, delta) {
  TEST_TWO_SIDE_FAILURE_REASONS.push(axis + ': Front=' + frontValue + 'cm | Back=' + backValue + 'cm | \u006c\u1ec7\u0063\u0068=' + delta + 'cm');
}
function testTwoSideFailureReason() {
  return TEST_TWO_SIDE_FAILURE_REASONS.length ? '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: 2 side bị \u006c\u1ec7\u0063\u0068, \u0076\u0075\u0069 \u006c\u00f2\u006e\u0067 \u006b\u0069\u1ec3\u006d \u0074\u0072\u0061 \u006c\u1ea1\u0069! | ' + TEST_TWO_SIDE_FAILURE_REASONS.join(' || ') + ' | Sai số tối đa=' + roundedTest(CODEX_TEST_FACE_TOLERANCE_CM) + 'cm' : '';
}
function writeResult(success, message) {
  if (!CODEX_RESULT_PATH) return;
  var file = new File(CODEX_RESULT_PATH);
  file.encoding = 'UTF-8';
  file.open('w');
  file.write('{"success":' + (success ? 'true' : 'false') + ',"message":"' + String(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}');
  file.close();
}
function testColorRegions(colorRegions) {
  if (!colorRegions || !colorRegions.regions) return { ok: false, message: 'TEST_COLOR_RESULT: false | reason=NO_COLOR_REGION_DATA' };
  var labels = CODEX_TEST_SIDE_COUNT >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  var failures = [];
  var frontMaskTop = null;
  var backMaskTop = null;
  for (var i = 0; i < labels.length; i += 1) {
    var label = labels[i];
    var region = colorRegions.regions[label];
    if (!region || Number(region.pixels || 0) <= 0 || region.empty === true) failures.push(label);
  }
  return { ok: failures.length === 0, message: failures.length === 0 ? 'TEST_COLOR_RESULT: true | readable=' + labels.join(',') : 'TEST_COLOR_RESULT: false | missing=' + failures.join(',') };
}

function testColorRegionBounds(sourceItem, colorRegions, label) {
  if (!colorRegions || !colorRegions.regions || !colorRegions.regions[label]) return null;
  var region = colorRegions.regions[label];
  if (Number(region.pixels || 0) <= 0 || region.empty === true) return null;
  var sourceBounds = sourceItem.visibleBounds;
  var sx = (sourceBounds[2] - sourceBounds[0]) / Number(colorRegions.imageWidthPx);
  var sy = (sourceBounds[1] - sourceBounds[3]) / Number(colorRegions.imageHeightPx);
  return {
    left: sourceBounds[0] + Number(region.minX) * sx,
    top: sourceBounds[1] - Number(region.minY) * sy,
    right: sourceBounds[0] + (Number(region.maxX) + 1) * sx,
    bottom: sourceBounds[1] - (Number(region.maxY) + 1) * sy,
    leftPoint: region.leftPoint ? [sourceBounds[0] + Number(region.leftPoint.x) * sx, sourceBounds[1] - Number(region.leftPoint.y) * sy] : null,
    topPoint: region.topPoint ? [sourceBounds[0] + Number(region.topPoint.x) * sx, sourceBounds[1] - Number(region.topPoint.y) * sy] : null,
    leftTopPoint: region.leftTopPoint ? [sourceBounds[0] + Number(region.leftTopPoint.x) * sx, sourceBounds[1] - Number(region.leftTopPoint.y) * sy] : null
  };
}
function testColorStroke(label) {
  var color = new RGBColor();
  color.red = 255; color.green = 128; color.blue = 0;
  return color;
}
function drawTestLine(layer, name, start, end, color) {
  var line = layer.pathItems.add();
  line.name = name;
  line.setEntirePath([start, end]);
  line.stroked = true;
  line.filled = false;
  line.strokeWidth = 0.25;
  line.strokeColor = color;
  return line;
}
function drawTestText(layer, name, contents, position, color) {
  try {
    var frame = layer.textFrames.add();
    frame.name = name;
    frame.contents = contents;
    frame.position = position;
    frame.textRange.characterAttributes.size = 9;
    frame.textRange.characterAttributes.fillColor = color;
    return frame;
  } catch (error) { return null; }
}
function testCandidateToCm(sourceItem, colorRegions, label, candidate, maskLeft, maskTop) {
  var sourceBounds = sourceItem.visibleBounds;
  var sx = (sourceBounds[2] - sourceBounds[0]) / Number(colorRegions.imageWidthPx);
  var sy = (sourceBounds[1] - sourceBounds[3]) / Number(colorRegions.imageHeightPx);
  return {
    leftX: ((sourceBounds[0] + Number(candidate.x) * sx) - maskLeft) / 28.346456692913385,
    y: (maskTop - (sourceBounds[1] - Number(candidate.y) * sy)) / 28.346456692913385,
    point: [sourceBounds[0] + Number(candidate.x) * sx, sourceBounds[1] - Number(candidate.y) * sy],
    width: (Number(candidate.widthPx) * sx) / 28.346456692913385
  };
}
function pickTestSharedSparseLeftPair(sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft) {
  var frontRegion = colorRegions && colorRegions.regions ? colorRegions.regions.FRONT : null;
  var backRegion = colorRegions && colorRegions.regions ? colorRegions.regions.BACK : null;
  var frontListRaw = frontRegion && frontRegion.leftCandidates ? frontRegion.leftCandidates : [];
  var backListRaw = backRegion && backRegion.leftCandidates ? backRegion.leftCandidates : [];
  if (!frontListRaw.length || !backListRaw.length) return null;
  var frontList = [], backList = [];
  for (var f = 0; f < frontListRaw.length; f += 1) frontList.push(testCandidateToCm(sourceItem, colorRegions, 'FRONT', frontListRaw[f], maskLeft, frontMaskTop));
  for (var b = 0; b < backListRaw.length; b += 1) backList.push(testCandidateToCm(sourceItem, colorRegions, 'BACK', backListRaw[b], maskLeft, backMaskTop));
  var minY = frontList[0].y, maxY = frontList[0].y;
  for (var r = 0; r < frontList.length; r += 1) { if (frontList[r].y < minY) minY = frontList[r].y; if (frontList[r].y > maxY) maxY = frontList[r].y; }
  var targetY = minY + (maxY - minY) * 0.62;
  frontList.sort(function(a, b) { return Math.abs(a.y - targetY) - Math.abs(b.y - targetY) || a.width - b.width; });
  for (var i = 0; i < frontList.length; i += 1) {
    var frontCandidate = frontList[i];
    for (var j = 0; j < backList.length; j += 1) {
      if (Math.abs(frontCandidate.y - backList[j].y) <= 0.01) return { front: frontCandidate, back: backList[j] };
    }
  }
  return null;
}
function drawTestCheckLeftPointFrontBack(layer, sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft) {
  var pair = pickTestSharedSparseLeftPair(sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft);
  if (!pair) { $.writeln('TEST_CHECK_LEFT_POINT_FRONT_BACK: false | reason=NO_SHARED_SPARSE_LEFT_ROW'); return 'TEST_CHECK_LEFT_POINT_FRONT_BACK: false | reason=NO_SHARED_SPARSE_LEFT_ROW'; }
  var blueColor = new RGBColor(); blueColor.red = 0; blueColor.green = 90; blueColor.blue = 255;
  var redColor = new RGBColor(); redColor.red = 255; redColor.green = 0; redColor.blue = 0;
  drawTestLine(layer, 'TEST_CHECK_LEFT_POINT_FRONT_LINE', [maskLeft, pair.front.point[1]], pair.front.point, blueColor);
  drawTestLine(layer, 'TEST_CHECK_LEFT_POINT_BACK_LINE', [maskLeft, pair.back.point[1]], pair.back.point, redColor);
  var delta = Math.round((pair.front.leftX - pair.back.leftX) * 1000) / 1000;
  var ok = Math.abs(delta) <= CODEX_TEST_FACE_TOLERANCE_CM;
  var frontLeftText = (Math.round(pair.front.leftX * 1000) / 1000) + 'cm';
  var backLeftText = (Math.round(pair.back.leftX * 1000) / 1000) + 'cm';
  drawTestText(layer, 'TEST_CHECK_LEFT_POINT_FRONT_LABEL', frontLeftText, [maskLeft + 4, pair.front.point[1] + 10], blueColor);
  drawTestText(layer, 'TEST_CHECK_LEFT_POINT_BACK_LABEL', backLeftText, [maskLeft + 4, pair.back.point[1] + 10], redColor);
  if (!ok) addTestTwoSideFailure('LEFT', Math.round(pair.front.leftX * 1000) / 1000, Math.round(pair.back.leftX * 1000) / 1000, delta);
  var message = 'TEST_CHECK_LEFT_POINT_FRONT_BACK: ' + (ok ? 'true' : 'false') + ' | front.left=' + frontLeftText + ' | back.left=' + backLeftText + ' | deltaLeft=' + delta + 'cm | sharedYFront=' + (Math.round(pair.front.y * 1000) / 1000) + 'cm | sharedYBack=' + (Math.round(pair.back.y * 1000) / 1000) + 'cm | note=shared sparse-left row | tolerance=' + roundedTest(CODEX_TEST_FACE_TOLERANCE_CM) + 'cm';
  $.writeln(message);
  return message;
}
function testTopCandidateToCm(sourceItem, colorRegions, candidate, maskLeft, maskTop) {
  var sourceBounds = sourceItem.visibleBounds;
  var sx = (sourceBounds[2] - sourceBounds[0]) / Number(colorRegions.imageWidthPx);
  var sy = (sourceBounds[1] - sourceBounds[3]) / Number(colorRegions.imageHeightPx);
  return {
    x: ((sourceBounds[0] + Number(candidate.x) * sx) - maskLeft) / 28.346456692913385,
    topY: (maskTop - (sourceBounds[1] - Number(candidate.y) * sy)) / 28.346456692913385,
    point: [sourceBounds[0] + Number(candidate.x) * sx, sourceBounds[1] - Number(candidate.y) * sy],
    height: (Number(candidate.heightPx) * sy) / 28.346456692913385
  };
}
function pickTestSharedTopPair(sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft) {
  var frontRegion = colorRegions && colorRegions.regions ? colorRegions.regions.FRONT : null;
  var backRegion = colorRegions && colorRegions.regions ? colorRegions.regions.BACK : null;
  var frontRaw = frontRegion && frontRegion.topCandidates ? frontRegion.topCandidates : [];
  var backRaw = backRegion && backRegion.topCandidates ? backRegion.topCandidates : [];
  if (!frontRaw.length || !backRaw.length) return null;
  var frontList = [], backList = [];
  for (var f = 0; f < frontRaw.length; f += 1) frontList.push(testTopCandidateToCm(sourceItem, colorRegions, frontRaw[f], maskLeft, frontMaskTop));
  for (var b = 0; b < backRaw.length; b += 1) backList.push(testTopCandidateToCm(sourceItem, colorRegions, backRaw[b], maskLeft, backMaskTop));
  var minX = frontList[0].x, maxX = frontList[0].x;
  for (var r = 0; r < frontList.length; r += 1) { if (frontList[r].x < minX) minX = frontList[r].x; if (frontList[r].x > maxX) maxX = frontList[r].x; }
  var targetX = minX + (maxX - minX) * 0.20;
  frontList.sort(function(a, b) { return Math.abs(a.x - targetX) - Math.abs(b.x - targetX) || a.height - b.height; });
  for (var i = 0; i < frontList.length; i += 1) {
    var frontCandidate = frontList[i];
    for (var j = 0; j < backList.length; j += 1) {
      if (Math.abs(frontCandidate.x - backList[j].x) <= 0.01) return { front: frontCandidate, back: backList[j] };
    }
  }
  return null;
}
function drawTestCheckTopPointFrontBack(layer, sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft) {
  var pair = pickTestSharedTopPair(sourceItem, colorRegions, frontMaskTop, backMaskTop, maskLeft);
  if (!pair) { $.writeln('TEST_CHECK_TOP_POINT_FRONT_BACK: false | reason=NO_SHARED_LEFT_SIDE_COLUMN'); return 'TEST_CHECK_TOP_POINT_FRONT_BACK: false | reason=NO_SHARED_LEFT_SIDE_COLUMN'; }
  var blueColor = new RGBColor(); blueColor.red = 0; blueColor.green = 90; blueColor.blue = 255;
  var redColor = new RGBColor(); redColor.red = 255; redColor.green = 0; redColor.blue = 0;
  drawTestLine(layer, 'TEST_CHECK_TOP_POINT_FRONT_LINE', [pair.front.point[0], frontMaskTop], pair.front.point, blueColor);
  drawTestLine(layer, 'TEST_CHECK_TOP_POINT_BACK_LINE', [pair.back.point[0], backMaskTop], pair.back.point, redColor);
  var delta = Math.round((pair.front.topY - pair.back.topY) * 1000) / 1000;
  var ok = Math.abs(delta) <= CODEX_TEST_FACE_TOLERANCE_CM;
  var frontTopText = (Math.round(pair.front.topY * 1000) / 1000) + 'cm';
  var backTopText = (Math.round(pair.back.topY * 1000) / 1000) + 'cm';
  drawTestText(layer, 'TEST_CHECK_TOP_POINT_FRONT_LABEL', frontTopText, [pair.front.point[0] + 4, frontMaskTop - 12], blueColor);
  drawTestText(layer, 'TEST_CHECK_TOP_POINT_BACK_LABEL', backTopText, [pair.back.point[0] + 4, backMaskTop - 12], redColor);
  if (!ok) addTestTwoSideFailure('TOP', Math.round(pair.front.topY * 1000) / 1000, Math.round(pair.back.topY * 1000) / 1000, delta);
  var message = 'TEST_CHECK_TOP_POINT_FRONT_BACK: ' + (ok ? 'true' : 'false') + ' | front.top=' + frontTopText + ' | back.top=' + backTopText + ' | deltaTop=' + delta + 'cm | sharedXFront=' + (Math.round(pair.front.x * 1000) / 1000) + 'cm | sharedXBack=' + (Math.round(pair.back.x * 1000) / 1000) + 'cm | note=shared left-side column | tolerance=' + roundedTest(CODEX_TEST_FACE_TOLERANCE_CM) + 'cm';
  $.writeln(message);
  return message;
}

function testEdgeDistances(sourceItem, colorRegions, label, maskLeft, maskRight, maskBottom) {
  var bounds = testColorRegionBounds(sourceItem, colorRegions, label);
  if (!bounds) return null;
  var cmPerPoint = 1 / 28.346456692913385;
  return {
    left: (bounds.left - maskLeft) * cmPerPoint,
    right: (maskRight - bounds.right) * cmPerPoint,
    bottom: (bounds.bottom - maskBottom) * cmPerPoint
  };
}
function roundedTest(value) { return Math.round(Number(value) * 1000) / 1000; }
function testCutAlignment(sourceItem, sideCount, colorRegions, sourceBounds) {
  var maskSize = 30.48 * 28.346456692913385;
  var sourceCenterY = (sourceBounds[1] + sourceBounds[3]) / 2;
  var frontMaskTop = sideCount >= 2 ? sourceCenterY + maskSize / 2 : sourceBounds[3] + maskSize;
  var backMaskTop = sideCount >= 2 ? sourceBounds[3] + maskSize : null;
  var maskLeft = sourceBounds[0];
  var maskRight = maskLeft + maskSize;
  var lazerTop = sourceBounds[1];
  var lazer = testEdgeDistances(sourceItem, colorRegions, 'LAZER', maskLeft, maskRight, lazerTop - maskSize);
  if (!lazer) return { ok: false, message: 'CHECK_CUT_ALIGNMENT: false | reason=missing_lazer_measurement' };
  var targetLabel = sideCount >= 2 ? 'FRONT/BACK' : 'FRONT';
  var front = testEdgeDistances(sourceItem, colorRegions, 'FRONT', maskLeft, maskRight, frontMaskTop - maskSize);
  if (!front) return { ok: false, message: 'CHECK_CUT_ALIGNMENT: false | reason=missing_front_measurement' };
  var back = sideCount >= 2 ? testEdgeDistances(sourceItem, colorRegions, 'BACK', maskLeft, maskRight, backMaskTop - maskSize) : null;
  if (sideCount >= 2 && !back) return { ok: false, message: 'CHECK_CUT_ALIGNMENT: false | reason=missing_back_measurement' };
  var tolerance = CODEX_TEST_CUT_TOLERANCE_CM;
  var leftFront = front.left - lazer.left;
  var rightFront = front.right - lazer.right;
  var bottomFront = front.bottom - lazer.bottom;
  var leftBack = back ? back.left - lazer.left : null;
  var rightBack = back ? back.right - lazer.right : null;
  var bottomBack = back ? back.bottom - lazer.bottom : null;
  var values = sideCount >= 2 ? [leftFront, leftBack, rightFront, rightBack, bottomFront, bottomBack] : [leftFront, rightFront, bottomFront];
  var minValue = values[0], maxValue = values[0];
  for (var valueIndex = 1; valueIndex < values.length; valueIndex += 1) { if (values[valueIndex] < minValue) minValue = values[valueIndex]; if (values[valueIndex] > maxValue) maxValue = values[valueIndex]; }
  var spread = maxValue - minValue;
  var ok = spread <= tolerance;
  var message = 'CHECK_CUT_ALIGNMENT: ' + (ok ? 'true' : 'false') + ' | mode=' + targetLabel + ' | tolerance=' + tolerance + 'cm | leftFront=' + roundedTest(leftFront) + 'cm | rightFront=' + roundedTest(rightFront) + 'cm | bottomFront=' + roundedTest(bottomFront) + 'cm' + (sideCount >= 2 ? ' | leftBack=' + roundedTest(leftBack) + 'cm | rightBack=' + roundedTest(rightBack) + 'cm | bottomBack=' + roundedTest(bottomBack) + 'cm' : '') + ' | min=' + roundedTest(minValue) + 'cm | max=' + roundedTest(maxValue) + 'cm | spread=' + roundedTest(spread) + 'cm';
  return { ok: ok, message: message, reason: ok ? '' : '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: L\u1ec7\u0063\u0068 \u0111\u01b0\u1edd\u006e\u0067 \u0063\u1eaf\u0074 | ' + message };
}
function drawTestColorChecks(doc, sourceItem, sideCount, colorRegions) {
  var layer = doc.layers.add();
  layer.name = 'TEST_COLOR_CHECK_LINES';
  var labels = sideCount >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  var sourceBounds = sourceItem.visibleBounds;
  var maskSize = 30.48 * 28.346456692913385;
  var sourceCenterY = (sourceBounds[1] + sourceBounds[3]) / 2;
  var modes = sideCount >= 2 ? ['top', 'center', 'bottom'] : ['top', 'bottom'];
  var cmPerPoint = 1 / 28.346456692913385;
  var drawn = 0;
  for (var i = 0; i < labels.length; i += 1) {
    var label = labels[i];
    var regionBounds = testColorRegionBounds(sourceItem, colorRegions, label);
    if (!regionBounds) { $.writeln('TEST_COLOR_DRAW_' + label + ': false | reason=NO_COLOR_BOUNDS'); continue; }
    var color = testColorStroke(label);
    var detectedFrame = layer.pathItems.rectangle(regionBounds.top, regionBounds.left, regionBounds.right - regionBounds.left, regionBounds.top - regionBounds.bottom);
    detectedFrame.name = 'TEST_COLOR_DETECTED_FRAME_' + label;
    detectedFrame.filled = false;
    detectedFrame.stroked = true;
    detectedFrame.strokeWidth = 0.25;
    detectedFrame.strokeColor = color;
    var maskTop = sourceBounds[1];
    if (modes[i] === 'center') maskTop = sourceCenterY + maskSize / 2;
    if (modes[i] === 'bottom') maskTop = sourceBounds[3] + maskSize;
    if (label === 'FRONT') frontMaskTop = maskTop;
    if (label === 'BACK') backMaskTop = maskTop;
    var maskBottom = maskTop - maskSize;
    var maskLeft = sourceBounds[0];
    var maskRight = maskLeft + maskSize;
    var measureY = (regionBounds.top + regionBounds.bottom) / 2;
    var bottomX = (regionBounds.left + regionBounds.right) / 2;
    drawTestLine(layer, 'TEST_COLOR_LEFT_' + label, [maskLeft, measureY], [regionBounds.left, measureY], color);
    drawTestLine(layer, 'TEST_COLOR_RIGHT_' + label, [regionBounds.right, measureY], [maskRight, measureY], color);
    drawTestLine(layer, 'TEST_COLOR_BOTTOM_' + label, [bottomX, maskBottom], [bottomX, regionBounds.bottom], color);
    var leftCm = ((regionBounds.left - maskLeft) * cmPerPoint).toFixed(3);
    var rightCm = ((maskRight - regionBounds.right) * cmPerPoint).toFixed(3);
    var bottomCm = ((regionBounds.bottom - maskBottom) * cmPerPoint).toFixed(3);
    drawTestText(layer, 'TEST_COLOR_LABEL_LEFT_' + label, leftCm + 'cm', [maskLeft + 4, measureY + 12], color);
    drawTestText(layer, 'TEST_COLOR_LABEL_RIGHT_' + label, rightCm + 'cm', [regionBounds.right + 4, measureY + 12], color);
    drawTestText(layer, 'TEST_COLOR_LABEL_BOTTOM_' + label, bottomCm + 'cm', [bottomX + 4, maskBottom + 12], color);
    $.writeln('TEST_COLOR_DRAW_' + label + ': true | Trai=' + leftCm + 'cm | Phai=' + rightCm + 'cm | Duoi=' + bottomCm + 'cm | leftPixel=' + (regionBounds.leftPoint ? regionBounds.leftPoint[0] + ',' + regionBounds.leftPoint[1] : 'none') + ' | topPixel=' + (regionBounds.topPoint ? regionBounds.topPoint[0] + ',' + regionBounds.topPoint[1] : 'none'));
    drawn += 1;
  }
  var compareMessage = sideCount >= 2 && frontMaskTop !== null && backMaskTop !== null ? drawTestCheckLeftPointFrontBack(layer, sourceItem, colorRegions, frontMaskTop, backMaskTop, sourceBounds[0]) : '';
  var topCompareMessage = sideCount >= 2 && frontMaskTop !== null && backMaskTop !== null ? drawTestCheckTopPointFrontBack(layer, sourceItem, colorRegions, frontMaskTop, backMaskTop, sourceBounds[0]) : '';
  return 'TEST_COLOR_DRAW_RESULT: ' + (drawn === labels.length ? 'true' : 'false') + ' | drawn=' + drawn + '/' + labels.length + (compareMessage ? ' | ' + compareMessage : '') + (topCompareMessage ? ' | ' + topCompareMessage : '');
}

function createTestLayout(doc, sourceItem, sideCount) {
  var layer = doc.layers.add();
  layer.name = 'TEST_RECTANGLE_BOXES_30_48CM';
  var sourceBounds = sourceItem.visibleBounds;
  var sourceLeft = sourceBounds[0];
  var sourceTop = sourceBounds[1];
  var sourceRight = sourceBounds[2];
  var sourceBottom = sourceBounds[3];
  var sourceCenterY = (sourceTop + sourceBottom) / 2;
  var count = sideCount >= 2 ? 3 : 2;
  var labels = sideCount >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  var modes = sideCount >= 2 ? ['top', 'center', 'bottom'] : ['top', 'bottom'];
  var maskSize = 30.48 * 28.346456692913385;
  for (var i = 0; i < count; i += 1) {
    var top = sourceTop;
    if (modes[i] === 'center') top = sourceCenterY + (maskSize / 2);
    if (modes[i] === 'bottom') top = sourceBottom + maskSize;
    var box = layer.pathItems.rectangle(top, sourceLeft, maskSize, maskSize);
    box.name = 'TEST_RECTANGLE_30_48CM_' + labels[i];
    box.filled = false;
    box.stroked = true;
    box.strokeWidth = 1;
    var color = new RGBColor();
    color.red = 0; color.green = 180; color.blue = 80;
    box.strokeColor = color;
    $.writeln('TEST_RECTANGLE_' + labels[i] + ': W=30.48cm | H=30.48cm | alignToImportedImage=' + modes[i] + ' | left=' + sourceLeft + 'pt | top=' + top + 'pt');
  }
  return 'TEST_RECTANGLE_LAYOUT: ' + count + ' \u00f4 \u0076\u0075\u00f4\u006e\u0067 Rectangle Tool 30.48cm \u0063\u0103\u006e \u0074\u0068\u0065\u006f \u1ea3\u006e\u0068 \u0111\u00e3 \u0069\u006d\u0070\u006f\u0072\u0074 | ' + labels.join(',') + ' | \u0063\u0103\u006e=' + modes.join(',');
}
function boundsOf(item) {
  var b = item.visibleBounds;
  return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: b[2] - b[0], height: b[1] - b[3] };
}
try {
  var templateFile = new File(CODEX_TEMPLATE_PATH);
  var doc = templateFile.exists ? app.open(templateFile) : app.documents.add(DocumentColorSpace.RGB, 1200, 1200);
  doc.activate();
  var layer = doc.layers.add();
  layer.name = 'TEST_IMPORT_ONE_IMAGE';
  var placed = layer.placedItems.add();
  placed.file = new File(CODEX_IMAGE_PATH);
  placed.position = [50, doc.height - 50];
  try { placed.embed(); } catch (embedError) {}
  placed.name = 'TEST_IMAGE_SOURCE_ONCE';
  app.redraw();
  var b = boundsOf(placed);
  var widthCm = Math.round((b.width / 28.346456692913385) * 1000) / 1000;
  var heightCm = Math.round((b.height / 28.346456692913385) * 1000) / 1000;
  var widthOk = Math.abs(widthCm - 30.48) <= 0.01;
  var expectedHeightCm = Number(CODEX_TEST_EXPECTED_HEIGHT_CM);
  var heightOk = Math.abs(heightCm - expectedHeightCm) <= 0.01;
  var sizeOk = widthOk && heightOk;
  var colorResult = testColorRegions(CODEX_TEST_COLOR_REGIONS);
  var ok = sizeOk && colorResult.ok;
  var message = 'TEST_IMAGE_SIZE: W=' + widthCm + 'cm | H=' + heightCm + 'cm | expectedW=30.48cm | expectedH=' + expectedHeightCm + 'cm | ' + (sizeOk ? 'true' : 'false');
  if (!sizeOk) { writeResult(false, message + ' | ' + colorResult.message); }
  else {
    var layoutMessage = createTestLayout(doc, placed, CODEX_TEST_SIDE_COUNT);
    var colorDrawMessage = drawTestColorChecks(doc, placed, CODEX_TEST_SIDE_COUNT, CODEX_TEST_COLOR_REGIONS);
    var twoSideReason = testTwoSideFailureReason();
    var cutResult = (ok && !twoSideReason) ? testCutAlignment(placed, CODEX_TEST_SIDE_COUNT, CODEX_TEST_COLOR_REGIONS, placed.visibleBounds) : { ok: false, message: 'CHECK_CUT_ALIGNMENT: skipped | reason=previous_check_false', reason: '' };
    var finalOk = ok && !twoSideReason && cutResult.ok;
    writeResult(finalOk, message + ' | ' + colorResult.message + ' | ' + colorDrawMessage + ' | ' + layoutMessage + (twoSideReason ? ' | ' + twoSideReason : '') + ' | ' + cutResult.message + (cutResult.reason ? ' | ' + cutResult.reason : ''));
  }
} catch (error) {
  writeResult(false, String(error));
  throw error;
}

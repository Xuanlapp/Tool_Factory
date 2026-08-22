var CM_TO_POINT = 28.346456692913385;
var POINT_TO_CM = 1 / CM_TO_POINT;
var MASK_SIZE_CM = 30.48;
var MASK_SIZE_POINT = MASK_SIZE_CM * CM_TO_POINT;
var EQUAL_TOLERANCE_CM = 0.05;
var CHECK_BOTTOM_TOLERANCE_CM = 0.05;
var CHECK_LEFT_BAR_TOLERANCE_CM = 0.01;
var PACK_MARGIN_CM = 2;
var PACK_GAP_CM = 0.2;
var PACK_MARGIN_POINT = PACK_MARGIN_CM * CM_TO_POINT;
var PACK_GAP_POINT = PACK_GAP_CM * CM_TO_POINT;
var PACK_ROW_TOLERANCE_POINT = 0.25 * CM_TO_POINT;
var LAZER_MASK_BLEED_CM = 0.25;
var LAZER_MASK_BLEED_POINT = LAZER_MASK_BLEED_CM * CM_TO_POINT;
var LAZER_STROKE_WIDTH = 0.8;
var CODEX_REPORTS = [];
var CODEX_CHECK_MEASUREMENTS = {};
var CODEX_SUPPRESS_REDRAW = false;
var REDRAW_AT_BATCH_END = true;
var DEBUG_LAZER_STEPS_ENABLED = false;
try { DEBUG_LAZER_STEPS_ENABLED = typeof CODEX_DEBUG_LAZER_STEPS !== 'undefined' && CODEX_DEBUG_LAZER_STEPS === true; } catch (error) { DEBUG_LAZER_STEPS_ENABLED = false; }
var IGNORE_CHECK_FALSE = false;
try { IGNORE_CHECK_FALSE = typeof CODEX_IGNORE_CHECK_FALSE !== 'undefined' && CODEX_IGNORE_CHECK_FALSE === true; } catch (error) { IGNORE_CHECK_FALSE = false; }
var QTY_COPY_GAP_CM = 0.2;
var QTY_COPY_GAP_POINT = QTY_COPY_GAP_CM * CM_TO_POINT;
var PACKING_MODE = 'FAST';
// Bounds + exact 0.2 cm bounds gap is deliberately used in FAST mode. It is
// conservative (never overlaps a border) and avoids expensive path-pair loops.
var USE_POLYGON_COLLISION = true;
var MAX_FAST_ANGLES = 6;
var MAX_FAST_CANDIDATES = 72;

function ptToCm(value) { return Math.round(value * POINT_TO_CM * 1000) / 1000; }
function addReport(message) { try { CODEX_REPORTS.push(message); } catch (error) {} }

function absCmDelta(a, b) { return Math.round(Math.abs(Number(a || 0) - Number(b || 0)) * 1000) / 1000; }
function signedCmDelta(a, b) { return Math.round((Number(a || 0) - Number(b || 0)) * 1000) / 1000; }

function buildCheckFailReason(sideCount) {
  var lazer = CODEX_CHECK_MEASUREMENTS.lazer;
  var front = CODEX_CHECK_MEASUREMENTS.front;
  var back = CODEX_CHECK_MEASUREMENTS.back;
  var reasonPrefix = '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: ';
  if (!lazer) return reasonPrefix + 'Không đọc được số đo Lazer.';
  if (Number(sideCount) >= 2) {
    if (!front || !back) return reasonPrefix + (!front && !back ? 'Không đọc được số đo Front và Back.' : !front ? 'Không đọc được số đo Front.' : 'Không đọc được số đo Back.');
    var frontOffset = compareLazerOffset(front, lazer, CHECK_BOTTOM_TOLERANCE_CM);
    var backOffset = compareLazerOffset(back, lazer, CHECK_BOTTOM_TOLERANCE_CM);
    return reasonPrefix + 'front.deltaTrai=' + frontOffset.leftDelta + 'cm | front.deltaPhai=' + frontOffset.rightDelta + 'cm | front.deltaDuoi=' + frontOffset.bottomDelta + 'cm | back.deltaTrai=' + backOffset.leftDelta + 'cm | back.deltaPhai=' + backOffset.rightDelta + 'cm | back.deltaDuoi=' + backOffset.bottomDelta + 'cm | saiSoToiDa=' + CHECK_BOTTOM_TOLERANCE_CM + 'cm';
  }
  if (!front) return reasonPrefix + 'Không đọc được số đo Front theo kiểu bottom.';
  var singleOffset = compareLazerOffset(front, lazer, CHECK_BOTTOM_TOLERANCE_CM);
  return reasonPrefix + 'deltaTrai=' + singleOffset.leftDelta + 'cm | deltaPhai=' + singleOffset.rightDelta + 'cm | deltaDuoi=' + singleOffset.bottomDelta + 'cm | saiSoToiDa=' + CHECK_BOTTOM_TOLERANCE_CM + 'cm';
}

function resetCheckMeasurements() { CODEX_CHECK_MEASUREMENTS = {}; }

function storeCheckMeasurement(label, bounds, mask) {
  if (bounds === null || mask === null) return;
  try {
    var mb = boundsOf(mask);
    var firstLeftPoint = bounds.leftPoint || [bounds.left, (bounds.top + bounds.bottom) / 2];
    var secondaryLeftPoint = bounds.secondaryLeftPoint || null;
    var normalizedLeftCandidates = [];
    try {
      var sourceCandidates = bounds.leftCandidates || [];
      for (var candidateIndex = 0; candidateIndex < sourceCandidates.length; candidateIndex += 1) {
        normalizedLeftCandidates.push({ leftX: ptToCm(sourceCandidates[candidateIndex].point[0] - mb.left), y: ptToCm(mb.top - sourceCandidates[candidateIndex].point[1]), width: ptToCm(sourceCandidates[candidateIndex].width) });
      }
    } catch (candidateError) {}
    CODEX_CHECK_MEASUREMENTS[String(label)] = { left: ptToCm(bounds.left - mb.left), top: ptToCm(mb.top - bounds.top), right: ptToCm(mb.right - bounds.right), bottom: ptToCm(bounds.bottom - mb.bottom), firstLeftX: ptToCm(firstLeftPoint[0] - mb.left), firstLeftY: ptToCm(mb.top - firstLeftPoint[1]), secondaryLeftX: secondaryLeftPoint ? ptToCm(secondaryLeftPoint[0] - mb.left) : null, secondaryLeftY: secondaryLeftPoint ? ptToCm(mb.top - secondaryLeftPoint[1]) : null, leftCandidates: normalizedLeftCandidates };
  } catch (error) {}
}

function measurementText(label, measurement) {
  if (!measurement) return String(label).toUpperCase() + ': missing';
  return String(label).toUpperCase() + ': Trai=' + measurement.left + 'cm | Tren=' + measurement.top + 'cm | Phai=' + measurement.right + 'cm | Duoi=' + measurement.bottom + 'cm';
}

function collectInvalidMeasurements(label, measurement, output) {
  if (!measurement) return;
  var fields = ['left', 'right', 'top', 'bottom'];
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    if (!(Number(measurement[field]) > 0)) output.push(label + '.' + field + '=' + measurement[field] + 'cm');
  }
}

function compareLazerOffset(printLayer, lazer, tolerance) {
  if (!printLayer || !lazer) return { ok: false, leftRightExact: false, bottomOk: false, leftDelta: 0, rightDelta: 0, bottomDelta: 0 };
  var leftDelta = signedCmDelta(lazer.left, printLayer.left);
  var rightDelta = signedCmDelta(lazer.right, printLayer.right);
  var bottomDelta = signedCmDelta(lazer.bottom, printLayer.bottom);
  var leftRightExact = Math.abs(leftDelta - rightDelta) <= tolerance;
  var bottomOk = Math.abs(bottomDelta - leftDelta) <= tolerance && Math.abs(bottomDelta - rightDelta) <= tolerance;
  return { ok: leftRightExact && bottomOk, leftRightExact: leftRightExact, bottomOk: bottomOk, leftDelta: leftDelta, rightDelta: rightDelta, bottomDelta: bottomDelta };
}

function compareTwoPrintLayersToLazer(front, back, lazer, tolerance) {
  if (!front || !back || !lazer) return { ok: false };
  var frontOffset = compareLazerOffset(front, lazer, tolerance);
  var backOffset = compareLazerOffset(back, lazer, tolerance);
  var sharedDelta = frontOffset.leftDelta;
  var frontBackLeftExact = Math.abs(sharedDelta - backOffset.leftDelta) <= tolerance;
  var frontBackRightExact = Math.abs(sharedDelta - frontOffset.rightDelta) <= tolerance && Math.abs(sharedDelta - backOffset.rightDelta) <= tolerance;
  var frontBackBottomExact = Math.abs(sharedDelta - frontOffset.bottomDelta) <= tolerance && Math.abs(sharedDelta - backOffset.bottomDelta) <= tolerance;
  return { ok: frontOffset.ok && backOffset.ok && frontBackLeftExact && frontBackRightExact && frontBackBottomExact, front: frontOffset, back: backOffset, frontBackLeftExact: frontBackLeftExact, frontBackRightExact: frontBackRightExact, frontBackBottomExact: frontBackBottomExact };
}

function checkCompareMeasurements(sideCount) {
  var tolerance = CHECK_BOTTOM_TOLERANCE_CM;
  var lazer = CODEX_CHECK_MEASUREMENTS.lazer;
  var front = CODEX_CHECK_MEASUREMENTS.front;
  var back = CODEX_CHECK_MEASUREMENTS.back;
  addReport('CHECK_DATA ' + measurementText('lazer', lazer));
  addReport('CHECK_DATA ' + measurementText('front', front));
  addReport('CHECK_DATA ' + measurementText('back', back));
  if (!lazer) { addReport('CHECK_COMPARE: false | reason=missing_lazer_measurement'); return false; }
  var invalids = [];
  collectInvalidMeasurements('lazer', lazer, invalids);
  collectInvalidMeasurements('front', front, invalids);
  collectInvalidMeasurements('back', back, invalids);
  var zeroOk = invalids.length === 0;
  if (Number(sideCount) >= 2) {
    if (!front || !back) { addReport('CHECK_COMPARE_2SIDE: false | reason=' + (!front && !back ? 'missing_front_and_back_measurement' : !front ? 'missing_front_measurement' : 'missing_back_measurement')); return false; }
    var two = compareTwoPrintLayersToLazer(front, back, lazer, tolerance);
    var sharedLeftPair = pickSharedSparseLeftCandidate(front, back, tolerance);
    var frontCheckLeftX = sharedLeftPair ? sharedLeftPair.front.leftX : (front.secondaryLeftX !== null ? front.secondaryLeftX : front.firstLeftX);
    var backCheckLeftX = sharedLeftPair ? sharedLeftPair.back.leftX : (back.secondaryLeftX !== null ? back.secondaryLeftX : back.firstLeftX);
    var frontCheckLeftY = sharedLeftPair ? sharedLeftPair.front.y : (front.secondaryLeftY !== null ? front.secondaryLeftY : front.firstLeftY);
    var backCheckLeftY = sharedLeftPair ? sharedLeftPair.back.y : (back.secondaryLeftY !== null ? back.secondaryLeftY : back.firstLeftY);
    var firstLeftDx = signedCmDelta(frontCheckLeftX, backCheckLeftX);
    var firstLeftDy = signedCmDelta(frontCheckLeftY, backCheckLeftY);
    var firstLeftSame = Math.abs(firstLeftDx) <= CHECK_LEFT_BAR_TOLERANCE_CM;
    addReport('CHECK_LEFT_POINT_FRONT_BACK: ' + (firstLeftSame ? 'true' : 'false') + ' | front.left=' + frontCheckLeftX + 'cm | back.left=' + backCheckLeftX + 'cm | deltaLeft=' + firstLeftDx + 'cm | sharedYFront=' + frontCheckLeftY + 'cm | sharedYBack=' + backCheckLeftY + 'cm | note=shared sparse-left row | tolerance=' + CHECK_LEFT_BAR_TOLERANCE_CM + 'cm');
    var upperLeftPair = pickSharedUpperLeftCandidate(front, back, tolerance, sharedLeftPair);
    var upperLeftDx = upperLeftPair ? signedCmDelta(upperLeftPair.front.leftX, upperLeftPair.back.leftX) : null;
    var upperLeftSame = upperLeftPair ? Math.abs(upperLeftDx) <= CHECK_LEFT_BAR_TOLERANCE_CM : false;
    addReport('CHECK_LEFT_POINT_FRONT_BACK_UPPER: ' + (upperLeftSame ? 'true' : 'false') + ' | front.left=' + (upperLeftPair ? upperLeftPair.front.leftX : 'missing') + 'cm | back.left=' + (upperLeftPair ? upperLeftPair.back.leftX : 'missing') + 'cm | deltaLeft=' + (upperLeftDx === null ? 'missing' : upperLeftDx) + 'cm | tolerance=' + CHECK_LEFT_BAR_TOLERANCE_CM + 'cm');
    drawCheckLeftPointPair(app.activeDocument, front, back, sharedLeftPair);
    drawCheckLeftPointPair(app.activeDocument, front, back, upperLeftPair, 'UPPER');
    var faceOffsetOk = firstLeftSame && upperLeftSame;
    var twoOk = zeroOk && two.ok && faceOffsetOk;
    addReport('CHECK_COMPARE_2SIDE: ' + (twoOk ? 'true' : 'false') + ' | zero_positive_all=' + zeroOk + ' | zeroErrors=' + (invalids.length ? invalids.join(',') : 'none') + ' | bo_qua_check_lazer_trai_phai=true | front_left_right_exact=' + two.front.leftRightExact + ' | leftRightTol=' + tolerance + 'cm | front_bottom_tol=' + two.front.bottomOk + ' | back_left_right_exact=' + two.back.leftRightExact + ' | back_bottom_tol=' + two.back.bottomOk + ' | front_back_left_exact=' + two.frontBackLeftExact + ' | front_back_right_exact=' + two.frontBackRightExact + ' | all_6_deltas_ok=' + two.ok + ' | front_back_bottom_tol=' + two.frontBackBottomExact + ' | face_offset_ok=' + faceOffsetOk + ' | left_point_visual_check=' + firstLeftSame + ' | upper_left_point_visual_check=' + upperLeftSame + ' | secondaryLeftDeltaX=' + firstLeftDx + 'cm | secondaryLeftDeltaY=' + firstLeftDy + 'cm | frontDeltaTrai=' + two.front.leftDelta + 'cm | frontDeltaPhai=' + two.front.rightDelta + 'cm | frontDeltaDuoi=' + two.front.bottomDelta + 'cm | backDeltaTrai=' + two.back.leftDelta + 'cm | backDeltaPhai=' + two.back.rightDelta + 'cm | backDeltaDuoi=' + two.back.bottomDelta + 'cm | bottomTol=' + tolerance + 'cm');
    return twoOk;
  }
  if (!front) { addReport('CHECK_COMPARE_1SIDE: false | reason=missing_front_measurement'); return false; }
  var single = compareLazerOffset(front, lazer, tolerance);
  var singleOk = zeroOk && single.ok;
  addReport('CHECK_COMPARE_1SIDE: ' + (singleOk ? 'true' : 'false') + ' | zero_positive_all=' + zeroOk + ' | zeroErrors=' + (invalids.length ? invalids.join(',') : 'none') + ' | bo_qua_check_lazer_trai_phai=true | target=front | delta_trai_phai_exact=' + single.leftRightExact + ' | leftRightTol=' + tolerance + 'cm | all_3_deltas_ok=' + single.ok + ' | delta_bottom_tol=' + single.bottomOk + ' | deltaTrai=' + single.leftDelta + 'cm | deltaPhai=' + single.rightDelta + 'cm | deltaDuoi=' + single.bottomDelta + 'cm | bottomTol=' + tolerance + 'cm');
  return singleOk;
}

function debugLazerStep(stepName, item) {
  if (!DEBUG_LAZER_STEPS_ENABLED) return;
  try { app.activeDocument.selection = null; } catch (error) {}
  try { if (item !== null && item !== undefined) item.selected = true; } catch (error) {}
  try { app.redraw(); } catch (error) {}
  alert('DEBUG LAZER - ' + stepName + '\\n\\nBấm OK để chạy bước tiếp theo.');
}


function jsonEscape(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function writeRunResult(success, fit, message) {
  try {
    if (typeof CODEX_RESULT_PATH === 'undefined' || !CODEX_RESULT_PATH) return;
    var file = new File(CODEX_RESULT_PATH);
    file.encoding = 'UTF-8';
    file.open('w');
    file.write('{"success":' + (success ? 'true' : 'false') + ',"fit":' + (fit ? 'true' : 'false') + ',"message":"' + jsonEscape(message || '') + '"}');
    file.close();
  } catch (error) {}
}

function normalizeRemainingFitCapInch(value) {
  var numeric = Number(value || 0);
  if (!(numeric > 0)) return 0;
  return Math.floor(numeric * 2) / 2;
}

function estimateRemainingFitCapInch(documentRef) {
  try {
    var context = getPackContext(documentRef);
    if (!context || !context.templateBounds) return 0;
    var freeRects = stickerStyleFreeRects(context.templateBounds, context.borderObstacles || []);
    var bestInch = 0;
    for (var i = 0; i < freeRects.length; i += 1) {
      var freeRect = freeRects[i];
      var candidatePoint = Math.min(freeRect.w, freeRect.h);
      if (!(candidatePoint > 0)) continue;
      var candidateInch = candidatePoint / 72;
      if (candidateInch > bestInch) bestInch = candidateInch;
    }
    return normalizeRemainingFitCapInch(bestInch);
  } catch (error) {}
  return 0;
}

function writeProgress(index, total, state, item, message) {
  try {
    if (typeof CODEX_PROGRESS_PATH === 'undefined' || !CODEX_PROGRESS_PATH) return;
    var file = new File(CODEX_PROGRESS_PATH);
    file.encoding = 'UTF-8';
    file.open('w');
    var imageBaseName = item && item.imageBaseName ? item.imageBaseName : '';
    file.write('{"index":' + index + ',"total":' + total + ',"state":"' + jsonEscape(state || '') + '","imageBaseName":"' + jsonEscape(imageBaseName) + '","message":"' + jsonEscape(message || '') + '"}');
    file.close();
  } catch (error) {}
}

function shouldProgressRedraw(index) {
  var every = 5;
  try {
    if (typeof CODEX_PROGRESS_REDRAW_EVERY !== 'undefined') every = Number(CODEX_PROGRESS_REDRAW_EVERY || 0);
  } catch (error) {}
  return every > 0 && index > 0 && index % every === 0;
}

function writeBatchRunResult(results, message) {
  try {
    if (typeof CODEX_RESULT_PATH === 'undefined' || !CODEX_RESULT_PATH) return;
    var parts = [];
    var allSuccess = true;
    var allFit = true;
    for (var i = 0; i < results.length; i += 1) {
      if (!results[i].success) allSuccess = false;
      if (!results[i].fit) allFit = false;
      var evidenceParts = [];
      var evidence = results[i].evidence || [];
      for (var e = 0; e < evidence.length; e += 1) evidenceParts.push('"' + jsonEscape(evidence[e]) + '"');
      var reasonPart = results[i].reason ? ',"reason":"' + jsonEscape(results[i].reason) + '"' : '';
      var evidencePart = evidenceParts.length ? ',"evidence":[' + evidenceParts.join(',') + ']' : '';
      parts.push('{"success":' + (results[i].success ? 'true' : 'false') + ',"fit":' + (results[i].fit ? 'true' : 'false') + ',"message":"' + jsonEscape(results[i].message || '') + '"' + reasonPart + evidencePart + '}');
    }
    var reportParts = [];
    for (var r = 0; r < CODEX_REPORTS.length; r += 1) reportParts.push('"' + jsonEscape(CODEX_REPORTS[r]) + '"');
    var file = new File(CODEX_RESULT_PATH);
    file.encoding = 'UTF-8';
    file.open('w');
    var remainingFitCapInch = 0;
    try { remainingFitCapInch = estimateRemainingFitCapInch(app.activeDocument); } catch (error) {}
    var blockedSizeParts = [];
    try {
      if (typeof BLOCKED_SIZE_KEYS !== 'undefined' && BLOCKED_SIZE_KEYS) {
        for (var blockedSizeKey in BLOCKED_SIZE_KEYS) {
          if (BLOCKED_SIZE_KEYS[blockedSizeKey]) blockedSizeParts.push('"' + jsonEscape(blockedSizeKey) + '"');
        }
      }
    } catch (error) {}
    file.write('{"success":' + (allSuccess ? 'true' : 'false') + ',"fit":' + (allFit ? 'true' : 'false') + ',"message":"' + jsonEscape(message || '') + '","remainingFitCapInch":' + remainingFitCapInch + ',"blockedSizeKeys":[' + blockedSizeParts.join(',') + '],"results":[' + parts.join(',') + '],"reports":[' + reportParts.join(',') + ']}');
    file.close();
  } catch (error) {}
}



function isBadgeReel() {
  try {
    return typeof CODEX_IMAGE_BASENAME !== 'undefined' && String(CODEX_IMAGE_BASENAME).toLowerCase().indexOf('badge-reel') >= 0;
  } catch (error) {}
  return false;
}

function isSingleBadgeFlow() {
  try {
    if (isBadgeReel()) return true;
    return typeof CODEX_SIDE_COUNT !== 'undefined' && Number(CODEX_SIDE_COUNT) === 1;
  } catch (error) {}
  return false;
}

function closeRecoveredDocuments() {
  try {
    for (var i = app.documents.length - 1; i >= 0; i -= 1) {
      var documentRef = null;
      try { documentRef = app.documents[i]; } catch (error) {}
      if (documentRef === null) continue;
      var documentName = '';
      try { documentName = String(documentRef.name || ''); } catch (error) {}
      if (documentName.indexOf('[Recovered]') < 0) continue;
      try { documentRef.close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
    }
  } catch (error) {}
}

function getOrOpenTemplate(templatePath) {
  var docs = app.documents;
  var normalized = String(templatePath).replace(/\\/g, '/').toLowerCase();
  for (var i = 0; i < docs.length; i += 1) {
    try {
      if (String(docs[i].fullName.fsName).replace(/\\/g, '/').toLowerCase() === normalized) {
        app.activeDocument = docs[i];
        return docs[i];
      }
    } catch (error) {}
  }
  return app.open(new File(templatePath));
}

function unlockAndShow(item) {
  try { item.locked = false; } catch (error) {}
  try { item.hidden = false; } catch (error) {}
  try { item.visible = true; } catch (error) {}
}

function ensureLayer(documentRef, layerName) {
  for (var i = 0; i < documentRef.layers.length; i += 1) {
    try {
      if (documentRef.layers[i].name === layerName) return documentRef.layers[i];
    } catch (error) {}
  }
  var layer = documentRef.layers.add();
  layer.name = layerName;
  unlockAndShow(layer);
  return layer;
}

function removeSublayer(parentLayer, name) {
  for (var i = parentLayer.layers.length - 1; i >= 0; i -= 1) {
    try {
      if (parentLayer.layers[i].name === name) {
        unlockAndShow(parentLayer.layers[i]);
        parentLayer.layers[i].remove();
      }
    } catch (error) {}
  }
}

function runSuffix() {
  if (typeof CODEX_ITEM_RUN_SUFFIX !== 'undefined' && CODEX_ITEM_RUN_SUFFIX) return CODEX_ITEM_RUN_SUFFIX;
  return '';
}

function caseLayerName(label) {
  if (typeof CODEX_IMAGE_BASENAME !== 'undefined' && CODEX_IMAGE_BASENAME) return CODEX_IMAGE_BASENAME + runSuffix() + '_' + label;
  return label + runSuffix();
}

function lazerOutlineName() {
  if (typeof CODEX_IMAGE_ID !== 'undefined' && CODEX_IMAGE_ID) return CODEX_IMAGE_ID + runSuffix() + '_DEBUG_LAZER';
  return 'DEBUG_LAZER_OUTLINE_AFTER_SCALE' + runSuffix();
}

function lazerArtworkName() {
  if (IGNORE_CHECK_FALSE && typeof CODEX_IMAGE_BASENAME !== 'undefined' && CODEX_IMAGE_BASENAME) return CODEX_IMAGE_BASENAME + runSuffix();
  return 'IMAGE_lazer';
}

function lazerClipMaskName() {
  if (typeof CODEX_IMAGE_BASENAME !== 'undefined' && CODEX_IMAGE_BASENAME) return 'MASK_' + CODEX_IMAGE_BASENAME + runSuffix() + '_lazer';
  return 'MASK_lazer' + runSuffix();
}

function longestEdgesLayerName() {
  if (typeof CODEX_IMAGE_ID !== 'undefined' && CODEX_IMAGE_ID) return CODEX_IMAGE_ID + runSuffix() + '_DEBUG_LONGEST_EDGES';
  return 'DEBUG_LONGEST_EDGES' + runSuffix();
}

function caseLabelFromLayerName(layerName) {
  var text = String(layerName);
  if (text === 'lazer' || text === 'front' || text === 'back') return text;
  if (text.lastIndexOf('_lazer') === text.length - 6) return 'lazer';
  if (text.lastIndexOf('_front') === text.length - 6) return 'front';
  if (text.lastIndexOf('_back') === text.length - 5) return 'back';
  return text;
}

function isCaseLayerName(layerName, label) {
  return caseLabelFromLayerName(layerName) === label;
}

function createCaseLayer(parentLayer, label) {
  removeSublayer(parentLayer, label);
  removeSublayer(parentLayer, caseLayerName(label));
  removeNamedPageItems(parentLayer, caseLayerName(label));
  removeNamedPageItems(parentLayer, 'MASK_30_48CM_' + label);
  removeNamedPageItems(parentLayer, 'MASK_TRIMMED_' + label);
  removeNamedPageItems(parentLayer, 'MASK_BORDER_' + label);
  removeNamedPageItems(parentLayer, 'IMAGE_' + label);
  removeNamedPageItems(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_' + label);
  unlockAndShow(parentLayer);
  return parentLayer;
}

function boundsOf(item) {
  var b = item.visibleBounds;
  return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: b[2] - b[0], height: b[1] - b[3] };
}

function geometricBoundsOf(item) {
  try {
    var b = item.geometricBounds;
    return { left: b[0], top: b[1], right: b[2], bottom: b[3], width: b[2] - b[0], height: b[1] - b[3] };
  } catch (error) {}
  return boundsOf(item);
}

function createMask(caseLayer, documentRef, label, offsetIndex) {
  documentRef.activeLayer = caseLayer;
  var left = 50 + (offsetIndex * (MASK_SIZE_POINT + 40));
  var top = documentRef.height - 50;
  var mask = caseLayer.pathItems.rectangle(top, left, MASK_SIZE_POINT, MASK_SIZE_POINT);
  mask.name = 'MASK_30_48CM_' + label;
  mask.filled = false;
  mask.stroked = false;
  unlockAndShow(mask);
  var maskBounds = boundsOf(mask);
  var maskWidthCm = maskBounds.width / CM_TO_POINT;
  var okWidth = Math.abs(maskWidthCm - 30.48) <= 0.01;
  addReport('CHECK MASK_30_48CM_' + label + ' W=' + Math.round(maskWidthCm * 1000) / 1000 + 'cm => ' + okWidth);
  if (!okWidth) {
    var maskError = 'CHECK_MASK_30_48CM_WIDTH_FALSE: ' + String.fromCharCode(0x66,0x61,0x6c,0x73,0x65) + ' | ' + String.fromCharCode(0x4b,0x69,0x65,0x6d,0x20,0x74,0x72,0x61,0x20,0x6d,0x61,0x73,0x6b,0x20,0x33,0x30,0x2e,0x34,0x38,0x63,0x6d) + ' ' + label + ': W=' + (Math.round(maskWidthCm * 1000) / 1000) + 'cm, ' + String.fromCharCode(0x6b,0x68,0xf4,0x6e,0x67,0x20,0x70,0x68,0x1ea3,0x69,0x20,0x33,0x30,0x2e,0x34,0x38,0x63,0x6d);
    if (IGNORE_CHECK_FALSE) { addReport('IGNORE_CHECK_FALSE: ' + maskError); }
    else { try { mask.selected = true; app.redraw(); } catch (error) {} throw new Error(maskError); }
  }
  return mask;
}

function findNamedRaster(container, name) {
  for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
    try {
      if ((container.pageItems[i].typename === 'RasterItem' || container.pageItems[i].typename === 'PlacedItem') && container.pageItems[i].name === name) return container.pageItems[i];
    } catch (error) {}
  }
  return null;
}

function cleanupLooseNamedItems(container, name, keepItem) {
  for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
    var item = null;
    try { item = container.pageItems[i]; } catch (error) { continue; }
    try {
      if (item !== keepItem && item.name === name && item.parent === container) {
        unlockAndShow(item);
        item.remove();
      }
    } catch (error) {}
  }
}

function embedImage(caseLayer, documentRef, imagePath, label, offsetIndex, forceEmbed) {
  documentRef.activeLayer = caseLayer;
  var sourceFile = new File(imagePath);
  if (!sourceFile.exists) throw new Error('IMAGE_FILE_MISSING: ' + imagePath);
  var fallbackFile = null;
  var placed = null;
  var lastError = null;
  for (var attempt = 1; attempt <= 5 && placed === null; attempt += 1) {
    var candidate = null;
    try {
      if (attempt >= 3) {
        fallbackFile = new File(sourceFile.parent.fsName + '/place_retry_' + label + '_' + attempt + '.png');
        try { if (fallbackFile.exists) fallbackFile.remove(); } catch (fallbackCleanupError) {}
        if (!sourceFile.copy(fallbackFile.fsName)) throw new Error('IMAGE_PLACE_COPY_FAILED: ' + fallbackFile.fsName);
      }
      candidate = caseLayer.placedItems.add();
      candidate.file = fallbackFile && fallbackFile.exists ? fallbackFile : sourceFile;
      placed = candidate;
    } catch (error) {
      lastError = error;
      try { if (candidate !== null) candidate.remove(); } catch (cleanupError) {}
      try { app.redraw(); } catch (redrawError) {}
      if (attempt < 5) $.sleep(500 * attempt);
    }
  }
  if (placed === null) throw new Error('IMAGE_PLACE_FAILED: ' + imagePath + ' | ' + String(lastError || 'UNKNOWN'));
  placed.position = [50 + (offsetIndex * (MASK_SIZE_POINT + 40)), documentRef.height - 50];
  try {
    if (typeof CODEX_IMAGE_WIDTH_POINT !== 'undefined' && CODEX_IMAGE_WIDTH_POINT > 0) placed.width = CODEX_IMAGE_WIDTH_POINT;
    if (typeof CODEX_IMAGE_HEIGHT_POINT !== 'undefined' && CODEX_IMAGE_HEIGHT_POINT > 0) placed.height = CODEX_IMAGE_HEIGHT_POINT;
  } catch (sizeError) {
    throw new Error('IMAGE_SIZE_RESTORE_FAILED: ' + String(sizeError));
  }
  try { placed.name = 'IMAGE_' + label; } catch (error) {}
  var shouldEmbed = forceEmbed === true;
  if (!shouldEmbed) {
    shouldEmbed = true;
    try { if (typeof CODEX_EMBED_IMAGES !== 'undefined') shouldEmbed = CODEX_EMBED_IMAGES !== false; } catch (error) {}
  }
  if (shouldEmbed) { try { placed.embed(); } catch (error) {} }
  if (fallbackFile && fallbackFile.exists) { try { fallbackFile.remove(); } catch (fallbackRemoveError) {} }
  var raster = findNamedRaster(caseLayer, 'IMAGE_' + label);
  if (raster === null && documentRef.rasterItems.length > 0) raster = documentRef.rasterItems[documentRef.rasterItems.length - 1];
  if (raster === null) return null;
  try { raster.name = 'IMAGE_' + label; } catch (error) {}
  unlockAndShow(raster);
  try { raster.move(caseLayer, ElementPlacement.PLACEATBEGINNING); } catch (error) {}
  cleanupLooseNamedItems(caseLayer, 'IMAGE_' + label, raster);
  return raster;
}

function validateImportedImageWidth(imageItem, label) {
  var imageBounds = geometricBoundsOf(imageItem);
  var widthCm = imageBounds.width / CM_TO_POINT;
  var roundedWidthCm = Math.round(widthCm * 1000) / 1000;
  var ok = Math.abs(widthCm - 30.48) <= 0.01;
  addReport('CHECK IMAGE_W_' + String(label).toUpperCase() + ': W=' + roundedWidthCm + 'cm | expected=30.48cm => ' + ok);
  if (!ok) {
    var imageWidthError = 'CHECK_IMAGE_WIDTH_FALSE: ' + String.fromCharCode(0x66,0x61,0x6c,0x73,0x65) + ' | ' + String.fromCharCode(0x4b,0x69,0x1ec3,0x6d,0x20,0x74,0x72,0x61,0x20,0x6b,0x68,0xed,0x63,0x68,0x20,0x1ea3,0x6e,0x68) + ' ' + label + ': W=' + roundedWidthCm + 'cm, ' + String.fromCharCode(0x6b,0x68,0xf4,0x6e,0x67,0x20,0x70,0x68,0x1ea3,0x69,0x20,0x33,0x30,0x2e,0x34,0x38,0x63,0x6d);
    if (IGNORE_CHECK_FALSE) { addReport('IGNORE_CHECK_FALSE: ' + imageWidthError); }
    else { try { app.activeDocument.selection = null; imageItem.selected = true; app.redraw(); } catch (error) {} throw new Error(imageWidthError); }
  }
  return true;
}

function cloneColor(colorValue) {
  if (colorValue === null || typeof colorValue === 'undefined') return null;
  try {
    if (colorValue.typename === 'RGBColor') {
      var rgb = new RGBColor(); rgb.red = colorValue.red; rgb.green = colorValue.green; rgb.blue = colorValue.blue; return rgb;
    }
    if (colorValue.typename === 'CMYKColor') {
      var cmyk = new CMYKColor(); cmyk.cyan = colorValue.cyan; cmyk.magenta = colorValue.magenta; cmyk.yellow = colorValue.yellow; cmyk.black = colorValue.black; return cmyk;
    }
    if (colorValue.typename === 'GrayColor') {
      var gray = new GrayColor(); gray.gray = colorValue.gray; return gray;
    }
    if (colorValue.typename === 'SpotColor') {
      var spot = new SpotColor(); spot.spot = colorValue.spot; spot.tint = colorValue.tint; return spot;
    }
  } catch (error) {}
  return colorValue;
}

function swapPathFillAndStroke(pathItem) {
  var wasFilled = false;
  var wasStroked = false;
  var oldFillColor = null;
  var oldStrokeColor = null;
  try { wasFilled = pathItem.filled === true; } catch (error) {}
  try { wasStroked = pathItem.stroked === true; } catch (error) {}
  try { if (wasFilled) oldFillColor = cloneColor(pathItem.fillColor); } catch (error) {}
  try { if (wasStroked) oldStrokeColor = cloneColor(pathItem.strokeColor); } catch (error) {}
  try { pathItem.filled = wasStroked; } catch (error) {}
  try { pathItem.stroked = wasFilled; } catch (error) {}
  if (wasStroked && oldStrokeColor !== null) {
    try { pathItem.fillColor = oldStrokeColor; } catch (error) {}
  }
  if (wasFilled && oldFillColor !== null) {
    try { pathItem.strokeColor = oldFillColor; } catch (error) {}
    try { if (!pathItem.strokeWidth || pathItem.strokeWidth <= 0) pathItem.strokeWidth = LAZER_STROKE_WIDTH; } catch (error) {}
  }
}

function swapFillAndStrokeRecursive(item) {
  if (item === null) return;
  try {
    if (item.typename === 'PathItem') {
      swapPathFillAndStroke(item);
      return;
    }
    if (item.typename === 'CompoundPathItem') {
      for (var c = 0; c < item.pathItems.length; c += 1) swapPathFillAndStroke(item.pathItems[c]);
      return;
    }
    if (item.pageItems) {
      for (var i = item.pageItems.length - 1; i >= 0; i -= 1) swapFillAndStrokeRecursive(item.pageItems[i]);
    }
  } catch (error) {}
}

function black() {
  var color = new RGBColor();
  color.red = 0;
  color.green = 0;
  color.blue = 0;
  return color;
}

function setPathColorBlack(pathItem) {
  if (pathItem === null) return;
  try { if (pathItem.filled === true) pathItem.fillColor = black(); } catch (error) {}
  try { if (pathItem.stroked === true) { pathItem.strokeColor = black(); pathItem.strokeWidth = LAZER_STROKE_WIDTH; } } catch (error) {}
}

function setLazerColorBlackRecursive(item) {
  if (item === null) return;
  try {
    if (item.typename === 'PathItem') {
      setPathColorBlack(item);
      return;
    }
    if (item.typename === 'CompoundPathItem') {
      for (var c = 0; c < item.pathItems.length; c += 1) setPathColorBlack(item.pathItems[c]);
      return;
    }
    if (item.pageItems) {
      for (var i = item.pageItems.length - 1; i >= 0; i -= 1) setLazerColorBlackRecursive(item.pageItems[i]);
    }
  } catch (error) {}
}
function removeLazerOuterContainerPathsForCheck(artwork, mask) {
  if (artwork === null || mask === null) return 0;
  var removed = 0;
  var candidates = [];
  function collect(container) {
    if (container === null || !container.pageItems) return;
    for (var i = 0; i < container.pageItems.length; i += 1) {
      var item = null;
      try { item = container.pageItems[i]; } catch (error) { continue; }
      try {
        if (item.typename === 'GroupItem') collect(item);
        if (item.typename === 'PathItem' || item.typename === 'CompoundPathItem') candidates.push(item);
      } catch (error) {}
    }
  }
  function containsBounds(outer, inner) {
    return outer.left <= inner.left + 0.5 && outer.right >= inner.right - 0.5 && outer.top >= inner.top - 0.5 && outer.bottom <= inner.bottom + 0.5;
  }
  collect(artwork);
  for (var i = 0; i < candidates.length; i += 1) {
    var outer = candidates[i];
    try {
      var ob = boundsOf(outer);
      var childCount = 0;
      for (var j = 0; j < candidates.length; j += 1) {
        if (i === j) continue;
        try {
          var inner = candidates[j];
          var ib = boundsOf(inner);
          if (ib.width < ob.width && ib.height < ob.height && containsBounds(ob, ib)) childCount += 1;
        } catch (error) {}
      }
      var area = ob.width * ob.height;
      if (childCount >= 1 && area > 2000) {
        outer.remove();
        removed += 1;
      }
    } catch (error) {}
  }
  addReport('LAZER check: removed ' + removed + ' outer container path(s).');
  return removed;
}

function removeLazerArtworkOutsideReferenceBounds(artwork, referenceBounds) {
  if (artwork === null || referenceBounds === null) return 0;
  var removed = 0;
  var pad = Math.max(8, LAZER_STROKE_WIDTH * 8);
  var keepBounds = {
    left: referenceBounds.left - pad,
    top: referenceBounds.top + pad,
    right: referenceBounds.right + pad,
    bottom: referenceBounds.bottom - pad
  };
  function overlapsKeepBounds(itemBounds) {
    return itemBounds.right >= keepBounds.left && itemBounds.left <= keepBounds.right && itemBounds.top >= keepBounds.bottom && itemBounds.bottom <= keepBounds.top;
  }
  function centerInsideKeepBounds(itemBounds) {
    var centerX = (itemBounds.left + itemBounds.right) / 2;
    var centerY = (itemBounds.top + itemBounds.bottom) / 2;
    return centerX >= keepBounds.left && centerX <= keepBounds.right && centerY <= keepBounds.top && centerY >= keepBounds.bottom;
  }
  function shouldRemoveItem(item) {
    try {
      var itemBounds = boundsOf(item);
      if (!overlapsKeepBounds(itemBounds)) return true;
      if (!centerInsideKeepBounds(itemBounds) && (itemBounds.width * itemBounds.height) > 25) return true;
    } catch (error) {}
    return false;
  }
  function walk(container) {
    if (container === null || !container.pageItems) return;
    for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
      var item = null;
      try { item = container.pageItems[i]; } catch (error) { continue; }
      try {
        if (item.typename === 'GroupItem') {
          if (shouldRemoveItem(item)) {
            unlockAndShow(item);
            item.remove();
            removed += 1;
            continue;
          }
          walk(item);
          try { if (item.pageItems.length === 0) item.remove(); } catch (emptyError) {}
          continue;
        }
        if (item.typename !== 'PathItem' && item.typename !== 'CompoundPathItem') continue;
        if (!shouldRemoveItem(item)) continue;
        unlockAndShow(item);
        item.remove();
        removed += 1;
      } catch (error) {}
    }
  }
  walk(artwork);
  addReport('LAZER cleanup: removed ' + removed + ' component(s) outside DEBUG_LAZER bounds.');
  return removed;
}
function removeLazerRectFramePathsForCheck(artwork) {
  if (artwork === null) return 0;
  var removed = 0;
  function looksLikeRectanglePath(item) {
    try {
      if (!item) return false;
      if (item.typename === 'CompoundPathItem') {
        if (!item.pathItems || item.pathItems.length === 0) return false;
        item = item.pathItems[0];
      }
      if (item.typename !== 'PathItem') return false;
      if (!(item.pathPoints.length === 4 || item.pathPoints.length === 5)) return false;
      var b = geometricBoundsOf(item);
      var ratio = b.width > b.height ? (b.width / Math.max(1, b.height)) : (b.height / Math.max(1, b.width));
      if (ratio < 1.1) return false;
      if (b.width < (2 * CM_TO_POINT) || b.height < (2 * CM_TO_POINT)) return false;
      var points = [];
      for (var p = 0; p < item.pathPoints.length; p += 1) points.push(item.pathPoints[p].anchor);
      var minX = points[0][0], maxX = points[0][0], minY = points[0][1], maxY = points[0][1];
      for (var q = 1; q < points.length; q += 1) {
        var pt = points[q];
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      return Math.abs((maxX - minX) - b.width) <= 2 && Math.abs((maxY - minY) - b.height) <= 2;
    } catch (error) {}
    return false;
  }
  function walk(container) {
    if (container === null || !container.pageItems) return;
    for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
      var item = null;
      try { item = container.pageItems[i]; } catch (error) { continue; }
      try {
        if (item.typename === 'GroupItem') {
          walk(item);
          continue;
        }
        if (!looksLikeRectanglePath(item)) continue;
        unlockAndShow(item);
        item.remove();
        removed += 1;
      } catch (error) {}
    }
  }
  walk(artwork);
  addReport('LAZER check: removed ' + removed + ' rectangular frame path(s) inside IMAGE_lazer.');
  return removed;
}

function removeLargerOfTwoLazerComponentsForCheck(artwork) {
  if (artwork === null || !artwork.pageItems) return 0;
  var components = [];
  for (var i = 0; i < artwork.pageItems.length; i += 1) {
    var item = null;
    try { item = artwork.pageItems[i]; } catch (error) { continue; }
    try {
      if (item.hidden || item.guides) continue;
      if (item.typename === 'PathItem' || item.typename === 'CompoundPathItem' || item.typename === 'GroupItem') components.push(item);
    } catch (error) {}
  }
  if (components.length !== 2) {
    addReport('LAZER check: keep components; expected 2 top-level paths, found ' + components.length + '.');
    return 0;
  }
  try {
    var firstBounds = boundsOf(components[0]);
    var secondBounds = boundsOf(components[1]);
    var firstArea = firstBounds.width * firstBounds.height;
    var secondArea = secondBounds.width * secondBounds.height;
    var larger = firstArea >= secondArea ? components[0] : components[1];
    var largerArea = firstArea >= secondArea ? firstArea : secondArea;
    larger.remove();
    addReport('LAZER check: removed larger of 2 components, area=' + Math.round(largerArea) + 'pt2.');
    return 1;
  } catch (error) {
    addReport('LAZER check: failed to remove larger of 2 components.');
  }
  return 0;
}

function removeLastLazerPathForCheck(artwork) {
  if (artwork === null || !artwork.pageItems) return 0;
  for (var i = artwork.pageItems.length - 1; i >= 0; i -= 1) {
    var item = null;
    try { item = artwork.pageItems[i]; } catch (error) { continue; }
    try {
      if (item.typename !== 'PathItem' && item.typename !== 'CompoundPathItem') continue;
      unlockAndShow(item);
      item.remove();
      addReport('LAZER check: removed last <Path> inside IMAGE_lazer.');
      return 1;
    } catch (error) {}
  }
  addReport('LAZER check: no top-level <Path> found to remove.');
  return 0;
}

function removeLazerArtworkBelowMaskForCheck(artwork, mask) {
  if (artwork === null || mask === null) return 0;
  var maskBounds = boundsOf(mask);
  var removed = 0;
  function walk(container) {
    if (container === null || !container.pageItems) return;
    for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
      var item = null;
      try { item = container.pageItems[i]; } catch (error) { continue; }
      try {
        var itemBounds = boundsOf(item);
        if (itemBounds.top <= maskBounds.bottom + 0.5) {
          item.remove();
          removed += 1;
          continue;
        }
        if (item.typename === 'GroupItem') {
          walk(item);
          try { if (item.pageItems.length === 0) item.remove(); } catch (error) {}
        }
      } catch (error) {}
    }
  }
  walk(artwork);
  addReport('LAZER check: removed ' + removed + ' traced component(s) fully below MASK_30_48CM_lazer.');
  return removed;
}

function traceLazerSilhouette(imageItem, caseLayer) {
  if (imageItem === null) throw new Error('LAZER_TRACE_IMAGE_MISSING');
  var tracedPlugin = null;
  var expandedGroup = null;
  try {
    unlockAndShow(imageItem);
    tracedPlugin = imageItem.trace();
    app.redraw();
    $.sleep(150);
    var tracingObject = tracedPlugin.tracing;
    var presetLoaded = tracingObject.tracingOptions.loadFromPreset('Silhouettes');
    if (presetLoaded !== true) throw new Error('SILHOUETTES_PRESET_NOT_FOUND');
    debugLazerStep('Da load preset Silhouettes, chua Expand', tracedPlugin);
    app.redraw();
    $.sleep(250);
    expandedGroup = tracingObject.expandTracing();
    app.redraw();
    $.sleep(100);
    if (expandedGroup === null) throw new Error('LAZER_EXPAND_FAILED');
    debugLazerStep('Da Expand Silhouettes', expandedGroup);
    try { expandedGroup.name = lazerArtworkName(); } catch (error) {}
    unlockAndShow(expandedGroup);

    swapFillAndStrokeRecursive(expandedGroup);
    setLazerColorBlackRecursive(expandedGroup);
    debugLazerStep('Da Swap Fill and Stroke, mau den', expandedGroup);
    try { expandedGroup.move(caseLayer, ElementPlacement.PLACEATBEGINNING); } catch (error) {}
    cleanupLooseNamedItems(caseLayer, lazerArtworkName(), expandedGroup);
    addReport('LAZER: embed -> load Image Trace preset Silhouettes -> Expand -> Swap Fill and Stroke -> set black -> stroke 0.25pt');
    return expandedGroup;
  } catch (error) {
    throw new Error('LAZER_SILHOUETTE_TRACE_FAILED: ' + String(error));
  }
}
function alignImageToMask(raster, mask, verticalMode, useColoredBounds) {
  var rb = boundsOf(raster);
  if (useColoredBounds === true) {
    try {
      var coloredBounds = unionColoredBounds(allColoredBounds(raster, CODEX_COLORED_METRICS));
      if (coloredBounds !== null) rb = coloredBounds;
    } catch (error) {}
  }
  var mb = boundsOf(mask);
  var dx = ((mb.left + mb.right) / 2) - ((rb.left + rb.right) / 2);
  var dy = 0;
  if (verticalMode === 'top') dy = mb.top - rb.top;
  else if (verticalMode === 'bottom') dy = mb.bottom - rb.bottom;
  else dy = ((mb.top + mb.bottom) / 2) - ((rb.top + rb.bottom) / 2);
  raster.translate(dx, dy);
}

function makeClip(caseLayer, raster, mask, label) {
  var group = caseLayer.groupItems.add();
  group.name = caseLayerName(label);
  unlockAndShow(group);

  raster.move(group, ElementPlacement.PLACEATEND);
  mask.move(group, ElementPlacement.PLACEATEND);
  cleanupLooseNamedItems(caseLayer, 'IMAGE_' + label, raster);
  try { mask.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
  mask.clipping = true;
  group.clipped = true;
  unlockAndShow(raster);
  unlockAndShow(mask);
  return group;
}

function makeGroupWithoutClip(caseLayer, item, mask, label) {
  var group = caseLayer.groupItems.add();
  group.name = caseLayerName(label);
  unlockAndShow(group);
  try { item.move(group, ElementPlacement.PLACEATEND); } catch (error) {}
  try { mask.move(group, ElementPlacement.PLACEATEND); } catch (error) {}
  cleanupLooseNamedItems(caseLayer, 'IMAGE_' + label, item);
  unlockAndShow(item);
  unlockAndShow(mask);
  return group;
}

function makeLazerGroupWithoutMask(caseLayer, item, mask) {
  var group = caseLayer.groupItems.add();
  group.name = caseLayerName('lazer');
  unlockAndShow(group);
  try { item.move(group, ElementPlacement.PLACEATEND); } catch (error) {}
  try { if (mask !== null) unlockAndShow(mask); } catch (error) {}
  cleanupLooseNamedItems(caseLayer, lazerArtworkName(), item);
  unlockAndShow(item);
  return group;
}

function removeCropRectangleArtifacts(container, maskBounds) {
  if (container === null || maskBounds === null) return;
  for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
    var item = null;
    try { item = container.pageItems[i]; } catch (error) { continue; }
    try {
      if (item.typename === 'GroupItem') {
        removeCropRectangleArtifacts(item, maskBounds);
        continue;
      }
      if (item.typename !== 'PathItem') continue;
      if (item.pathPoints.length !== 4 || item.filled !== true || item.stroked === true) continue;
      var b = geometricBoundsOf(item);
      var sameWidth = Math.abs(b.width - maskBounds.width) <= 0.5;
      var sameHeight = Math.abs(b.height - maskBounds.height) <= 0.5;
      var sameLeft = Math.abs(b.left - maskBounds.left) <= 0.5;
      var sameTop = Math.abs(b.top - maskBounds.top) <= 0.5;
      if (sameWidth && sameHeight && sameLeft && sameTop) {
        unlockAndShow(item);
        item.remove();
      }
    } catch (error) {}
  }
}

function cropLazerRasterBeforeTraceForCheck(documentRef, caseLayer, imageItem, mask) {
  if (imageItem === null || mask === null) return imageItem;
  var tempGroup = null;
  var cropMask = null;
  var croppedRaster = null;
  try {
    unlockAndShow(imageItem);
    unlockAndShow(mask);
    tempGroup = caseLayer.groupItems.add();
    tempGroup.name = 'LAZER_CHECK_RASTER_CROP';
    unlockAndShow(tempGroup);
    imageItem.move(tempGroup, ElementPlacement.PLACEATEND);
    cropMask = mask.duplicate(tempGroup, ElementPlacement.PLACEATEND);
    cropMask.name = 'MASK_RASTER_CROP_30_48CM_lazer';
    cropMask.filled = false;
    cropMask.stroked = false;
    cropMask.clipping = true;
    cropMask.zOrder(ZOrderMethod.BRINGTOFRONT);
    tempGroup.clipped = true;
    var options = new RasterizeOptions();
    options.resolution = 150;
    options.transparency = true;
    croppedRaster = documentRef.rasterize(tempGroup, mask.geometricBounds, options);
    if (croppedRaster === null) throw new Error('RASTER_CROP_RETURNED_NULL');
    unlockAndShow(croppedRaster);
    croppedRaster.name = lazerArtworkName();
    try { croppedRaster.move(caseLayer, ElementPlacement.PLACEATBEGINNING); } catch (error) {}
    try { tempGroup.remove(); } catch (error) {}
    try { removeNamedPageItems(caseLayer, 'LAZER_CHECK_RASTER_CROP'); } catch (error) {}
    addReport('LAZER check: raster crop before Trace, W=' + ptToCm(boundsOf(croppedRaster).width) + 'cm | H=' + ptToCm(boundsOf(croppedRaster).height) + 'cm.');
    return croppedRaster;
  } catch (error) {
    try { if (tempGroup !== null) tempGroup.remove(); } catch (cleanupGroupError) {}
    throw new Error('LAZER_CHECK_RASTER_CROP_FAILED: ' + String(error));
  }
}

function cropLazerArtworkToMaskForCheck(caseLayer, artwork, mask) {
  if (artwork === null || mask === null) return artwork;
  var cropMask = null;
  var group = null;
  try {
    unlockAndShow(artwork);
    unlockAndShow(mask);
    cropMask = mask.duplicate(caseLayer, ElementPlacement.PLACEATBEGINNING);
    cropMask.name = 'MASK_CROP_30_48CM_lazer';
    cropMask.clipping = true;
    cropMask.filled = false;
    cropMask.stroked = false;
    group = caseLayer.groupItems.add();
    group.name = 'LAZER_CHECK_CROP_GROUP';
    unlockAndShow(group);
    artwork.move(group, ElementPlacement.PLACEATEND);
    cropMask.move(group, ElementPlacement.PLACEATEND);
    try { cropMask.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
    group.clipped = true;
    app.redraw();
    $.sleep(150);
    try { removeNamedPageItems(caseLayer, 'MASK_CROP_30_48CM_lazer'); } catch (error) {}
    try { removeCropRectangleArtifacts(caseLayer, boundsOf(mask)); } catch (error) {}
    try { group.name = lazerArtworkName(); } catch (error) {}
    try { app.activeDocument.selection = null; } catch (error) {}
    var cb = boundsOf(group);
    addReport('LAZER check crop result: W=' + ptToCm(cb.width) + 'cm | H=' + ptToCm(cb.height) + 'cm | clipping mask only in check mode.');
    return group;
  } catch (error) {
    try { if (group !== null) group.remove(); } catch (cleanupGroupError) {}
    try { if (cropMask !== null) cropMask.remove(); } catch (cleanupError) {}
    throw new Error('LAZER_CHECK_CROP_FAILED: ' + String(error));
  }
}

function findClipMaskInGroup(group, label) {
  var names = [
    'MASK_BORDER_' + label,
    'MASK_FROM_' + lazerOutlineName() + '_' + label,
    lazerClipMaskName(),
    'MASK_30_48CM_' + label
  ];
  for (var i = 0; i < group.pageItems.length; i += 1) {
    try {
      var clippingItem = group.pageItems[i];
      if (clippingItem.clipping === true) return clippingItem;
    } catch (error) {}
  }
  for (var j = 0; j < group.pageItems.length; j += 1) {
    try {
      var item = group.pageItems[j];
      for (var n = 0; n < names.length; n += 1) {
        if (item.name === names[n]) return item;
      }
    } catch (error) {}
  }
  return null;
}

function findRasterInGroup(group) {
  for (var i = 0; i < group.pageItems.length; i += 1) {
    try { if (group.pageItems[i].typename === 'RasterItem' || group.pageItems[i].typename === 'PlacedItem') return group.pageItems[i]; } catch (error) {}
  }
  return null;
}

function unionBounds(boundsList) {
  if (boundsList.length === 0) return null;
  var left = boundsList[0].left;
  var top = boundsList[0].top;
  var right = boundsList[0].right;
  var bottom = boundsList[0].bottom;
  for (var i = 1; i < boundsList.length; i += 1) {
    if (boundsList[i].left < left) left = boundsList[i].left;
    if (boundsList[i].top > top) top = boundsList[i].top;
    if (boundsList[i].right > right) right = boundsList[i].right;
    if (boundsList[i].bottom < bottom) bottom = boundsList[i].bottom;
  }
  return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: top - bottom };
}
function allColoredBounds(raster, metrics) {
  var list = [];
  if (!metrics || !metrics.components) return list;
  var rb = geometricBoundsOf(raster);
  var sx = rb.width / metrics.imageWidthPx;
  var sy = rb.height / metrics.imageHeightPx;
  for (var i = 0; i < metrics.components.length; i += 1) {
    var c = metrics.components[i];
    list.push({ index: i, bounds: {
      left: rb.left + (c.minX * sx),
      right: rb.left + ((c.maxX + 1) * sx),
      top: rb.top - (c.minY * sy),
      bottom: rb.top - ((c.maxY + 1) * sy),
      width: (c.maxX - c.minX + 1) * sx,
      height: (c.maxY - c.minY + 1) * sy
    }});
  }
  return list;
}

function insideMask(mask, bounds) {
  var mb = boundsOf(mask);
  return bounds.left >= mb.left && bounds.top <= mb.top && bounds.right <= mb.right && bounds.bottom >= mb.bottom;
}

function pickBounds(mask, boundsList, preferredIndex, useUnion) {
  var inside = [];
  for (var i = 0; i < boundsList.length; i += 1) if (insideMask(mask, boundsList[i].bounds)) inside.push(boundsList[i].bounds);
  if (inside.length === 0) return null;
  if (useUnion === true) return unionBounds(inside);
  for (var j = 0; j < inside.length; j += 1) if (boundsList[j].index === preferredIndex) return inside[j];
  return inside[Math.floor(inside.length / 2)];
}

function intersectBounds(first, second) {
  var left = Math.max(first.left, second.left);
  var top = Math.min(first.top, second.top);
  var right = Math.min(first.right, second.right);
  var bottom = Math.max(first.bottom, second.bottom);
  if (right <= left || top <= bottom) return null;
  return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: top - bottom };
}

function visibleColoredBoundsInsideMask(mask, boundsList) {
  var maskBounds = boundsOf(mask);
  var visible = [];
  for (var i = 0; i < boundsList.length; i += 1) {
    var clipped = intersectBounds(boundsList[i].bounds, maskBounds);
    if (clipped !== null) visible.push(clipped);
  }
  return unionBounds(visible);
}

function componentOverlapScore(bounds, maskBounds) {
  var clipped = intersectBounds(bounds, maskBounds);
  if (clipped === null) return 0;
  return Math.max(0, clipped.width) * Math.max(0, clipped.height);
}

function pickComponentForMask(mask, metrics, preferredIndex, useUnion) {
  if (!mask || !metrics || !metrics.components || metrics.components.length === 0) return null;
  var rb = null;
  try { rb = geometricBoundsOf(app.activeDocument.selection.length ? app.activeDocument.selection[0] : mask); } catch (error) {}
  var maskBounds = boundsOf(mask);
  var components = metrics.components;
  var scaleBounds = function(component, rasterBounds) {
    var scaleX = rasterBounds.width / metrics.imageWidthPx;
    var scaleY = rasterBounds.height / metrics.imageHeightPx;
    return {
      left: rasterBounds.left + component.minX * scaleX,
      top: rasterBounds.top - component.minY * scaleY,
      right: rasterBounds.left + (component.maxX + 1) * scaleX,
      bottom: rasterBounds.top - (component.maxY + 1) * scaleY,
      width: (component.maxX - component.minX + 1) * scaleX,
      height: (component.maxY - component.minY + 1) * scaleY
    };
  };
  return { components: components, maskBounds: maskBounds, scaleBounds: scaleBounds };
}

function pickBestComponentForRasterMask(raster, metrics, mask, preferredIndex, useUnion) {
  if (!raster || !metrics || !metrics.components || metrics.components.length === 0 || !mask) return null;
  var rb = geometricBoundsOf(raster);
  var mb = boundsOf(mask);
  var scaleX = rb.width / metrics.imageWidthPx;
  var scaleY = rb.height / metrics.imageHeightPx;
  var candidates = [];
  for (var i = 0; i < metrics.components.length; i += 1) {
    var component = metrics.components[i];
    var bounds = {
      left: rb.left + component.minX * scaleX,
      top: rb.top - component.minY * scaleY,
      right: rb.left + (component.maxX + 1) * scaleX,
      bottom: rb.top - (component.maxY + 1) * scaleY,
      width: (component.maxX - component.minX + 1) * scaleX,
      height: (component.maxY - component.minY + 1) * scaleY
    };
    var score = componentOverlapScore(bounds, mb);
    if (score > 0) candidates.push({ index: i, component: component, bounds: bounds, score: score });
  }
  if (candidates.length === 0) return null;
  if (useUnion === true) {
    var unionList = [];
    for (var u = 0; u < candidates.length; u += 1) unionList.push(candidates[u].bounds);
    return { component: candidates[0].component, bounds: unionBounds(unionList), index: -1, score: candidates[0].score, mode: 'union' };
  }
  for (var j = 0; j < candidates.length; j += 1) {
    if (candidates[j].index === preferredIndex) {
      candidates[j].mode = 'preferred';
      return candidates[j];
    }
  }
  candidates.sort(function(a, b) { return b.score - a.score; });
  candidates[0].mode = 'overlap';
  return candidates[0];
}

function exactColorEdgeBoundsFromComponent(raster, metrics, component, mask) {
  if (!raster || !metrics || !component || !component.rowExtremes || !mask) return null;
  var rb = geometricBoundsOf(raster);
  var mb = boundsOf(mask);
  var scaleX = rb.width / metrics.imageWidthPx;
  var scaleY = rb.height / metrics.imageHeightPx;
  var minX = null;
  var maxX = null;
  var minY = null;
  var maxY = null;
  var leftPoint = null;
  var rightPoint = null;
  var bottomPoint = null;
  var secondaryLeftPoint = null;
  var leftCandidates = [];
  var rows = component.rowExtremes;
  for (var key in rows) {
    if (!rows.hasOwnProperty(key)) continue;
    var yPx = Number(key);
    var row = rows[key];
    var rowTopY = rb.top - (yPx * scaleY);
    var rowBottomY = rb.top - ((yPx + 1) * scaleY);
    var rowLeftX = rb.left + (row.minX * scaleX);
    var rowRightX = rb.left + ((row.maxX + 1) * scaleX);
    var visibleLeftX = Math.max(rowLeftX, mb.left);
    var visibleRightX = Math.min(rowRightX, mb.right);
    var visibleTopY = Math.min(rowTopY, mb.top);
    var visibleBottomY = Math.max(rowBottomY, mb.bottom);
    if (visibleLeftX > visibleRightX || visibleBottomY > visibleTopY) continue;
    var visibleCenterY = (visibleTopY + visibleBottomY) / 2;
    leftCandidates.push({ point: [visibleLeftX, visibleCenterY], width: visibleRightX - visibleLeftX });
    if (minX === null || visibleLeftX < minX) { minX = visibleLeftX; leftPoint = [visibleLeftX, visibleCenterY]; }
    if (maxX === null || visibleRightX > maxX) { maxX = visibleRightX; rightPoint = [visibleRightX, visibleCenterY]; }
    if (maxY === null || visibleTopY > maxY) maxY = visibleTopY;
    if (minY === null || visibleBottomY < minY) {
      minY = visibleBottomY;
      var bottomPointX = rowLeftX >= mb.left && rowLeftX <= mb.right ? rowLeftX : rowRightX;
      if (bottomPointX < mb.left || bottomPointX > mb.right) bottomPointX = visibleLeftX;
      bottomPoint = [bottomPointX, visibleBottomY];
    }
  }
  if (minX === null || maxX === null || minY === null || maxY === null) return null;
  leftCandidates.sort(function(a, b) { return a.width - b.width; });
  for (var candidateIndex = 0; candidateIndex < leftCandidates.length; candidateIndex += 1) {
    if (!leftPoint || Math.abs(leftCandidates[candidateIndex].point[1] - leftPoint[1]) > scaleY * 5) { secondaryLeftPoint = leftCandidates[candidateIndex].point; break; }
  }
  return { left: minX, top: maxY, right: maxX, bottom: minY, width: maxX - minX, height: maxY - minY, leftPoint: leftPoint, secondaryLeftPoint: secondaryLeftPoint, leftCandidates: leftCandidates, rightPoint: rightPoint, bottomPoint: bottomPoint };
}

function formatBoundsForCheck(bounds) {
  if (bounds === null) return 'null';
  return 'L=' + ptToCm(bounds.left) + ', T=' + ptToCm(bounds.top) + ', R=' + ptToCm(bounds.right) + ', B=' + ptToCm(bounds.bottom);
}

function addCheckBoundsDiagnostics(label, mask, raster, boundsList) {
  var enabled = false;
  try { enabled = ((typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true) || (typeof CODEX_USE_CHECK_MEASUREMENT !== 'undefined' && CODEX_USE_CHECK_MEASUREMENT === true)); } catch (error) {}
  if (!enabled) return;
  var raw = [];
  for (var i = 0; i < boundsList.length; i += 1) raw.push(boundsList[i].bounds);
  addReport(String(label).toUpperCase() + ' BOUNDS DEBUG');
  addReport('Mask: ' + formatBoundsForCheck(boundsOf(mask)));
  addReport('Raster: ' + formatBoundsForCheck(boundsOf(raster)));
  addReport('Colored union: ' + formatBoundsForCheck(unionBounds(raw)));
  addReport('Visible union: ' + formatBoundsForCheck(visibleColoredBoundsInsideMask(mask, boundsList)));
}

function blue() {
  var color = new RGBColor(); color.red = 0; color.green = 102; color.blue = 255; return color;
}

function drawDebug(caseLayer, bounds, label) {
  if (bounds === null) return null;
  var box = caseLayer.pathItems.rectangle(bounds.top, bounds.left, bounds.width, bounds.height);
  box.name = 'DEBUG_BLACK_PIXEL_BOUNDS_' + label;
  box.filled = false;
  box.stroked = true;
  box.strokeWidth = 0.25;
  box.strokeColor = blue();
  unlockAndShow(box);
  return box;
}

function report(label, mask, bounds) {
  if (bounds === null) return label + '\nfalse\nKhông tìm thấy ô màu trong mask';
  var mb = boundsOf(mask);
  var leftCm = ptToCm(bounds.left - mb.left);
  var topCm = ptToCm(mb.top - bounds.top);
  var rightCm = ptToCm(mb.right - bounds.right);
  var bottomCm = ptToCm(bounds.bottom - mb.bottom);
  var ok = Math.abs(leftCm - rightCm) <= EQUAL_TOLERANCE_CM && Math.abs(topCm - bottomCm) <= EQUAL_TOLERANCE_CM;
  return [(ok ? 'true' : 'false'), label, 'Trai: ' + leftCm + ' cm', 'Tren: ' + topCm + ' cm', 'Phai: ' + rightCm + ' cm', 'Duoi: ' + bottomCm + ' cm'].join('\n');
}

function exactColorEdgeBoundsFromRaster(raster, metrics, mask) {
  if (!raster || !metrics || !mask) return null;
  var rows = metrics.globalRowExtremes;
  var rb = geometricBoundsOf(raster);
  var mb = boundsOf(mask);
  var scaleX = rb.width / metrics.imageWidthPx;
  var scaleY = rb.height / metrics.imageHeightPx;
  var minX = null;
  var maxX = null;
  var minY = null;
  var maxY = null;
  var leftPoint = null;
  var rightPoint = null;
  var bottomPoint = null;
  var secondaryLeftPoint = null;
  var leftCandidates = [];
  if (rows) {
    for (var key in rows) {
      if (!rows.hasOwnProperty(key)) continue;
      var yPx = Number(key);
      var row = rows[key];
      var rowTopY = rb.top - (yPx * scaleY);
      var rowBottomY = rb.top - ((yPx + 1) * scaleY);
      var rowLeftX = rb.left + (row.minX * scaleX);
      var rowRightX = rb.left + ((row.maxX + 1) * scaleX);
      var visibleLeftX = Math.max(rowLeftX, mb.left);
      var visibleRightX = Math.min(rowRightX, mb.right);
      var visibleTopY = Math.min(rowTopY, mb.top);
      var visibleBottomY = Math.max(rowBottomY, mb.bottom);
      if (visibleLeftX > visibleRightX || visibleBottomY > visibleTopY) continue;
      var visibleCenterY = (visibleTopY + visibleBottomY) / 2;
      leftCandidates.push({ point: [visibleLeftX, visibleCenterY], width: visibleRightX - visibleLeftX });
      if (minX === null || visibleLeftX < minX) { minX = visibleLeftX; leftPoint = [visibleLeftX, visibleCenterY]; }
      if (maxX === null || visibleRightX > maxX) { maxX = visibleRightX; rightPoint = [visibleRightX, visibleCenterY]; }
      if (maxY === null || visibleTopY > maxY) maxY = visibleTopY;
      if (minY === null || visibleBottomY < minY) {
        minY = visibleBottomY;
        var bottomPointX = rowLeftX >= mb.left && rowLeftX <= mb.right ? rowLeftX : rowRightX;
        if (bottomPointX < mb.left || bottomPointX > mb.right) bottomPointX = visibleLeftX;
        bottomPoint = [bottomPointX, visibleBottomY];
      }
    }
  }
  if (minX === null || maxX === null || minY === null || maxY === null) return null;
  leftCandidates.sort(function(a, b) { return a.width - b.width; });
  for (var candidateIndex = 0; candidateIndex < leftCandidates.length; candidateIndex += 1) {
    if (!leftPoint || Math.abs(leftCandidates[candidateIndex].point[1] - leftPoint[1]) > scaleY * 5) { secondaryLeftPoint = leftCandidates[candidateIndex].point; break; }
  }
  return {
    left: minX,
    top: maxY,
    right: maxX,
    bottom: minY,
    width: maxX - minX,
    height: maxY - minY,
    leftPoint: leftPoint,
    secondaryLeftPoint: secondaryLeftPoint,
    leftCandidates: leftCandidates,
    rightPoint: rightPoint,
    bottomPoint: bottomPoint
  };
}



function outlineEdgeBoundsFromRaster(raster, component, mask) {
  if (!raster || !component || !component.sampledOutline || component.sampledOutline.length === 0 || !mask) return null;
  var rb = geometricBoundsOf(raster);
  var mb = boundsOf(mask);
  var scaleX = rb.width / CODEX_COLORED_METRICS.imageWidthPx;
  var scaleY = rb.height / CODEX_COLORED_METRICS.imageHeightPx;
  var minX = null;
  var maxX = null;
  var minY = null;
  var maxY = null;
  var leftPoint = null;
  var rightPoint = null;
  var bottomPoint = null;
  for (var i = 0; i < component.sampledOutline.length; i += 1) {
    var point = component.sampledOutline[i];
    var x = rb.left + point.x * scaleX;
    var y = rb.top - point.y * scaleY;
    if (x < mb.left || x > mb.right || y > mb.top || y < mb.bottom) continue;
    if (minX === null || x < minX) { minX = x; leftPoint = [x, y]; }
    if (maxX === null || x > maxX) { maxX = x; rightPoint = [x, y]; }
    if (minY === null || y < minY) { minY = y; bottomPoint = [x, y]; }
    if (maxY === null || y > maxY) maxY = y;
  }
  if (minX === null || maxX === null || minY === null || maxY === null) return null;
  return { left: minX, top: maxY, right: maxX, bottom: minY, width: maxX - minX, height: maxY - minY, leftPoint: leftPoint, rightPoint: rightPoint, bottomPoint: bottomPoint };
}

function unionColoredBounds(boundsList) {
  var raw = [];
  for (var i = 0; i < boundsList.length; i += 1) raw.push(boundsList[i].bounds);
  return unionBounds(raw);
}

function checkDistanceColor() {
  var color = new RGBColor(); color.red = 255; color.green = 128; color.blue = 0; return color;
}

function checkMaskColor() {
  var color = new RGBColor(); color.red = 0; color.green = 180; color.blue = 80; return color;
}

function red() {
  var color = new RGBColor(); color.red = 255; color.green = 0; color.blue = 0; return color;
}

function blue() {
  var color = new RGBColor(); color.red = 0; color.green = 90; color.blue = 255; return color;
}

function pickSharedSparseLeftCandidate(frontMeasurement, backMeasurement, tolerance) {
  var frontList = frontMeasurement && frontMeasurement.leftCandidates ? frontMeasurement.leftCandidates.slice(0) : [];
  var backList = backMeasurement && backMeasurement.leftCandidates ? backMeasurement.leftCandidates.slice(0) : [];
  if (!frontList.length || !backList.length) return null;
  var minY = frontList[0].y, maxY = frontList[0].y;
  for (var rangeIndex = 0; rangeIndex < frontList.length; rangeIndex += 1) { if (frontList[rangeIndex].y < minY) minY = frontList[rangeIndex].y; if (frontList[rangeIndex].y > maxY) maxY = frontList[rangeIndex].y; }
  var targetY = minY + (maxY - minY) * 0.62;
  frontList.sort(function(a, b) { return Math.abs(a.y - targetY) - Math.abs(b.y - targetY) || a.width - b.width; });
  for (var i = 0; i < frontList.length; i += 1) {
    var frontCandidate = frontList[i];
    var matchedBack = null;
    for (var j = 0; j < backList.length; j += 1) {
      if (Math.abs(frontCandidate.y - backList[j].y) <= tolerance) { matchedBack = backList[j]; break; }
    }
    if (matchedBack) return { front: frontCandidate, back: matchedBack };
  }
  return null;
}
function pickSharedUpperLeftCandidate(frontMeasurement, backMeasurement, tolerance, excludePair) {
  var frontList = frontMeasurement && frontMeasurement.leftCandidates ? frontMeasurement.leftCandidates.slice(0) : [];
  var backList = backMeasurement && backMeasurement.leftCandidates ? backMeasurement.leftCandidates.slice(0) : [];
  if (!frontList.length || !backList.length) return null;
  var minY = frontList[0].y, maxY = frontList[0].y;
  for (var rangeIndex = 0; rangeIndex < frontList.length; rangeIndex += 1) { if (frontList[rangeIndex].y < minY) minY = frontList[rangeIndex].y; if (frontList[rangeIndex].y > maxY) maxY = frontList[rangeIndex].y; }
  var targetY = minY + (maxY - minY) * 0.38;
  frontList.sort(function(a, b) { return Math.abs(a.y - targetY) - Math.abs(b.y - targetY) || a.width - b.width; });
  for (var i = 0; i < frontList.length; i += 1) {
    var frontCandidate = frontList[i];
    if (excludePair && Math.abs(frontCandidate.y - excludePair.front.y) <= tolerance * 3) continue;
    for (var j = 0; j < backList.length; j += 1) {
      var backCandidate = backList[j];
      if (Math.abs(frontCandidate.y - backCandidate.y) <= tolerance) return { front: frontCandidate, back: backCandidate };
    }
  }
  return null;
}


function drawCheckLeftPointPair(documentRef, frontMeasurement, backMeasurement, sharedLeftPair, variant) {
  try {
    var enabled = false;
    try { enabled = typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true; } catch (error) {}
    if (!enabled || !frontMeasurement || !backMeasurement) return;
    var layer = ensureLayer(documentRef, 'CHECK_EDGE_DISTANCE');
    var group = layer.groupItems.add();
    group.name = 'CHECK_LEFT_POINT_FRONT_BACK' + (variant ? '_' + variant : '');
    var frontMask = findNamedPageItemAtRoot(documentRef, 'MASK_30_48CM_front');
    var backMask = findNamedPageItemAtRoot(documentRef, 'MASK_30_48CM_back');
    if (!frontMask || !backMask) return;
    var frontBounds = boundsOf(frontMask);
    var backBounds = boundsOf(backMask);
    var frontLeftX = sharedLeftPair ? sharedLeftPair.front.leftX : (frontMeasurement.secondaryLeftX !== null ? frontMeasurement.secondaryLeftX : frontMeasurement.firstLeftX);
    var backLeftX = sharedLeftPair ? sharedLeftPair.back.leftX : (backMeasurement.secondaryLeftX !== null ? backMeasurement.secondaryLeftX : backMeasurement.firstLeftX);
    var sharedFrontY = sharedLeftPair ? sharedLeftPair.front.y : (frontMeasurement.secondaryLeftY !== null ? frontMeasurement.secondaryLeftY : frontMeasurement.firstLeftY);
    var sharedBackY = sharedLeftPair ? sharedLeftPair.back.y : (backMeasurement.secondaryLeftY !== null ? backMeasurement.secondaryLeftY : backMeasurement.firstLeftY);
    var sharedY = Math.min(frontBounds.top - sharedFrontY * CM_TO_POINT, backBounds.top - sharedBackY * CM_TO_POINT);
    var frontPoint = [frontBounds.left + frontLeftX * CM_TO_POINT, sharedY];
    var backPoint = [backBounds.left + backLeftX * CM_TO_POINT, sharedY];
    drawCheckMeasureLine(group, 'CHECK_LEFT_POINT_FRONT_LINE' + (variant ? '_' + variant : ''), [frontBounds.left, frontPoint[1]], frontPoint, blue());
    drawCheckMeasureLine(group, 'CHECK_LEFT_POINT_BACK_LINE' + (variant ? '_' + variant : ''), [backBounds.left, backPoint[1]], backPoint, red());
    drawCheckPointMarker(group, 'CHECK_LEFT_POINT_FRONT_MARK' + (variant ? '_' + variant : ''), frontPoint, blue());
    drawCheckPointMarker(group, 'CHECK_LEFT_POINT_BACK_MARK' + (variant ? '_' + variant : ''), backPoint, red());
    drawCheckMeasureText(group, 'FRONT LEFT', [frontPoint[0] + 5, frontPoint[1] + 15], blue());
    drawCheckMeasureText(group, 'BACK LEFT', [backPoint[0] + 5, backPoint[1] + 15], red());
  } catch (error) {}
}

function drawCheckMeasureLine(container, name, firstPoint, secondPoint, color) {
  var line = container.pathItems.add();
  line.name = name;
  line.stroked = true;
  line.filled = false;
  line.strokeWidth = 2;
  line.strokeColor = color;
  line.setEntirePath([firstPoint, secondPoint]);
  line.closed = false;
  unlockAndShow(line);
  return line;
}

function drawCheckMeasureText(container, contents, position, color) {
  try {
    var frame = container.textFrames.add();
    frame.name = 'CHECK_EDGE_LABEL';
    frame.contents = contents;
    frame.position = position;
    frame.textRange.characterAttributes.size = 10;
    frame.textRange.characterAttributes.fillColor = color;
    unlockAndShow(frame);
  } catch (error) {}
}

function drawCheckPointMarker(container, name, point, color) {
  var marker = container.pathItems.add();
  marker.name = name;
  marker.filled = true;
  marker.stroked = false;
  marker.fillColor = color;
  marker.left = point[0] - 1.25;
  marker.top = point[1] + 1.25;
  marker.width = 2.5;
  marker.height = 2.5;
  unlockAndShow(marker);
  return marker;
}

function resetCheckDistanceLayer(documentRef) {
  var layer = ensureLayer(documentRef, 'CHECK_EDGE_DISTANCE');
  layer.locked = false;
  layer.visible = true;
  for (var i = layer.pageItems.length - 1; i >= 0; i -= 1) {
    try { layer.pageItems[i].remove(); } catch (error) {}
  }
  return layer;
}

function drawCheckDistanceOverlay(label, mask, bounds) {
  var enabled = false;
  try { enabled = typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true; } catch (error) {}
  if (!enabled) return;
  var layer = ensureLayer(app.activeDocument, 'CHECK_EDGE_DISTANCE');
  layer.locked = false;
  layer.visible = true;
  var group = layer.groupItems.add();
  group.name = 'CHECK_EDGE_DISTANCE_' + label;
  var maskBounds = boundsOf(mask);
  var maskOutline = group.pathItems.rectangle(maskBounds.top, maskBounds.left, maskBounds.width, maskBounds.height);
  maskOutline.name = 'CHECK_MASK_30_48CM_' + label;
  maskOutline.filled = false;
  maskOutline.stroked = true;
  maskOutline.strokeWidth = 1;
  maskOutline.strokeColor = checkMaskColor();
  unlockAndShow(maskOutline);
  if (bounds === null) {
    drawCheckMeasureText(group, String(label).toUpperCase() + ': NO COLOR', [maskBounds.left, maskBounds.top - 12], checkDistanceColor());
    return;
  }
  var centerY = (bounds.top + bounds.bottom) / 2;
  var centerX = (bounds.left + bounds.right) / 2;
  var leftPoint = bounds.leftPoint || [bounds.left, centerY];
  var rightPoint = bounds.rightPoint || [bounds.right, centerY];
  var bottomPoint = bounds.bottomPoint || [centerX, bounds.bottom];
  var leftCm = ptToCm(leftPoint[0] - maskBounds.left);
  var rightCm = ptToCm(maskBounds.right - rightPoint[0]);
  var bottomCm = ptToCm(bottomPoint[1] - maskBounds.bottom);
  drawCheckMeasureLine(group, 'CHECK_EDGE_LEFT_' + label, [maskBounds.left, leftPoint[1]], leftPoint, checkDistanceColor());
  drawCheckMeasureLine(group, 'CHECK_EDGE_RIGHT_' + label, rightPoint, [maskBounds.right, rightPoint[1]], checkDistanceColor());
  drawCheckMeasureLine(group, 'CHECK_EDGE_BOTTOM_' + label, [bottomPoint[0], maskBounds.bottom], bottomPoint, checkDistanceColor());
  drawCheckPointMarker(group, 'CHECK_EDGE_BOTTOM_POINT_' + label, bottomPoint, red());
  drawCheckMeasureText(group, 'L ' + leftCm + 'cm', [maskBounds.left, leftPoint[1] + 10], checkDistanceColor());
  drawCheckMeasureText(group, 'R ' + rightCm + 'cm', [rightPoint[0], rightPoint[1] + 10], checkDistanceColor());
  drawCheckMeasureText(group, 'B ' + bottomCm + 'cm @ ' + Math.round(bottomPoint[0]) + ',' + Math.round(bottomPoint[1]), [bottomPoint[0] + 5, maskBounds.bottom], checkDistanceColor());
}

function checkEdgeDistanceReport(label, mask, bounds) {
  var upperLabel = String(label).toUpperCase();
  if (bounds === null) return 'CHECK_EDGE_' + upperLabel + ': false | readable=false | reason=NO_COLOR_BOUNDS';
  var mb = boundsOf(mask);
  var leftCm = ptToCm(bounds.left - mb.left);
  var rightCm = ptToCm(mb.right - bounds.right);
  var bottomCm = ptToCm(bounds.bottom - mb.bottom);
  var inside = insideMask(mask, bounds);
  return 'CHECK_EDGE_' + upperLabel + ': ' + (inside ? 'true' : 'false') + ' | readable=true | insideMask=' + inside + ' | Trai=' + leftCm + 'cm | Phai=' + rightCm + 'cm | Duoi=' + bottomCm + 'cm | BottomPoint=' + Math.round(bounds.bottomPoint ? bounds.bottomPoint[0] : bounds.left) + ',' + Math.round(bounds.bottomPoint ? bounds.bottomPoint[1] : bounds.bottom);
}

function showCheckEdgeDistance(label, mask, bounds, debugItem) {
  storeCheckMeasurement(label, bounds, mask);
  addReport(checkEdgeDistanceReport(label, mask, bounds));
  var enabled = false;
  try { enabled = typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true; } catch (error) {}
  if (!enabled) return;
  try { app.activeDocument.selection = null; } catch (error) {}
  try { if (debugItem !== null && debugItem !== undefined) debugItem.selected = true; } catch (error) {}
  try { app.redraw(); } catch (error) {}
  drawCheckDistanceOverlay(label, mask, bounds);
}

function findDebugBounds(caseLayer, label) {
  var found = findNamedPageItem(caseLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_' + label);
  if (found !== null) return found;
  return null;
}

function removeDebugFromContainer(container, debugName) {
  for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
    try {
      var item = container.pageItems[i];
      if (item.typename === 'GroupItem') removeDebugFromContainer(item, debugName);
      if (item.name === debugName) {
        unlockAndShow(item);
        item.remove();
      }
    } catch (error) {}
  }
}

function removeDebugByLabel(parentLayer, label) {
  var debugName = 'DEBUG_BLACK_PIXEL_BOUNDS_' + label;
  removeDebugFromContainer(parentLayer, debugName);
}

function collectRootScaleItems(parentLayer) {
  var items = [];
  unlockAndShow(parentLayer);
  for (var g = 0; g < parentLayer.groupItems.length; g += 1) {
    try { if (parentLayer.groupItems[g].parent === parentLayer) { unlockAndShow(parentLayer.groupItems[g]); items.push(parentLayer.groupItems[g]); } } catch (error) {}
  }
  for (var p = 0; p < parentLayer.pathItems.length; p += 1) {
    try { if (parentLayer.pathItems[p].parent === parentLayer) { unlockAndShow(parentLayer.pathItems[p]); items.push(parentLayer.pathItems[p]); } } catch (error) {}
  }
  return items;
}

function createTempScaleGroup(documentRef, parentLayer) {
  var items = collectRootScaleItems(parentLayer);
  if (items.length === 0) return null;
  documentRef.selection = null;
  for (var i = 0; i < items.length; i += 1) {
    try { items[i].selected = true; } catch (error) {}
  }
  try { app.executeMenuCommand('group'); } catch (error) {}
  var group = null;
  if (documentRef.selection !== null && documentRef.selection.length > 0) {
    try { group = documentRef.selection[0]; } catch (error) {}
  }
  if (group !== null) {
    try { group.name = 'TEMP_SCALE_GROUP_IMAGES'; } catch (error) {}
    try { group.move(parentLayer, ElementPlacement.PLACEATBEGINNING); } catch (error) {}
  }
  return group;
}

function ungroupTempScaleGroup(parentLayer) {
  ungroupTempAlignGroup(parentLayer, 'TEMP_SCALE_GROUP_IMAGES');
}

function scaleRootItemsTogether(items, scalePercent) {
  var groupBounds = unionVisibleBounds(items);
  if (groupBounds === null) return;
  var centerX = (groupBounds.left + groupBounds.right) / 2;
  var centerY = (groupBounds.top + groupBounds.bottom) / 2;
  var ratio = scalePercent / 100;
  for (var i = 0; i < items.length; i += 1) {
    try {
      var before = boundsOf(items[i]);
      var beforeCenterX = (before.left + before.right) / 2;
      var beforeCenterY = (before.top + before.bottom) / 2;
      items[i].resize(scalePercent, scalePercent, true, true, true, true, 100, Transformation.CENTER);
      var after = boundsOf(items[i]);
      var afterCenterX = (after.left + after.right) / 2;
      var afterCenterY = (after.top + after.bottom) / 2;
      var targetCenterX = centerX + ((beforeCenterX - centerX) * ratio);
      var targetCenterY = centerY + ((beforeCenterY - centerY) * ratio);
      items[i].translate(targetCenterX - afterCenterX, targetCenterY - afterCenterY);
    } catch (error) {}
  }
}

function scaleImagesByLazerSize(documentRef, parentLayer) {
  if (typeof CODEX_ITEM_SIZE_INCH === 'undefined' || CODEX_ITEM_SIZE_INCH <= 0) return;
  var debugItem = findDebugBounds(parentLayer, 'lazer');
  if (debugItem === null) {
    addReport('Scale failed: cannot find DEBUG_BLACK_PIXEL_BOUNDS_lazer');
    return;
  }
  var beforeBounds = boundsOf(debugItem);
  var currentSize = beforeBounds.width > beforeBounds.height ? beforeBounds.width : beforeBounds.height;
  var targetSize = CODEX_ITEM_SIZE_INCH * 72;
  if (currentSize <= 0 || targetSize <= 0) return;
  var scalePercent = (targetSize / currentSize) * 100;
  var items = collectRootScaleItems(parentLayer);
  scaleRootItemsTogether(items, scalePercent);
  var lazerArtwork = findNamedPageItem(parentLayer, lazerArtworkName());
  if (lazerArtwork !== null) setLazerColorBlackRecursive(lazerArtwork);
  var afterBounds = boundsOf(debugItem);
  var afterSize = afterBounds.width > afterBounds.height ? afterBounds.width : afterBounds.height;
  addReport([
    'Scale by DEBUG_BLACK_PIXEL_BOUNDS_lazer',
    'Before: ' + (currentSize / 72) + ' in',
    'Target: ' + CODEX_ITEM_SIZE_INCH + ' in',
    'Scale: ' + scalePercent + '%',
    'After: ' + (afterSize / 72) + ' in',
    'OK: ' + (Math.abs(afterSize - targetSize) <= 0.5)
  ].join('\n'));
}
function selectImagesForScaling(documentRef, parentLayer) {
  documentRef.selection = null;
}
function removeDebugBounds(parentLayer) {
  for (var i = 0; i < parentLayer.layers.length; i += 1) {
    var caseLayer = parentLayer.layers[i];
    unlockAndShow(caseLayer);
    for (var j = caseLayer.pathItems.length - 1; j >= 0; j -= 1) {
      try {
        var pathItem = caseLayer.pathItems[j];
        if (pathItem.name.indexOf('DEBUG_BLACK_PIXEL_BOUNDS_') === 0) {
          unlockAndShow(pathItem);
          pathItem.remove();
        }
      } catch (error) {}
    }
  }
}

function collectLayerPageItems(layerRef, list) {
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      unlockAndShow(layerRef.pageItems[i]);
      list.push(layerRef.pageItems[i]);
    } catch (error) {}
  }
  for (var j = 0; j < layerRef.layers.length; j += 1) collectLayerPageItems(layerRef.layers[j], list);
}

function unionVisibleBounds(items) {
  var list = [];
  for (var i = 0; i < items.length; i += 1) {
    try {
      var b = items[i].visibleBounds;
      list.push({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
    } catch (error) {}
  }
  if (list.length === 0) return null;
  var left = list[0].left;
  var top = list[0].top;
  var right = list[0].right;
  var bottom = list[0].bottom;
  for (var j = 1; j < list.length; j += 1) {
    if (list[j].left < left) left = list[j].left;
    if (list[j].top > top) top = list[j].top;
    if (list[j].right > right) right = list[j].right;
    if (list[j].bottom < bottom) bottom = list[j].bottom;
  }
  return { left: left, top: top, right: right, bottom: bottom };
}

function unionLayerPageItemBounds(layerRef) {
  unlockAndShow(layerRef);
  var list = [];
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      var item = layerRef.pageItems[i];
      if (item.name && item.name.indexOf('DEBUG_BLACK_PIXEL_BOUNDS_') === 0) continue;
      var b = item.visibleBounds;
      list.push({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
    } catch (error) {}
  }
  if (list.length === 0) return null;
  var left = list[0].left;
  var top = list[0].top;
  var right = list[0].right;
  var bottom = list[0].bottom;
  for (var j = 1; j < list.length; j += 1) {
    if (list[j].left < left) left = list[j].left;
    if (list[j].top > top) top = list[j].top;
    if (list[j].right > right) right = list[j].right;
    if (list[j].bottom < bottom) bottom = list[j].bottom;
  }
  return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: top - bottom };
}

function lineLikeBounds(item) {
  try {
    var b = item.visibleBounds;
    var width = b[2] - b[0];
    var height = b[1] - b[3];
    return width <= 3 || height <= 3;
  } catch (error) {}
  return false;
}

function getMarginBoxFromFourEdges(layerRef) {
  var leftEdge = null;
  var rightEdge = null;
  var topEdge = null;
  var bottomEdge = null;
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      var item = layerRef.pageItems[i];
      if (!lineLikeBounds(item)) continue;
      var b = boundsOf(item);
      if (b.width <= 3) {
        var centerX = (b.left + b.right) / 2;
        if (leftEdge === null || centerX < leftEdge.value) leftEdge = { value: centerX, item: item };
        if (rightEdge === null || centerX > rightEdge.value) rightEdge = { value: centerX, item: item };
      }
      if (b.height <= 3) {
        var centerY = (b.top + b.bottom) / 2;
        if (topEdge === null || centerY > topEdge.value) topEdge = { value: centerY, item: item };
        if (bottomEdge === null || centerY < bottomEdge.value) bottomEdge = { value: centerY, item: item };
      }
    } catch (error) {}
  }
  if (leftEdge === null || rightEdge === null || topEdge === null || bottomEdge === null) return null;
  return {
    left: leftEdge.value,
    top: topEdge.value,
    right: rightEdge.value,
    bottom: bottomEdge.value,
    source: 'Layer Margin 4 edges'
  };
}

function findTemplateItemInMargin(layerRef) {
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      var item = layerRef.pageItems[i];
      if (String(item.name).toLowerCase().indexOf('template') >= 0) return item;
    } catch (error) {}
  }
  return null;
}

function collectSelectablePageItems(container, list, skipDebugBounds) {
  if (container.name && (String(container.name).toLowerCase() === 'margin' || String(container.name).toLowerCase() === 'border')) return;
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      unlockAndShow(item);
      if (skipDebugBounds && item.name && item.name.indexOf('DEBUG_BLACK_PIXEL_BOUNDS_') === 0) continue;
      list.push(item);
    } catch (error) {}
  }
  if (container.layers) {
    for (var j = 0; j < container.layers.length; j += 1) {
      try { collectSelectablePageItems(container.layers[j], list, skipDebugBounds); } catch (error) {}
    }
  }
}

function groupContainerItems(container, groupName, skipDebugBounds) {
  var items = [];
  collectSelectablePageItems(container, items, skipDebugBounds);
  if (items.length === 0) return null;
  var documentRef = app.activeDocument;
  documentRef.selection = null;
  for (var j = 0; j < items.length; j += 1) {
    try { items[j].selected = true; } catch (error) {}
  }
  try { app.executeMenuCommand('group'); } catch (error) {}
  var group = null;
  if (documentRef.selection !== null && documentRef.selection.length > 0) {
    try { group = documentRef.selection[0]; } catch (error) {}
  }
  if (group !== null) {
    try { group.name = groupName; } catch (error) {}
  }
  return group;
}

function ungroupCaseItems(container, groupName) {
  for (var i = container.groupItems.length - 1; i >= 0; i -= 1) {
    try {
      var group = container.groupItems[i];
      if (group.name !== groupName) {
        ungroupCaseItems(group, groupName);
        continue;
      }
      unlockAndShow(group);
      while (group.pageItems.length > 0) {
        try { group.pageItems[0].move(container, ElementPlacement.PLACEATEND); } catch (error) { break; }
      }
      group.remove();
    } catch (error) {}
  }
}

function isMarginName(name) {
  if (!name) return false;
  return String(name).toLowerCase().indexOf('margin') >= 0;
}

function findLayerByName(container, layerName) {
  if (!container || !container.layers) return null;
  for (var i = 0; i < container.layers.length; i += 1) {
    try {
      var layer = container.layers[i];
      if (String(layer.name).toLowerCase() === String(layerName).toLowerCase()) return layer;
      var nested = findLayerByName(layer, layerName);
      if (nested !== null) return nested;
    } catch (error) {}
  }
  return null;
}

function collectMarginItems(container, list) {
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (isMarginName(item.name) || isMarginName(item.parent && item.parent.name)) list.push(item);
      if (item.typename === 'GroupItem') collectMarginItems(item, list);
    } catch (error) {}
  }
  for (var j = 0; j < container.layers.length; j += 1) {
    try { collectMarginItems(container.layers[j], list); } catch (error) {}
  }
}

function findPackAreaBounds(documentRef) {
  var marginLayer = findLayerByName(documentRef, 'Margin');
  if (marginLayer !== null) {
    unlockAndShow(marginLayer);
    var templateItem = findTemplateItemInMargin(marginLayer);
    if (templateItem !== null) {
      var templateBounds = boundsOf(templateItem);
      return {
        left: templateBounds.left,
        top: templateBounds.top,
        right: templateBounds.right,
        bottom: templateBounds.bottom,
        source: 'Margin Template'
      };
    }
    var edgeBox = getMarginBoxFromFourEdges(marginLayer);
    if (edgeBox !== null) return edgeBox;
    var layerBounds = unionLayerPageItemBounds(marginLayer);
    if (layerBounds !== null) {
      return {
        left: layerBounds.left,
        top: layerBounds.top,
        right: layerBounds.right,
        bottom: layerBounds.bottom,
        source: 'Layer Margin'
      };
    }
  }

  var marginItems = [];
  collectMarginItems(documentRef, marginItems);
  var marginBounds = unionVisibleBounds(marginItems);
  if (marginBounds !== null) {
    return {
      left: marginBounds.left,
      top: marginBounds.top,
      right: marginBounds.right,
      bottom: marginBounds.bottom,
      source: 'Margin'
    };
  }
  return {
    left: PACK_MARGIN_POINT,
    top: documentRef.height - PACK_MARGIN_POINT,
    right: documentRef.width - PACK_MARGIN_POINT,
    bottom: PACK_MARGIN_POINT,
    source: 'Fallback 2cm'
  };
}

function alignLayerItemsToBounds(layerRef, targetBounds) {
  var sourceBounds = unionLayerPageItemBounds(layerRef);
  if (sourceBounds === null) return;
  var dx = ((targetBounds.left + targetBounds.right) / 2) - ((sourceBounds.left + sourceBounds.right) / 2);
  var dy = ((targetBounds.top + targetBounds.bottom) / 2) - ((sourceBounds.top + sourceBounds.bottom) / 2);
  translateLayerPageItems(layerRef, dx, dy);
}

function translateLayerPageItems(layerRef, dx, dy) {
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      unlockAndShow(layerRef.pageItems[i]);
      layerRef.pageItems[i].translate(dx, dy);
    } catch (error) {}
  }
}

function translateCaseItems(parentLayer, label, dx, dy) {
  var clip = findNamedPageItem(parentLayer, caseLayerName(label));
  var debug = findNamedPageItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_' + label);
  var outline = label === 'lazer' ? findPackingLazerOutline(parentLayer) : null;
  try { if (clip !== null) clip.translate(dx, dy); } catch (error) {}
  try { if (debug !== null) debug.translate(dx, dy); } catch (error) {}
  try { if (outline !== null) outline.translate(dx, dy); } catch (error) {}
}

function rotateLayerPageItemsAroundCenter(layerRef, angle) {
  var box = unionLayerPageItemBounds(layerRef);
  if (box === null) return;
  var centerX = (box.left + box.right) / 2;
  var centerY = (box.top + box.bottom) / 2;
  for (var i = 0; i < layerRef.pageItems.length; i += 1) {
    try {
      var item = layerRef.pageItems[i];
      unlockAndShow(item);
      item.rotate(angle, true, true, true, true, Transformation.CENTER);
    } catch (error) {}
  }
  var after = unionLayerPageItemBounds(layerRef);
  if (after === null) return;
  var afterCenterX = (after.left + after.right) / 2;
  var afterCenterY = (after.top + after.bottom) / 2;
  translateLayerPageItems(layerRef, centerX - afterCenterX, centerY - afterCenterY);
}

function optimizeLayerRotationForPacking(layerRef) {
  var before = null;
  var outline = null;
  try { outline = findPackingLazerOutline(layerRef); } catch (error) {}
  if (outline !== null) before = boundsOf(outline);
  if (before === null) before = unionLayerPageItemBounds(layerRef);
  if (before === null) return;
  if (before.height >= before.width) return;
  rotateLayerPageItemsAroundCenter(layerRef, 90);
}

function optimizeCaseRotationForPacking(parentLayer, label) {
  var outline = label === 'lazer' ? findPackingLazerOutline(parentLayer) : null;
  var debug = findNamedPageItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_' + label);
  var ref = outline !== null ? outline : debug;
  if (ref === null) return;
  var rotateAngle = 0;
  var b = boundsOf(ref);
  if (b.height >= b.width) return;
  rotateAngle = 90;
  if (Math.abs(rotateAngle) < 0.01) return;
  var clip = findNamedPageItem(parentLayer, caseLayerName(label));
  var items = [];
  if (clip !== null) items.push(clip);
  if (debug !== null) items.push(debug);
  if (outline !== null) items.push(outline);
  var union = unionVisibleBounds(items);
  if (union === null) return;
  var centerX = (union.left + union.right) / 2;
  var centerY = (union.top + union.bottom) / 2;
  for (var i = 0; i < items.length; i += 1) {
    try { items[i].rotate(rotateAngle, true, true, true, true, Transformation.CENTER); } catch (error) {}
  }
  var after = unionVisibleBounds(items);
  if (after === null) return;
  translateCaseItems(parentLayer, label, centerX - ((after.left + after.right) / 2), centerY - ((after.top + after.bottom) / 2));
}

function findNamedPageItem(container, itemName) {
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (item.name === itemName) return item;
      if (item.typename === 'GroupItem') {
        var nested = findNamedPageItem(item, itemName);
        if (nested !== null) return nested;
      }
    } catch (error) {}
  }
  return null;
}

function findNamedPageItemAtRoot(container, itemName) {
  if (!container || !container.pageItems) return null;
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (item.name === itemName) return item;
    } catch (error) {}
  }
  return null;
}

function findPackingLazerOutline(container) {
  var itemName = lazerOutlineName();
  var rootItem = findNamedPageItemAtRoot(container, itemName);
  if (rootItem !== null) return rootItem;
  var nestedItem = findNamedPageItem(container, itemName);
  if (nestedItem !== null) {
    try {
      if (nestedItem.clipping === true) return null;
      if (String(nestedItem.name || '').indexOf('MASK_') === 0) return null;
    } catch (error) {}
  }
  return nestedItem;
}

function red() {
  var color = new RGBColor(); color.red = 220; color.green = 40; color.blue = 40; return color;
}

function getLongestOutlineEdges(outline) {
  var edges = [];
  try {
    var points = outline.pathPoints;
    if (!points || points.length < 2) return edges;
    for (var i = 0; i < points.length; i += 1) {
      var nextIndex = i === points.length - 1 ? 0 : i + 1;
      var a = points[i].anchor;
      var b = points[nextIndex].anchor;
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var length = Math.sqrt((dx * dx) + (dy * dy));
      if (length > 0.01) edges.push({ a: a, b: b, length: length });
    }
  } catch (error) {}
  if (edges.length === 0) return edges;
  edges.sort(function(left, right) { return right.length - left.length; });
  var maxLength = edges[0].length;
  var threshold = maxLength - 0.5;
  var longest = [];
  for (var j = 0; j < edges.length; j += 1) {
    if (edges[j].length >= threshold) longest.push(edges[j]);
  }
  return longest;
}

function getLongestEdgesFromPoints(points) {
  var edges = [];
  try {
    if (!points || points.length < 2) return edges;
    for (var i = 0; i < points.length; i += 1) {
      var nextIndex = i === points.length - 1 ? 0 : i + 1;
      var a = points[i];
      var b = points[nextIndex];
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var length = Math.sqrt((dx * dx) + (dy * dy));
      if (length > 0.01) edges.push({ a: a, b: b, length: length });
    }
  } catch (error) {}
  if (edges.length === 0) return edges;
  edges.sort(function(left, right) { return right.length - left.length; });
  var maxLength = edges[0].length;
  var threshold = maxLength - 0.5;
  var longest = [];
  for (var j = 0; j < edges.length; j += 1) {
    if (edges[j].length >= threshold) longest.push(edges[j]);
  }
  return longest;
}

function normalizeAngle(angle) {
  while (angle > 90) angle -= 180;
  while (angle < -90) angle += 180;
  return angle;
}

function edgeAngle(edge) {
  return normalizeAngle(Math.atan2(edge.b[1] - edge.a[1], edge.b[0] - edge.a[0]) * 180 / Math.PI);
}

function removeDocumentLayer(documentRef, layerName) {
  for (var i = documentRef.layers.length - 1; i >= 0; i -= 1) {
    try {
      if (documentRef.layers[i].name === layerName) {
        var wasLocked = false;
        var wasHidden = false;
        try { wasLocked = documentRef.layers[i].locked; } catch (error) {}
        try { wasHidden = documentRef.layers[i].hidden; } catch (error) {}
        unlockAndShow(documentRef.layers[i]);
        documentRef.layers[i].remove();
      }
    } catch (error) {}
  }
}

function edgeAlignmentError(edge) {
  var angle = Math.abs(edgeAngle(edge));
  var horizontalError = Math.abs(angle - 0);
  var verticalError = Math.abs(angle - 90);
  if (verticalError < horizontalError) return verticalError;
  return horizontalError;
}

function edgeBounds(edge) {
  var left = edge.a[0] < edge.b[0] ? edge.a[0] : edge.b[0];
  var right = edge.a[0] > edge.b[0] ? edge.a[0] : edge.b[0];
  var top = edge.a[1] > edge.b[1] ? edge.a[1] : edge.b[1];
  var bottom = edge.a[1] < edge.b[1] ? edge.a[1] : edge.b[1];
  return { left: left, right: right, top: top, bottom: bottom };
}


function edgeLength(edge) {
  var dx = edge.b[0] - edge.a[0];
  var dy = edge.b[1] - edge.a[1];
  return Math.sqrt((dx * dx) + (dy * dy));
}

function segmentOverlapLength(a1, a2, b1, b2) {
  var start = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  var end = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, end - start);
}

function longestEdgeTemplateMetrics(edge, templateBounds) {
  var angle = Math.abs(normalizeAngle(edgeAngle(edge)));
  var nearHorizontal = Math.min(Math.abs(angle), Math.abs(180 - angle)) <= 10;
  var nearVertical = Math.abs(90 - angle) <= 10;
  var box = edgeBounds(edge);
  var length = edgeLength(edge);
  var tolerance = 1.5;
  var metrics = {
    orientation: nearHorizontal ? 'horizontal' : (nearVertical ? 'vertical' : 'other'),
    distanceTop: Math.abs(box.top - templateBounds.top),
    distanceBottom: Math.abs(box.bottom - templateBounds.bottom),
    distanceLeft: Math.abs(box.left - templateBounds.left),
    distanceRight: Math.abs(box.right - templateBounds.right),
    overlapTop: nearHorizontal ? segmentOverlapLength(edge.a[0], edge.b[0], templateBounds.left, templateBounds.right) : 0,
    overlapBottom: nearHorizontal ? segmentOverlapLength(edge.a[0], edge.b[0], templateBounds.left, templateBounds.right) : 0,
    overlapLeft: nearVertical ? segmentOverlapLength(edge.a[1], edge.b[1], templateBounds.bottom, templateBounds.top) : 0,
    overlapRight: nearVertical ? segmentOverlapLength(edge.a[1], edge.b[1], templateBounds.bottom, templateBounds.top) : 0,
    length: length,
    tolerance: tolerance
  };
  metrics.overlapTopRatio = length > 0 ? metrics.overlapTop / length : 0;
  metrics.overlapBottomRatio = length > 0 ? metrics.overlapBottom / length : 0;
  metrics.overlapLeftRatio = length > 0 ? metrics.overlapLeft / length : 0;
  metrics.overlapRightRatio = length > 0 ? metrics.overlapRight / length : 0;
  return metrics;
}

function movedEdge(edge, dx, dy) {
  return {
    a: [edge.a[0] + dx, edge.a[1] + dy],
    b: [edge.b[0] + dx, edge.b[1] + dy]
  };
}

function edgeTemplateContactScore(edge, templateBounds) {
  var metrics = longestEdgeTemplateMetrics(edge, templateBounds);
  if (metrics.orientation === 'horizontal') {
    if (metrics.distanceTop <= metrics.tolerance) return 50000 + (metrics.overlapTopRatio * 20000) - (metrics.distanceTop * 1000);
    if (metrics.distanceBottom <= metrics.tolerance) return 35000 + (metrics.overlapBottomRatio * 15000) - (metrics.distanceBottom * 1000);
    return -30000 - (Math.min(metrics.distanceTop, metrics.distanceBottom) * 100);
  }
  if (metrics.orientation === 'vertical') {
    if (metrics.distanceLeft <= metrics.tolerance) return 42000 + (metrics.overlapLeftRatio * 18000) - (metrics.distanceLeft * 1000);
    if (metrics.distanceRight <= metrics.tolerance) return 26000 + (metrics.overlapRightRatio * 12000) - (metrics.distanceRight * 1000);
    return -22000 - (Math.min(metrics.distanceLeft, metrics.distanceRight) * 100);
  }
  return -60000;
}

function moveGroupByDelta(groupItem, dx, dy) {
  try { groupItem.translate(dx, dy); } catch (error) {}
}

function pushPackedGroup(groupItem, outline, templateBounds, obstacles) {
  var iterations = 0;
  var movedAnything = true;
  while (movedAnything && iterations < 25) {
    movedAnything = false;
    iterations += 1;
    var step = 1;
    while (true) {
      var outlineBounds = boundsOf(outline);
      var leftCandidate = movedBounds(outlineBounds, -step, 0);
      if (!boundsInsideTemplate(leftCandidate, templateBounds)) break;
      if (collidesOrTooClose(leftCandidate, obstacles)) break;
      moveGroupByDelta(groupItem, -step, 0);
      movedAnything = true;
    }
    while (true) {
      var outlineBoundsTop = boundsOf(outline);
      var topCandidate = movedBounds(outlineBoundsTop, 0, step);
      if (!boundsInsideTemplate(topCandidate, templateBounds)) break;
      if (collidesOrTooClose(topCandidate, obstacles)) break;
      moveGroupByDelta(groupItem, 0, step);
      movedAnything = true;
    }
  }
}


function deltaToPlaceBoundsInsideTemplate(bounds, templateBounds) {
  var dx = templateBounds.left - bounds.left;
  var dy = templateBounds.top - bounds.top;
  var movedRight = bounds.right + dx;
  var movedBottom = bounds.bottom + dy;
  if (movedRight > templateBounds.right) dx = templateBounds.right - bounds.right;
  if (movedBottom < templateBounds.bottom) dy = templateBounds.bottom - bounds.bottom;
  return { dx: dx, dy: dy };
}

function movedBounds(bounds, dx, dy) {
  return { left: bounds.left + dx, right: bounds.right + dx, top: bounds.top + dy, bottom: bounds.bottom + dy, width: bounds.width, height: bounds.height };
}

function boundsInsideTemplate(bounds, templateBounds) {
  var tolerance = 1.5;
  return bounds.left >= templateBounds.left - tolerance && bounds.right <= templateBounds.right + tolerance && bounds.top <= templateBounds.top + tolerance && bounds.bottom >= templateBounds.bottom - tolerance;
}

function countTemplateTouches(bounds, templateBounds) {
  var tolerance = 1.5;
  var touch = 0;
  if (Math.abs(bounds.left - templateBounds.left) <= tolerance) touch += 1;
  if (Math.abs(bounds.right - templateBounds.right) <= tolerance) touch += 1;
  if (Math.abs(bounds.top - templateBounds.top) <= tolerance) touch += 1;
  if (Math.abs(bounds.bottom - templateBounds.bottom) <= tolerance) touch += 1;
  return touch;
}



function templateTouchFlags(bounds, templateBounds) {
  var tolerance = 1.5;
  return {
    left: Math.abs(bounds.left - templateBounds.left) <= tolerance,
    right: Math.abs(bounds.right - templateBounds.right) <= tolerance,
    top: Math.abs(bounds.top - templateBounds.top) <= tolerance,
    bottom: Math.abs(bounds.bottom - templateBounds.bottom) <= tolerance
  };
}
function expandBounds(bounds, padding) {
  return {
    left: bounds.left - padding,
    right: bounds.right + padding,
    top: bounds.top + padding,
    bottom: bounds.bottom - padding,
    width: (bounds.right - bounds.left) + (padding * 2),
    height: (bounds.top - bounds.bottom) + (padding * 2)
  };
}

function boundsIntersects(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.top <= b.bottom || a.bottom >= b.top);
}


function pathPointsToPolygon(item) {
  var points = [];
  try {
    if (!item || !item.pathPoints || item.pathPoints.length < 2) return points;
    for (var i = 0; i < item.pathPoints.length; i += 1) {
      points.push([item.pathPoints[i].anchor[0], item.pathPoints[i].anchor[1]]);
    }
  } catch (error) {}
  return points;
}

function isPackedBorderItem(item) {
  try {
    if (!item) return false;
    if (item.hidden || item.guides) return false;
    if (item.typename !== 'PathItem') return false;
    if (item.clipping === true) return false;
    var note = '';
    try { note = String(item.note || ''); } catch (error) { note = ''; }
    // Names contain the image id/run suffix, so an exact comparison with the
    // current lazerOutlineName() silently discarded every previous item.
    if (note.indexOf('PACKED_ITEM_OUTLINE=1') >= 0) return true;
    return String(item.name || '').indexOf('_DEBUG_LAZER') >= 0;
  } catch (error) {}
  return false;
}

function markPackedBorderItem(item) {
  if (!item) return false;
  try {
    var note = String(item.note || '');
    if (note.indexOf('PACKED_ITEM_OUTLINE=1') < 0) {
      note += (note ? ';' : '') + 'PACKED_ITEM_OUTLINE=1';
      note += ';PACKED_ITEM_ID=' + (typeof CODEX_IMAGE_ID !== 'undefined' ? CODEX_IMAGE_ID : 'unknown');
      item.note = note;
    }
    return true;
  } catch (error) {}
  return false;
}
function collectBorderPolygons(container, list) {
  if (!list) list = [];
  if (container === null) return list;
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (!isPackedBorderItem(item)) { if (item.typename === 'GroupItem') collectBorderPolygons(item, list); continue; }
      var points = pathPointsToPolygon(item);
      if (points.length >= 3) {
        list.push(points);
      }
      if (item.typename === 'GroupItem') collectBorderPolygons(item, list);
    } catch (error) {}
  }
  return list;
}

function polygonBounds(points) {
  if (!points || points.length === 0) return null;
  var left = points[0][0];
  var right = points[0][0];
  var top = points[0][1];
  var bottom = points[0][1];
  for (var i = 1; i < points.length; i += 1) {
    if (points[i][0] < left) left = points[i][0];
    if (points[i][0] > right) right = points[i][0];
    if (points[i][1] > top) top = points[i][1];
    if (points[i][1] < bottom) bottom = points[i][1];
  }
  return { left: left, right: right, top: top, bottom: bottom, width: right - left, height: top - bottom };
}

function polygonSegments(points) {
  var segments = [];
  if (!points || points.length < 2) return segments;
  for (var i = 0; i < points.length; i += 1) {
    var next = i === points.length - 1 ? 0 : i + 1;
    segments.push({ a: points[i], b: points[next] });
  }
  return segments;
}

function orientation(a, b, c) {
  return ((b[1] - a[1]) * (c[0] - b[0])) - ((b[0] - a[0]) * (c[1] - b[1]));
}

function onSegment(a, b, c) {
  return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);
}

function segmentsIntersect(p1, q1, p2, q2) {
  var o1 = orientation(p1, q1, p2);
  var o2 = orientation(p1, q1, q2);
  var o3 = orientation(p2, q2, p1);
  var o4 = orientation(p2, q2, q1);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  var eps = 0.001;
  if (Math.abs(o1) < eps && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) < eps && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) < eps && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) < eps && onSegment(p2, q1, q2)) return true;
  return false;
}

function pointInPolygon(point, polygon) {
  var inside = false;
  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    var pi = polygon[i];
    var pj = polygon[j];
    var intersect = ((pi[1] > point[1]) !== (pj[1] > point[1])) &&
      (point[0] < ((pj[0] - pi[0]) * (point[1] - pi[1]) / ((pj[1] - pi[1]) || 0.00001)) + pi[0]);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonsIntersect(a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return false;
  var boundsA = polygonBounds(a);
  var boundsB = polygonBounds(b);
  if (boundsA === null || boundsB === null) return false;
  if (boundsA.right < boundsB.left || boundsA.left > boundsB.right || boundsA.top < boundsB.bottom || boundsA.bottom > boundsB.top) return false;
  var segA = polygonSegments(a);
  var segB = polygonSegments(b);
  for (var i = 0; i < segA.length; i += 1) {
    for (var j = 0; j < segB.length; j += 1) {
      if (segmentsIntersect(segA[i].a, segA[i].b, segB[j].a, segB[j].b)) return true;
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

function buildPolygonCollisionIndex(polygons) {
  var index = [];
  if (!polygons) return index;
  for (var i = 0; i < polygons.length; i += 1) {
    var points = polygons[i];
    var bounds = polygonBounds(points);
    if (bounds === null) continue;
    index.push({ points: points, bounds: bounds, segments: polygonSegments(points) });
  }
  return index;
}

function polygonIntersectsCollisionIndex(points, pointsBoundsValue, index) {
  if (!points || points.length < 3 || !pointsBoundsValue || !index || index.length === 0) return false;
  var pointSegments = polygonSegments(points);
  for (var i = 0; i < index.length; i += 1) {
    var entry = index[i];
    var obstacleBounds = entry.bounds;
    if (pointsBoundsValue.right < obstacleBounds.left || pointsBoundsValue.left > obstacleBounds.right || pointsBoundsValue.top < obstacleBounds.bottom || pointsBoundsValue.bottom > obstacleBounds.top) continue;
    for (var a = 0; a < pointSegments.length; a += 1) {
      for (var b = 0; b < entry.segments.length; b += 1) {
        if (segmentsIntersect(pointSegments[a].a, pointSegments[a].b, entry.segments[b].a, entry.segments[b].b)) return true;
      }
    }
    if (pointInPolygon(points[0], entry.points) || pointInPolygon(entry.points[0], points)) return true;
  }
  return false;
}

function translatePolygon(points, dx, dy) {
  var translated = [];
  for (var i = 0; i < points.length; i += 1) translated.push([points[i][0] + dx, points[i][1] + dy]);
  return translated;
}

function rotatePolygon(points, angleDegrees) {
  var bounds = polygonBounds(points);
  if (bounds === null) return points;
  var center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  var radians = angleDegrees * Math.PI / 180;
  var cosValue = Math.cos(radians);
  var sinValue = Math.sin(radians);
  var result = [];
  for (var i = 0; i < points.length; i += 1) {
    var x = points[i][0] - center.x;
    var y = points[i][1] - center.y;
    result.push([center.x + (x * cosValue) - (y * sinValue), center.y + (x * sinValue) + (y * cosValue)]);
  }
  return result;
}

function expandPolygon(points, amount) {
  var bounds = polygonBounds(points);
  if (bounds === null) return points;
  var center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  var result = [];
  for (var i = 0; i < points.length; i += 1) {
    var dx = points[i][0] - center.x;
    var dy = points[i][1] - center.y;
    var length = Math.sqrt((dx * dx) + (dy * dy)) || 1;
    result.push([points[i][0] + (dx / length) * amount, points[i][1] + (dy / length) * amount]);
  }
  return result;
}

function collectVisibleBounds(container, list) {
  if (!list) list = [];
  if (container === null) return list;
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (isPackedBorderItem(item)) list.push(boundsOf(item));
      else if (item.typename === 'GroupItem') collectVisibleBounds(item, list);
    } catch (error) {}
  }
  return list;
}

function collidesWithAny(bounds, obstacles) {
  for (var i = 0; i < obstacles.length; i += 1) {
    if (boundsIntersects(bounds, obstacles[i])) return true;
  }
  return false;
}

function hasRequiredGapFromAny(bounds, obstacles, requiredGap) {
  if (!obstacles || obstacles.length === 0) return true;
  for (var i = 0; i < obstacles.length; i += 1) {
    if (boundsGap(bounds, obstacles[i]) < requiredGap - 0.5) return false;
  }
  return true;
}

function collidesOrTooClose(bounds, obstacles) {
  return !hasRequiredGapFromAny(bounds, obstacles, PACK_GAP_POINT);
}

function boundsGap(a, b) {
  var horizontalGap = 0;
  if (a.right < b.left) horizontalGap = b.left - a.right;
  else if (b.right < a.left) horizontalGap = a.left - b.right;

  var verticalGap = 0;
  if (a.top < b.bottom) verticalGap = b.bottom - a.top;
  else if (b.top < a.bottom) verticalGap = a.bottom - b.top;

  if (horizontalGap === 0) return verticalGap;
  if (verticalGap === 0) return horizontalGap;
  return Math.sqrt((horizontalGap * horizontalGap) + (verticalGap * verticalGap));
}

function nearestGapToObstacles(bounds, obstacles) {
  if (bounds === null || !obstacles || obstacles.length === 0) return null;
  var best = null;
  for (var i = 0; i < obstacles.length; i += 1) {
    var gap = boundsGap(bounds, obstacles[i]);
    if (best === null || gap < best) best = gap;
  }
  return best;
}

function rowTopCandidates(templateBounds, obstacles) {
  var rows = [templateBounds.top];
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i += 1) {

      var rowTop = obstacles[i].bottom - PACK_GAP_POINT;
      if (rowTop <= templateBounds.top + 1.5 && rowTop >= templateBounds.bottom - 1.5) rows.push(rowTop);
    }
  }
  rows.sort(function(a, b) { return b - a; });
  var unique = [];
  for (var r = 0; r < rows.length; r += 1) {
    var exists = false;
    for (var u = 0; u < unique.length; u += 1) {
      if (Math.abs(unique[u] - rows[r]) <= 1.5) exists = true;
    }
    if (!exists) unique.push(rows[r]);
  }
  return unique;
}

function rowStartX(templateBounds, obstacles) {
  var startX = templateBounds.left;
  if (!obstacles || obstacles.length === 0) return startX;
  for (var i = 0; i < obstacles.length; i += 1) {
    if (obstacles[i].left <= templateBounds.left + 1.5 && obstacles[i].right > startX) {
      startX = obstacles[i].right + PACK_GAP_POINT;
    }
  }
  return startX;
}


function uniqueSortedCandidates(candidates, minValue, maxValue) {
  candidates.sort(function(a, b) { return a - b; });
  var unique = [];
  for (var c = 0; c < candidates.length; c += 1) {
    if (candidates[c] < minValue - 1.5 || candidates[c] > maxValue + 1.5) continue;
    var exists = false;
    for (var u = 0; u < unique.length; u += 1) {
      if (Math.abs(unique[u] - candidates[c]) <= 0.25) exists = true;
    }
    if (!exists) unique.push(candidates[c]);
  }
  return unique;
}

function xPlacementCandidates(templateBounds, obstacles, width) {
  var candidates = [templateBounds.left, templateBounds.right - width];
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i += 1) {
      candidates.push(obstacles[i].right + PACK_GAP_POINT);
      candidates.push(obstacles[i].left - PACK_GAP_POINT - width);
      candidates.push(obstacles[i].left);
      candidates.push(obstacles[i].right - width);
    }
  }
  return uniqueSortedCandidates(candidates, templateBounds.left, templateBounds.right - width);
}

function yPlacementCandidates(templateBounds, obstacles, height) {
  var candidates = [templateBounds.top, templateBounds.bottom + height];
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i += 1) {
      candidates.push(obstacles[i].bottom - PACK_GAP_POINT + height);
      candidates.push(obstacles[i].top + PACK_GAP_POINT);
      candidates.push(obstacles[i].top);
      candidates.push(obstacles[i].bottom + height);
    }
  }
  candidates.sort(function(a, b) { return b - a; });
  var unique = [];
  for (var c = 0; c < candidates.length; c += 1) {
    if (candidates[c] > templateBounds.top + 1.5 || candidates[c] - height < templateBounds.bottom - 1.5) continue;
    var exists = false;
    for (var u = 0; u < unique.length; u += 1) {
      if (Math.abs(unique[u] - candidates[c]) <= 0.25) exists = true;
    }
    if (!exists) unique.push(candidates[c]);
  }
  return unique;
}


function contactScoreAgainstObstacles(bounds, obstacles) {
  if (!obstacles || obstacles.length === 0) return 0;
  var tolerance = 1.5;
  var score = 0;
  for (var i = 0; i < obstacles.length; i += 1) {
    var obstacle = obstacles[i];
    var verticalOverlap = Math.max(0, Math.min(bounds.top, obstacle.top) - Math.max(bounds.bottom, obstacle.bottom));
    var horizontalOverlap = Math.max(0, Math.min(bounds.right, obstacle.right) - Math.max(bounds.left, obstacle.left));
    var leftGap = Math.abs(bounds.left - obstacle.right);
    var rightGap = Math.abs(bounds.right - obstacle.left);
    var topGap = Math.abs(bounds.top - obstacle.bottom);
    var bottomGap = Math.abs(bounds.bottom - obstacle.top);
    if (Math.abs(leftGap - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) score += 10000 + verticalOverlap;
    if (Math.abs(rightGap - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) score += 9000 + verticalOverlap;
    if (Math.abs(topGap - PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) score += 12000 + horizontalOverlap;
    if (Math.abs(bottomGap - PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) score += 7000 + horizontalOverlap;
  }
  return score;
}

function cornerGapScore(bounds, obstacles) {
  if (!obstacles || obstacles.length < 2) return 0;
  var tolerance = 3;
  var score = 0;
  for (var i = 0; i < obstacles.length; i += 1) {
    for (var j = i + 1; j < obstacles.length; j += 1) {
      var a = obstacles[i];
      var b = obstacles[j];
      var horizontalGap = Math.abs(a.right - b.left) <= PACK_GAP_POINT + tolerance || Math.abs(b.right - a.left) <= PACK_GAP_POINT + tolerance;
      var verticalGap = Math.abs(a.bottom - b.top) <= PACK_GAP_POINT + tolerance || Math.abs(b.bottom - a.top) <= PACK_GAP_POINT + tolerance;
      if (!(horizontalGap || verticalGap)) continue;

      var leftNear = Math.abs(bounds.left - a.right) <= PACK_GAP_POINT + tolerance || Math.abs(bounds.left - b.right) <= PACK_GAP_POINT + tolerance;
      var rightNear = Math.abs(bounds.right - a.left) <= PACK_GAP_POINT + tolerance || Math.abs(bounds.right - b.left) <= PACK_GAP_POINT + tolerance;
      var topNear = Math.abs(bounds.top - a.bottom) <= PACK_GAP_POINT + tolerance || Math.abs(bounds.top - b.bottom) <= PACK_GAP_POINT + tolerance;
      var bottomNear = Math.abs(bounds.bottom - a.top) <= PACK_GAP_POINT + tolerance || Math.abs(bounds.bottom - b.top) <= PACK_GAP_POINT + tolerance;

      if ((leftNear || rightNear) && (topNear || bottomNear)) score += 3000;
    }
  }
  return score;
}

function unionBoundsWithCandidate(candidate, obstacles) {
  var union = { left: candidate.left, right: candidate.right, top: candidate.top, bottom: candidate.bottom };
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i += 1) {
      if (obstacles[i].left < union.left) union.left = obstacles[i].left;
      if (obstacles[i].right > union.right) union.right = obstacles[i].right;
      if (obstacles[i].top > union.top) union.top = obstacles[i].top;
      if (obstacles[i].bottom < union.bottom) union.bottom = obstacles[i].bottom;
    }
  }
  union.width = union.right - union.left;
  union.height = union.top - union.bottom;
  return union;
}

function placementScore(bounds, templateBounds, obstacles, rowIndex) {
  var packed = unionBoundsWithCandidate(bounds, obstacles);
  var score = 0;
  var touches = templateTouchFlags(bounds, templateBounds);
  if (touches.top) score += 1000000;
  if (touches.left) score += 700000;
  if (touches.bottom) score += 400000;
  if (touches.right) score += 200000;
  score += contactScoreAgainstObstacles(bounds, obstacles) * (rowIndex > 0 ? 25 : 10);
  score -= packed.height * 10000;
  score -= (packed.width * packed.height) * 2;
  score -= (templateBounds.top - bounds.top) * 100;
  score -= (bounds.left - templateBounds.left) * 5;
  return score;
}

function findFreePlacementInsideTemplate(bounds, templateBounds, obstacles) {
  try {
    if (bounds === null || templateBounds === null) return null;
    var width = bounds.right - bounds.left;
    var height = bounds.top - bounds.bottom;
    if (width <= 0 || height <= 0) return null;
    var rowTops = yPlacementCandidates(templateBounds, obstacles, height);
    var xCandidates = xPlacementCandidates(templateBounds, obstacles, width);
    var best = null;
    for (var rowIndex = 0; rowIndex < rowTops.length; rowIndex += 1) {
      var rowTop = rowTops[rowIndex];
      if (rowTop - height < templateBounds.bottom - 1.5) continue;
      for (var xIndex = 0; xIndex < xCandidates.length; xIndex += 1) {
        var x = xCandidates[xIndex];
        var placed = {
          left: x,
          right: x + width,
          top: rowTop,
          bottom: rowTop - height,
          width: width,
          height: height
        };
        if (!boundsInsideTemplate(placed, templateBounds)) continue;
        if (collidesOrTooClose(placed, obstacles)) continue;
        var score = placementScore(placed, templateBounds, obstacles, rowIndex);
        if (best === null || score > best.score) best = { dx: placed.left - bounds.left, dy: placed.top - bounds.top, placedBounds: placed, rowTop: rowTop, score: score };
      }
    }
    return best;
  } catch (error) {}
  return null;
}

function getPackingRotationAngles() {
  return [0, 90, 180, 270];
}

function pushUniqueAngle(list, value, tolerance) {
  var normalized = normalizeRotationForFit(value);
  for (var i = 0; i < list.length; i += 1) {
    if (Math.abs(normalizeRotationForFit(list[i]) - normalized) <= tolerance) return;
  }
  list.push(normalized);
}

function normalizeRotationForFit(angle) {
  var normalized = angle % 180;
  while (normalized <= -90) normalized += 180;
  while (normalized > 90) normalized -= 180;
  return normalized;
}

function deriveBorderAngles(obstaclePolygons) {
  var angles = [0, 90];
  if (!obstaclePolygons || obstaclePolygons.length === 0) return angles;
  for (var p = 0; p < obstaclePolygons.length; p += 1) {
    var edges = getLongestEdgesFromPoints(obstaclePolygons[p]);
    for (var e = 0; e < edges.length; e += 1) {
      var baseAngle = normalizeRotationForFit(edgeAngle({ a: edges[e].a, b: edges[e].b }));
      pushUniqueAngle(angles, baseAngle, 4);
      pushUniqueAngle(angles, baseAngle + 90, 4);
      pushUniqueAngle(angles, baseAngle - 90, 4);
    }
  }
  return angles;
}

function deriveTopRowAnglesFromItem(points) {
  var angles = [];
  var longestEdges = getLongestEdgesFromPoints(points);
  for (var i = 0; i < longestEdges.length; i += 1) {
    var baseAngle = edgeAngle({ a: longestEdges[i].a, b: longestEdges[i].b });
    pushUniqueAngle(angles, -baseAngle, 2);
    pushUniqueAngle(angles, 180 - baseAngle, 2);
  }
  if (angles.length === 0) {
    angles.push(0);
    angles.push(90);
  }
  return angles;
}
function firstRowEdgeBonus(rotatedEdges, templateBounds, placed, dx, dy) {
  if (!rotatedEdges || rotatedEdges.length === 0) return 0;
  if (Math.abs(templateBounds.top - placed.top) > 1.5) return 0;
  var bestRatio = 0;
  for (var i = 0; i < rotatedEdges.length; i += 1) {
    var moved = movedEdge(rotatedEdges[i], dx, dy);
    var metrics = longestEdgeTemplateMetrics(moved, templateBounds);
    if (metrics.orientation === 'horizontal') {
      if (metrics.distanceTop <= 2) bestRatio = Math.max(bestRatio, metrics.overlapTopRatio);
    }
    if (metrics.orientation === 'vertical') {
      if (metrics.distanceLeft <= 2 || metrics.distanceRight <= 2) bestRatio = Math.max(bestRatio, Math.max(metrics.overlapLeftRatio, metrics.overlapRightRatio));
    }
  }
  return bestRatio * 600000;
}

function firstRowLongestEdgeAlignmentScore(rotatedEdges, templateBounds, placed, dx, dy) {
  if (!rotatedEdges || rotatedEdges.length === 0) return 0;
  if (Math.abs(templateBounds.top - placed.top) > 1.5) return 0;
  var bestScore = -1200000;
  for (var i = 0; i < rotatedEdges.length; i += 1) {
    var moved = movedEdge(rotatedEdges[i], dx, dy);
    var metrics = longestEdgeTemplateMetrics(moved, templateBounds);
    var score = -800000;
    if (metrics.orientation === 'horizontal') {
      score = (metrics.distanceTop <= 2 ? 1200000 : -900000) + (metrics.overlapTopRatio * 900000);
    } else if (metrics.orientation === 'vertical') {
      var bestVerticalOverlap = Math.max(metrics.overlapLeftRatio, metrics.overlapRightRatio);
      var nearSide = metrics.distanceLeft <= 2 || metrics.distanceRight <= 2;
      score = (nearSide ? 700000 : -900000) + (bestVerticalOverlap * 500000);
    }
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}
function pushUniqueNumber(list, value, tolerance) {
  for (var i = 0; i < list.length; i += 1) {
    if (Math.abs(list[i] - value) <= tolerance) return;
  }
  list.push(value);
}

function gravityCandidatePoints(bounds, templateBounds, obstacles, obstaclePolygons) {
  var width = bounds.right - bounds.left;
  var height = bounds.top - bounds.bottom;
  var xCandidates = [templateBounds.left, templateBounds.right - width];
  var yCandidates = [templateBounds.top, templateBounds.bottom + height];
  var scanStep = Math.max(PACK_GAP_POINT, 28);
  if (obstacles) {
    for (var i = 0; i < obstacles.length; i += 1) {
      xCandidates.push(obstacles[i].right + PACK_GAP_POINT);
      xCandidates.push(obstacles[i].left - PACK_GAP_POINT - width);
      xCandidates.push(obstacles[i].left);
      xCandidates.push(obstacles[i].right - width);
      yCandidates.push(obstacles[i].bottom - PACK_GAP_POINT + height);
      yCandidates.push(obstacles[i].top + PACK_GAP_POINT);
      yCandidates.push(obstacles[i].top);
      yCandidates.push(obstacles[i].bottom + height);
    }
  }
  if (PACKING_MODE !== 'FAST' && obstaclePolygons) {
    for (var p = 0; p < obstaclePolygons.length; p += 1) {
      var poly = obstaclePolygons[p];
      for (var pp = 0; pp < poly.length; pp += 1) {
        var px = poly[pp][0];
        var py = poly[pp][1];
        xCandidates.push(px + PACK_GAP_POINT);
        xCandidates.push(px - PACK_GAP_POINT - width);
        xCandidates.push(px);
        xCandidates.push(px - width);
        yCandidates.push(py + PACK_GAP_POINT);
        yCandidates.push(py - PACK_GAP_POINT + height);
        yCandidates.push(py);
        yCandidates.push(py + height);
      }
    }
  }
  var maxScans = 18;
  var scanCountY = 0;
  for (var scanY = templateBounds.top; scanY - height >= templateBounds.bottom - 1.5 && scanCountY < maxScans; scanY -= scanStep, scanCountY += 1) {
    yCandidates.push(scanY);
  }
  var scanCountX = 0;
  for (var scanX = templateBounds.left; scanX + width <= templateBounds.right + 1.5 && scanCountX < maxScans; scanX += scanStep, scanCountX += 1) {
    xCandidates.push(scanX);
  }
  xCandidates = uniqueSortedCandidates(xCandidates, templateBounds.left, templateBounds.right - width);
  yCandidates = uniqueSortedCandidates(yCandidates, templateBounds.bottom + height, templateBounds.top);
  yCandidates.sort(function(a, b) { return b - a; });
  xCandidates.sort(function(a, b) { return a - b; });
  var candidates = [];
  for (var yIndex = 0; yIndex < yCandidates.length; yIndex += 1) {
    for (var xIndex = 0; xIndex < xCandidates.length; xIndex += 1) {
      candidates.push({ x: xCandidates[xIndex], top: yCandidates[yIndex], yRank: yIndex, xRank: xIndex });
      if (candidates.length >= (PACKING_MODE === 'FAST' ? MAX_FAST_CANDIDATES : 260)) return candidates;
    }
  }
  return candidates;
}

function pushCandidatePoint(list, x, top, width, height, templateBounds, rank) {
  if (x < templateBounds.left - 1.5 || x + width > templateBounds.right + 1.5) return;
  if (top > templateBounds.top + 1.5 || top - height < templateBounds.bottom - 1.5) return;
  for (var i = 0; i < list.length; i += 1) {
    if (Math.abs(list[i].x - x) <= 0.5 && Math.abs(list[i].top - top) <= 0.5) return;
  }
  list.push({ x: x, top: top, yRank: rank, xRank: rank, source: 'free-space' });
}

function addFreeSpaceCandidatePoints(candidates, rotated, rotatedBounds, templateBounds, obstacles, obstaclePolygons) {
  var width = rotatedBounds.width;
  var height = rotatedBounds.height;
  var anchorPoints = [
    [rotatedBounds.left, rotatedBounds.top],
    [rotatedBounds.right, rotatedBounds.top],
    [rotatedBounds.right, rotatedBounds.bottom],
    [rotatedBounds.left, rotatedBounds.bottom]
  ];
  for (var rp = 0; rp < rotated.length && anchorPoints.length < 80; rp += Math.max(1, Math.floor(rotated.length / 24))) {
    anchorPoints.push([rotated[rp][0], rotated[rp][1]]);
  }

  var freePoints = [
    [templateBounds.left, templateBounds.top],
    [templateBounds.right, templateBounds.top],
    [templateBounds.right, templateBounds.bottom],
    [templateBounds.left, templateBounds.bottom]
  ];
  if (obstacles) {
    for (var o = 0; o < obstacles.length; o += 1) {
      var obstacle = obstacles[o];
      freePoints.push([obstacle.right + PACK_GAP_POINT, obstacle.top]);
      freePoints.push([obstacle.right + PACK_GAP_POINT, obstacle.bottom + height]);
      freePoints.push([obstacle.left - PACK_GAP_POINT, obstacle.top]);
      freePoints.push([obstacle.left - PACK_GAP_POINT, obstacle.bottom + height]);
      freePoints.push([obstacle.left, obstacle.bottom - PACK_GAP_POINT]);
      freePoints.push([obstacle.right - width, obstacle.bottom - PACK_GAP_POINT]);
      freePoints.push([obstacle.left, obstacle.top + PACK_GAP_POINT + height]);
      freePoints.push([obstacle.right - width, obstacle.top + PACK_GAP_POINT + height]);
    }
  }
  if (obstaclePolygons) {
    for (var p = 0; p < obstaclePolygons.length; p += 1) {
      var poly = obstaclePolygons[p];
      for (var pp = 0; pp < poly.length; pp += Math.max(1, Math.floor(poly.length / 16))) {
        freePoints.push([poly[pp][0] + PACK_GAP_POINT, poly[pp][1]]);
        freePoints.push([poly[pp][0] - PACK_GAP_POINT, poly[pp][1]]);
        freePoints.push([poly[pp][0], poly[pp][1] + PACK_GAP_POINT]);
        freePoints.push([poly[pp][0], poly[pp][1] - PACK_GAP_POINT]);
      }
    }
  }

  var cap = 220;
  for (var f = 0; f < freePoints.length && candidates.length < cap; f += 1) {
    for (var a = 0; a < anchorPoints.length && candidates.length < cap; a += 1) {
      var dx = freePoints[f][0] - anchorPoints[a][0];
      var dy = freePoints[f][1] - anchorPoints[a][1];
      var movedLeft = rotatedBounds.left + dx;
      var movedTop = rotatedBounds.top + dy;
      pushCandidatePoint(candidates, movedLeft, movedTop, width, height, templateBounds, 0);
    }
  }
  return candidates;
}
function obstacleAreaSum(obstacles) {
  if (!obstacles || obstacles.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < obstacles.length; i += 1) {
    var obstacle = obstacles[i];
    sum += Math.max(0, obstacle.right - obstacle.left) * Math.max(0, obstacle.top - obstacle.bottom);
  }
  return sum;
}

function templateGapPenalty(bounds, templateBounds) {
  var topGap = Math.max(0, templateBounds.top - bounds.top);
  var leftGap = Math.max(0, bounds.left - templateBounds.left);
  var rightGap = Math.max(0, templateBounds.right - bounds.right);
  var bottomGap = Math.max(0, bounds.bottom - templateBounds.bottom);
  return (topGap * 2000) + (leftGap * 600) + (rightGap * 250) + (bottomGap * 100);
}

function borderCavityScore(bounds, obstacles) {
  if (!obstacles || obstacles.length === 0) return 0;
  var tolerance = 2.5;
  var score = 0;
  var nearLeft = 0;
  var nearRight = 0;
  var nearTop = 0;
  var nearBottom = 0;
  var nearestGap = null;
  for (var i = 0; i < obstacles.length; i += 1) {
    var obstacle = obstacles[i];
    var verticalOverlap = Math.max(0, Math.min(bounds.top, obstacle.top) - Math.max(bounds.bottom, obstacle.bottom));
    var horizontalOverlap = Math.max(0, Math.min(bounds.right, obstacle.right) - Math.max(bounds.left, obstacle.left));
    var leftGap = Math.abs(bounds.left - obstacle.right);
    var rightGap = Math.abs(obstacle.left - bounds.right);
    var topGap = Math.abs(bounds.top - obstacle.bottom);
    var bottomGap = Math.abs(obstacle.top - bounds.bottom);
    var gap = boundsGap(bounds, obstacle);
    if (nearestGap === null || gap < nearestGap) nearestGap = gap;
    if (Math.abs(leftGap - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) {
      nearLeft += 1;
      score += 35000 + (verticalOverlap * 180);
    }
    if (Math.abs(rightGap - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) {
      nearRight += 1;
      score += 35000 + (verticalOverlap * 180);
    }
    if (Math.abs(topGap - PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) {
      nearTop += 1;
      score += 35000 + (horizontalOverlap * 180);
    }
    if (Math.abs(bottomGap - PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) {
      nearBottom += 1;
      score += 35000 + (horizontalOverlap * 180);
    }
  }
  var sideCount = (nearLeft > 0 ? 1 : 0) + (nearRight > 0 ? 1 : 0) + (nearTop > 0 ? 1 : 0) + (nearBottom > 0 ? 1 : 0);
  score += sideCount * sideCount * 250000;
  if ((nearLeft > 0 && nearRight > 0) || (nearTop > 0 && nearBottom > 0)) score += 600000;
  if (nearestGap !== null) score -= Math.abs(nearestGap - PACK_GAP_POINT) * 2000;
  return score;
}

function gravityContactScore(bounds, obstacles) {
  if (!obstacles || obstacles.length === 0) return 0;
  var score = 0;
  var tolerance = 2;
  for (var i = 0; i < obstacles.length; i += 1) {
    var obstacle = obstacles[i];
    var verticalOverlap = Math.max(0, Math.min(bounds.top, obstacle.top) - Math.max(bounds.bottom, obstacle.bottom));
    var horizontalOverlap = Math.max(0, Math.min(bounds.right, obstacle.right) - Math.max(bounds.left, obstacle.left));
    if (Math.abs(bounds.left - obstacle.right - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) score += verticalOverlap * 80;
    if (Math.abs(obstacle.left - bounds.right - PACK_GAP_POINT) <= tolerance && verticalOverlap > 0) score += verticalOverlap * 70;
    if (Math.abs(bounds.top - obstacle.bottom + PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) score += horizontalOverlap * 90;
    if (Math.abs(obstacle.top - bounds.bottom - PACK_GAP_POINT) <= tolerance && horizontalOverlap > 0) score += horizontalOverlap * 40;
  }
  return score;
}

function isFirstPlacementOnSheet(obstacles) {
  return !obstacles || obstacles.length === 0;
}

function topRowOnlyCandidates(rotatedBounds, templateBounds) {
  var width = rotatedBounds.width;
  var height = rotatedBounds.height;
  var list = [];
  pushCandidatePoint(list, templateBounds.left, templateBounds.top, width, height, templateBounds, 0);
  pushCandidatePoint(list, templateBounds.right - width, templateBounds.top, width, height, templateBounds, 1);
  return list;
}
function chooseFirstPlacementByLongestTopEdge(points, center, templateBounds) {
  var longestEdges = getLongestEdgesFromPoints(points);
  if (!longestEdges || longestEdges.length === 0) return null;
  var best = null;
  for (var i = 0; i < longestEdges.length; i += 1) {
    var baseAngle = edgeAngle({ a: longestEdges[i].a, b: longestEdges[i].b });
    var angleOptions = [-baseAngle, 180 - baseAngle];
    for (var a = 0; a < angleOptions.length; a += 1) {
      var angle = normalizeRotationForFit(angleOptions[a]);
      var rotated = transformPoints(points, center, angle);
      var rotatedBounds = pointsBounds(rotated);
      if (rotatedBounds === null) continue;
      if (rotatedBounds.width > (templateBounds.right - templateBounds.left) + 1.5) continue;
      if (rotatedBounds.height > (templateBounds.top - templateBounds.bottom) + 1.5) continue;
      var rotatedEdges = getLongestEdgesFromPoints(rotated);
      for (var e = 0; e < rotatedEdges.length; e += 1) {
        var edge = rotatedEdges[e];
        var edgeBox = edgeBounds(edge);
        var candidatePositions = [
          { dx: templateBounds.left - rotatedBounds.left, dy: templateBounds.top - edgeBox.top },
          { dx: templateBounds.right - rotatedBounds.right, dy: templateBounds.top - edgeBox.top }
        ];
        for (var c = 0; c < candidatePositions.length; c += 1) {
          var dx = candidatePositions[c].dx;
          var dy = candidatePositions[c].dy;
          var placedBounds = movedBounds(rotatedBounds, dx, dy);
          if (!boundsInsideTemplate(placedBounds, templateBounds)) continue;
          var moved = movedEdge(edge, dx, dy);
          var metrics = longestEdgeTemplateMetrics(moved, templateBounds);
          if (metrics.orientation !== 'horizontal') continue;
          if (metrics.distanceTop > 2) continue;
          var leftGap = placedBounds.left - templateBounds.left;
          var rightGap = templateBounds.right - placedBounds.right;
          var score = (metrics.overlapTopRatio * 1000000) - (leftGap * 100) - (rightGap * 40);
          if (best === null || score > best.score) {
            best = { angle: angle, dx: dx, dy: dy, placedBounds: placedBounds, score: score };
          }
        }
      }
    }
  }
  if (best !== null) return best;
  var fallbackPlacement = null;
  for (var i = 0; i < longestEdges.length; i += 1) {
    var baseAngle = edgeAngle({ a: longestEdges[i].a, b: longestEdges[i].b });
    var fallbackAngles = [-baseAngle, 180 - baseAngle];
    for (var f = 0; f < fallbackAngles.length; f += 1) {
      var angle = normalizeRotationForFit(fallbackAngles[f]);
      var rotated = transformPoints(points, center, angle);
      var rotatedBounds = pointsBounds(rotated);
      if (rotatedBounds === null) continue;
      if (rotatedBounds.width > (templateBounds.right - templateBounds.left) + 1.5) continue;
      if (rotatedBounds.height > (templateBounds.top - templateBounds.bottom) + 1.5) continue;
      var dxLeft = templateBounds.left - rotatedBounds.left;
      var dyTop = templateBounds.top - rotatedBounds.top;
      var placedLeftTop = movedBounds(rotatedBounds, dxLeft, dyTop);
      if (boundsInsideTemplate(placedLeftTop, templateBounds)) {
        fallbackPlacement = { angle: angle, dx: dxLeft, dy: dyTop, placedBounds: placedLeftTop, score: 1 };
        return fallbackPlacement;
      }
    }
  }
  return null;
}

function freeRectsOverlap(a, b) {
  var aRight = a.x + a.w;
  var aBottom = a.y - a.h;
  var bRight = b.x + b.w;
  var bBottom = b.y - b.h;
  return a.x < bRight - 0.01 && aRight > b.x + 0.01 && a.y > bBottom + 0.01 && aBottom < b.y - 0.01;
}

function splitFreeRect(freeRect, usedRect, output) {
  if (!freeRectsOverlap(freeRect, usedRect)) {
    output.push(freeRect);
    return;
  }

  var freeLeft = freeRect.x;
  var freeRight = freeRect.x + freeRect.w;
  var freeTop = freeRect.y;
  var freeBottom = freeRect.y - freeRect.h;
  var usedLeft = usedRect.x;
  var usedRight = usedRect.x + usedRect.w;
  var usedTop = usedRect.y;
  var usedBottom = usedRect.y - usedRect.h;

  if (usedTop < freeTop && usedTop > freeBottom) output.push({ x: freeLeft, y: freeTop, w: freeRect.w, h: freeTop - usedTop });
  if (usedBottom > freeBottom && usedBottom < freeTop) output.push({ x: freeLeft, y: usedBottom, w: freeRect.w, h: usedBottom - freeBottom });
  if (usedLeft > freeLeft && usedLeft < freeRight) output.push({ x: freeLeft, y: freeTop, w: usedLeft - freeLeft, h: freeRect.h });
  if (usedRight < freeRight && usedRight > freeLeft) output.push({ x: usedRight, y: freeTop, w: freeRight - usedRight, h: freeRect.h });
}

function freeRectContains(outer, inner) {
  return outer.x <= inner.x + 0.01 && outer.y >= inner.y - 0.01 &&
    outer.x + outer.w >= inner.x + inner.w - 0.01 && outer.y - outer.h <= inner.y - inner.h + 0.01;
}

function prunePackingFreeRects(freeRects) {
  var pruned = [];
  for (var i = 0; i < freeRects.length; i += 1) {
    var rect = freeRects[i];
    if (rect.w <= 0.5 || rect.h <= 0.5) continue;
    var contained = false;
    for (var j = 0; j < freeRects.length; j += 1) {
      if (i === j) continue;
      if (freeRectContains(freeRects[j], rect)) {
        contained = true;
        break;
      }
    }
    if (!contained) pruned.push(rect);
  }
  pruned.sort(function(a, b) {
    if (Math.abs(a.y - b.y) > PACK_ROW_TOLERANCE_POINT) return b.y - a.y;
    if (Math.abs(a.x - b.x) > 0.01) return a.x - b.x;
    return (a.w * a.h) - (b.w * b.h);
  });
  return pruned;
}

function stickerStyleFreeRects(templateBounds, obstacles) {
  var freeRects = [{
    x: templateBounds.left,
    y: templateBounds.top,
    w: templateBounds.right - templateBounds.left,
    h: templateBounds.top - templateBounds.bottom
  }];
  if (!obstacles || obstacles.length === 0) return freeRects;

  for (var i = 0; i < obstacles.length; i += 1) {
    var obstacle = obstacles[i];
    var usedLeft = Math.max(templateBounds.left, obstacle.left - PACK_GAP_POINT);
    var usedRight = Math.min(templateBounds.right, obstacle.right + PACK_GAP_POINT);
    var usedTop = Math.min(templateBounds.top, obstacle.top + PACK_GAP_POINT);
    var usedBottom = Math.max(templateBounds.bottom, obstacle.bottom - PACK_GAP_POINT);
    if (usedRight - usedLeft <= 0.5 || usedTop - usedBottom <= 0.5) continue;

    var usedRect = { x: usedLeft, y: usedTop, w: usedRight - usedLeft, h: usedTop - usedBottom };
    var nextFreeRects = [];
    for (var f = 0; f < freeRects.length; f += 1) splitFreeRect(freeRects[f], usedRect, nextFreeRects);
    freeRects = prunePackingFreeRects(nextFreeRects);
  }
  return freeRects;
}

function chooseBestPlacementForItem(outline, templateBounds, obstacles, obstaclePolygons, obstacleCollisionIndex) {
  var points = outlineAnchorPoints(outline);
  if (!points || points.length < 2) return null;
  var originalBounds = pointsBounds(points);
  var center = { x: (originalBounds.left + originalBounds.right) / 2, y: (originalBounds.top + originalBounds.bottom) / 2 };
  var firstPlacement = isFirstPlacementOnSheet(obstacles);
  if (firstPlacement) return chooseFirstPlacementByLongestTopEdge(points, center, templateBounds);

  var templateWidth = templateBounds.right - templateBounds.left;
  var templateHeight = templateBounds.top - templateBounds.bottom;
  var angles = [0, 90];
  var rotatedOptions = [];
  for (var a = 0; a < angles.length; a += 1) {
    var rotated = transformPoints(points, center, angles[a]);
    var rotatedBounds = pointsBounds(rotated);
    if (rotatedBounds === null) continue;
    if (rotatedBounds.width > templateWidth + 1.5 || rotatedBounds.height > templateHeight + 1.5) continue;
    rotatedOptions.push({ angle: angles[a], bounds: rotatedBounds });
  }
  if (rotatedOptions.length === 0) return null;

  var freeRects = stickerStyleFreeRects(templateBounds, obstacles);
  for (var r = 0; r < freeRects.length; r += 1) {
    var freeRect = freeRects[r];
    for (var o = 0; o < rotatedOptions.length; o += 1) {
      var option = rotatedOptions[o];
      var rotatedBounds = option.bounds;
      if (rotatedBounds.width > freeRect.w + 1.5 || rotatedBounds.height > freeRect.h + 1.5) continue;

      var placed = {
        left: freeRect.x,
        right: freeRect.x + rotatedBounds.width,
        top: freeRect.y,
        bottom: freeRect.y - rotatedBounds.height,
        width: rotatedBounds.width,
        height: rotatedBounds.height
      };
      if (!boundsInsideTemplate(placed, templateBounds)) continue;
      if (collidesOrTooClose(placed, obstacles)) continue;

      var dx = placed.left - rotatedBounds.left;
      var dy = placed.top - rotatedBounds.top;
      return { angle: option.angle, dx: dx, dy: dy, placedBounds: placed, score: -r };
    }
  }

  return findFreePlacementInsideTemplate(originalBounds, templateBounds, obstacles);
}

function chooseDeltaForEdgeOnTemplate(edge, outlineBounds, templateBounds) {
  var edgeBox = edgeBounds(edge);
  var candidates = [
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.top - edgeBox.top, side: 'left-top' },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.bottom - edgeBox.bottom, side: 'left-bottom' },
    { dx: templateBounds.left - outlineBounds.left, dy: templateBounds.top - edgeBox.top, side: 'bounds-left-edge-top' },
    { dx: templateBounds.left - outlineBounds.left, dy: templateBounds.bottom - edgeBox.bottom, side: 'bounds-left-edge-bottom' },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.top - outlineBounds.top, side: 'edge-left-bounds-top' },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.bottom - outlineBounds.bottom, side: 'edge-left-bounds-bottom' },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.top - edgeBox.top, side: 'right-top' },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.bottom - edgeBox.bottom, side: 'right-bottom' }
  ];
  var fallback = deltaToPlaceBoundsInsideTemplate(outlineBounds, templateBounds);
  var best = { dx: fallback.dx, dy: fallback.dy, score: -1, side: 'fallback-inside' };
  for (var i = 0; i < candidates.length; i += 1) {
    var moved = movedBounds(outlineBounds, candidates[i].dx, candidates[i].dy);
    var inside = boundsInsideTemplate(moved, templateBounds);
    if (!inside) continue;
    var touch = countTemplateTouches(moved, templateBounds);
    var edgeMoved = movedBounds(edgeBox, candidates[i].dx, candidates[i].dy);
    var edgeTouch = countTemplateTouches(edgeMoved, templateBounds);
    var leftBonus = Math.abs(edgeMoved.left - templateBounds.left) <= 1.5 ? 100 : 0;
    var rightPenalty = Math.abs(edgeMoved.right - templateBounds.right) <= 1.5 ? 0 : 0;
    var score = leftBonus + (edgeTouch * 10) + touch - rightPenalty;
    if (score > best.score) best = { dx: candidates[i].dx, dy: candidates[i].dy, score: score, side: candidates[i].side };
  }
  return best;
}

function outlineAnchorPoints(outline) {
  var points = [];
  try {
    for (var i = 0; i < outline.pathPoints.length; i += 1) {
      points.push([outline.pathPoints[i].anchor[0], outline.pathPoints[i].anchor[1]]);
    }
  } catch (error) {}
  return points;
}

function transformPoints(points, center, angleDegrees) {
  var radians = angleDegrees * Math.PI / 180;
  var cosValue = Math.cos(radians);
  var sinValue = Math.sin(radians);
  var result = [];
  for (var i = 0; i < points.length; i += 1) {
    var x = points[i][0] - center.x;
    var y = points[i][1] - center.y;
    result.push([
      center.x + (x * cosValue) - (y * sinValue),
      center.y + (x * sinValue) + (y * cosValue)
    ]);
  }
  return result;
}
function pointsBounds(points) {
  if (!points || points.length === 0) return null;
  var left = points[0][0];
  var right = points[0][0];
  var top = points[0][1];
  var bottom = points[0][1];
  for (var i = 1; i < points.length; i += 1) {
    if (points[i][0] < left) left = points[i][0];
    if (points[i][0] > right) right = points[i][0];
    if (points[i][1] > top) top = points[i][1];
    if (points[i][1] < bottom) bottom = points[i][1];
  }
  return { left: left, right: right, top: top, bottom: bottom, width: right - left, height: top - bottom };
}
function chooseFreeRotationForTemplate(outline, templateBounds) {
  var points = outlineAnchorPoints(outline);
  if (points.length < 2) return { angle: 0, bounds: boundsOf(outline), score: -999999 };
  var originalEdges = getLongestOutlineEdges(outline);
  var originalEdgeAngle = originalEdges.length > 0 ? edgeAngle(originalEdges[0]) : 0;
  var originalBounds = pointsBounds(points);
  var center = { x: (originalBounds.left + originalBounds.right) / 2, y: (originalBounds.top + originalBounds.bottom) / 2 };
  var templateWidth = templateBounds.right - templateBounds.left;
  var templateHeight = templateBounds.top - templateBounds.bottom;
  var best = { angle: 0, bounds: originalBounds, score: -999999, preferredSide: 'top-left' };
  for (var angle = 0; angle < 360; angle += 1) {
    var rotated = transformPoints(points, center, angle);
    var bounds = pointsBounds(rotated);
    var fits = bounds.width <= templateWidth + 1.5 && bounds.height <= templateHeight + 1.5;
    if (!fits) continue;
    var rotatedEdges = getLongestEdgesFromPoints(rotated);
    var placements = [
      { side: 'top-left', dx: templateBounds.left - bounds.left, dy: templateBounds.top - bounds.top, priority: 18000 },
      { side: 'top-right', dx: templateBounds.right - bounds.right, dy: templateBounds.top - bounds.top, priority: 17000 },
      { side: 'bottom-left', dx: templateBounds.left - bounds.left, dy: templateBounds.bottom - bounds.bottom, priority: 11000 },
      { side: 'bottom-right', dx: templateBounds.right - bounds.right, dy: templateBounds.bottom - bounds.bottom, priority: 10000 },
      { side: 'left-top', dx: templateBounds.left - bounds.left, dy: templateBounds.top - bounds.top, priority: 7000 },
      { side: 'left-bottom', dx: templateBounds.left - bounds.left, dy: templateBounds.bottom - bounds.bottom, priority: 6500 },
      { side: 'right-top', dx: templateBounds.right - bounds.right, dy: templateBounds.top - bounds.top, priority: 3500 },
      { side: 'right-bottom', dx: templateBounds.right - bounds.right, dy: templateBounds.bottom - bounds.bottom, priority: 3000 }
    ];
    for (var p = 0; p < placements.length; p += 1) {
      var placedBounds = movedBounds(bounds, placements[p].dx, placements[p].dy);
      if (!boundsInsideTemplate(placedBounds, templateBounds)) continue;
      var touchFlags = templateTouchFlags(placedBounds, templateBounds);
      var touchCount = countTemplateTouches(placedBounds, templateBounds);
      var edgeScore = -999999;
      for (var e = 0; e < rotatedEdges.length; e += 1) {
        edgeScore = Math.max(edgeScore, edgeTemplateContactScore(movedEdge(rotatedEdges[e], placements[p].dx, placements[p].dy), templateBounds));
      }
      var centerPenalty = Math.abs(placedBounds.left - templateBounds.left) + Math.abs(templateBounds.top - placedBounds.top);
      var score = placements[p].priority + edgeScore + (touchCount * 500);
      if (touchFlags.top) score += 10000;
      if (touchFlags.left) score += 5000;
      if (touchFlags.bottom) score += 3000;
      if (touchFlags.right) score += 1500;
      score -= centerPenalty;
      if (score > best.score) best = { angle: angle, bounds: bounds, score: score, preferredSide: placements[p].side };
    }
  }
  best.originalEdgeAngle = originalEdgeAngle;
  return best;
}

function chooseRotationByTemplateEdgeRule(outline, templateBounds) {
  var edges = getLongestOutlineEdges(outline);
  if (edges.length === 0) return 0;
  var best = { angle: 0, score: -999999 };
  var baseBounds = boundsOf(outline);
  var centerX = (baseBounds.left + baseBounds.right) / 2;
  var centerY = (baseBounds.top + baseBounds.bottom) / 2;
  for (var angle = 0; angle < 360; angle += 90) {
    var clone = outline.duplicate();
    try { clone.rotate(angle, true, true, true, true, Transformation.CENTER); } catch (error) {}
    var rotatedBounds = boundsOf(clone);
    var edge = getLongestOutlineEdges(clone);
    var score = 0;
    if (edge.length > 0) {
      var longest = edge[0];
      var edgeBox = edgeBounds(longest);
      var touchTopBottom = Math.abs(rotatedBounds.top - templateBounds.top) <= 1.5 || Math.abs(rotatedBounds.bottom - templateBounds.bottom) <= 1.5;
      var touchLeftRight = Math.abs(rotatedBounds.left - templateBounds.left) <= 1.5 || Math.abs(rotatedBounds.right - templateBounds.right) <= 1.5;
      var angleNow = Math.abs(normalizeAngle(edgeAngle(longest)));
      var nearHorizontal = Math.min(Math.abs(angleNow), Math.abs(180 - angleNow)) <= 10;
      var nearVertical = Math.abs(90 - angleNow) <= 10;
      var touchTop = Math.abs(rotatedBounds.top - templateBounds.top) <= 1.5;
      var touchBottom = Math.abs(rotatedBounds.bottom - templateBounds.bottom) <= 1.5;
      var touchLeft = Math.abs(rotatedBounds.left - templateBounds.left) <= 1.5;
      var touchRight = Math.abs(rotatedBounds.right - templateBounds.right) <= 1.5;
      if ((touchTop || touchBottom) && nearHorizontal) score += 6000;
      if ((touchTop || touchBottom) && !nearHorizontal) score -= 2500;
      if (touchLeft && nearVertical) score += 1800;
      if (touchRight && nearVertical) score += 1200;
      if ((touchLeft || touchRight) && !nearVertical) score -= 800;
      score += Math.max(rotatedBounds.width, rotatedBounds.height);
    }
    try { clone.remove(); } catch (error) {}
    if (score > best.score) best = { angle: angle, score: score };
  }
  return best.angle;
}

function alignByLongestEdgeToTemplate(outline, templateBounds, obstacles) {
  var edges = getLongestOutlineEdges(outline);
  if (edges.length === 0) return null;
  var longestEdge = edges[0];
  var edgeBox = edgeBounds(longestEdge);
  var outlineBounds = boundsOf(outline);
  var angle = Math.abs(normalizeAngle(edgeAngle(longestEdge)));
  var nearHorizontal = Math.min(Math.abs(angle), Math.abs(180 - angle)) <= 10;
  var nearVertical = Math.abs(90 - angle) <= 10;
  var candidates = [
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.top - edgeBox.top, side: 'top-left', sidePriority: 13000 },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.bottom - edgeBox.bottom, side: 'bottom-left', sidePriority: 12500 },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.top - edgeBox.top, side: 'top-right', sidePriority: 8000 },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.bottom - edgeBox.bottom, side: 'bottom-right', sidePriority: 7800 },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.top - outlineBounds.top, side: 'left-top', sidePriority: 15000 },
    { dx: templateBounds.left - edgeBox.left, dy: templateBounds.bottom - outlineBounds.bottom, side: 'left-bottom', sidePriority: 14800 },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.top - outlineBounds.top, side: 'right-top', sidePriority: 2000 },
    { dx: templateBounds.right - edgeBox.right, dy: templateBounds.bottom - outlineBounds.bottom, side: 'right-bottom', sidePriority: 1800 }
  ];
  var best = null;
  for (var i = 0; i < candidates.length; i += 1) {
    var movedOutline = movedBounds(outlineBounds, candidates[i].dx, candidates[i].dy);
    if (!boundsInsideTemplate(movedOutline, templateBounds)) continue;
    if (obstacles && collidesOrTooClose(movedOutline, obstacles)) continue;
    var touchFlags = templateTouchFlags(movedOutline, templateBounds);
    var touch = countTemplateTouches(movedOutline, templateBounds);
    var orientationScore = 0;
    if ((touchFlags.top || touchFlags.bottom) && nearHorizontal) orientationScore += 9000;
    if ((touchFlags.left || touchFlags.right) && nearVertical) orientationScore += 5000;
    if ((touchFlags.top || touchFlags.bottom) && !nearHorizontal) orientationScore -= 3000;
    if ((touchFlags.left || touchFlags.right) && !nearVertical) orientationScore -= 1500;
    var orderScore = 0;
    if (touchFlags.top) orderScore += 12000;
    else if (touchFlags.bottom) orderScore += 8000;
    else if (touchFlags.left) orderScore += 4000;
    else if (touchFlags.right) orderScore += 2000;
    if (touchFlags.left) orderScore += 300;
    var score = orderScore + candidates[i].sidePriority + orientationScore + (touch * 500);
    if (best === null || score > best.score) best = { dx: candidates[i].dx, dy: candidates[i].dy, score: score };
  }
  if (best !== null) return best;
  return null;
}
function verifyLongestEdgeAgainstTemplate(parentLayer, documentRef) {
  var packArea = findPackAreaBounds(documentRef);
  var templateBounds = { left: packArea.left, top: packArea.top, right: packArea.right, bottom: packArea.bottom };
  var outline = findNamedPageItem(parentLayer, lazerOutlineName());
  if (outline === null) return 'Longest edge verify: false\nReason: missing ' + lazerOutlineName();
  var edges = getLongestOutlineEdges(outline);
  if (edges.length === 0) return 'Longest edge verify: false\nReason: no edge found';
  var outlineBounds = boundsOf(outline);
  var inside = boundsInsideTemplate(outlineBounds, templateBounds);
  var touch = countTemplateTouches(outlineBounds, templateBounds);
  var ok = touch >= 2 && inside;
  return [
    'Longest edge verify: ' + (ok ? 'true' : 'false'),
    'Inside Template: ' + inside,
    'Template touches: ' + touch,
    'Outline: ' + lazerOutlineName()
  ].join('\n');
}

function rotateItemsAroundUnion(items, angle) {
  if (Math.abs(angle) < 0.01) return;
  var union = unionVisibleBounds(items);
  if (union === null) return;
  var centerX = (union.left + union.right) / 2;
  var centerY = (union.top + union.bottom) / 2;
  for (var i = 0; i < items.length; i += 1) {
    try { items[i].rotate(angle, true, true, true, true, Transformation.CENTER); } catch (error) {}
  }
  var after = unionVisibleBounds(items);
  if (after === null) return;
  var afterCenterX = (after.left + after.right) / 2;
  var afterCenterY = (after.top + after.bottom) / 2;
  for (var j = 0; j < items.length; j += 1) {
    try { items[j].translate(centerX - afterCenterX, centerY - afterCenterY); } catch (error) {}
  }
}

function drawLongestEdgesDebug(documentRef, outline) {
  var debugLayer = ensureLayer(documentRef, longestEdgesLayerName());
  removeNamedPageItems(debugLayer, longestEdgesLayerName());
  var edges = getLongestOutlineEdges(outline);
  for (var i = 0; i < edges.length; i += 1) {
    try {
      var edge = edges[i];
      var line = debugLayer.pathItems.add();
      line.name = longestEdgesLayerName();
      line.stroked = true;
      line.strokeWidth = 1;
      line.strokeColor = red();
      line.filled = false;
      line.setEntirePath([[edge.a[0], edge.a[1]], [edge.b[0], edge.b[1]]]);
      line.closed = false;
      unlockAndShow(line);
    } catch (error) {}
  }
  return edges;
}

function uniquePolygonPlacementCandidates(candidates) {
  var unique = [];
  var seen = {};
  for (var i = 0; i < candidates.length; i += 1) {
    var candidate = candidates[i];
    var key = Math.round(candidate.dx * 4) + ':' + Math.round(candidate.dy * 4);
    if (seen[key]) continue;
    seen[key] = true;
    unique.push(candidate);
  }
  return unique;
}

function chooseBestPlacementPolygonFallback(outline, templateBounds, obstaclePolygons, obstacleCollisionIndex) {
  var points = outlineAnchorPoints(outline);
  if (!points || points.length < 2) return null;
  var originalBounds = pointsBounds(points);
  var center = { x: (originalBounds.left + originalBounds.right) / 2, y: (originalBounds.top + originalBounds.bottom) / 2 };
  var angles = [0, 90, 180, 270, 15, 345];
  var best = null;
  for (var a = 0; a < angles.length; a += 1) {
    var angle = angles[a];
    var rotated = transformPoints(points, center, angle);
    var rotatedBounds = pointsBounds(rotated);
    if (!rotatedBounds) continue;
    if (rotatedBounds.width > (templateBounds.right - templateBounds.left) + 1.5) continue;
    if (rotatedBounds.height > (templateBounds.top - templateBounds.bottom) + 1.5) continue;
    var candidates = [
      { dx: templateBounds.left - rotatedBounds.left, dy: templateBounds.top - rotatedBounds.top, rank: 0 },
      { dx: templateBounds.right - rotatedBounds.right, dy: templateBounds.top - rotatedBounds.top, rank: 1 },
      { dx: templateBounds.left - rotatedBounds.left, dy: templateBounds.bottom - rotatedBounds.bottom, rank: 2 }
    ];
    if (obstaclePolygons) {
      for (var p = 0; p < obstaclePolygons.length && candidates.length < 120; p += 1) {
        var poly = obstaclePolygons[p];
        for (var i = 0; i < poly.length && candidates.length < 120; i += 1) {
          candidates.push({ dx: poly[i][0] - rotatedBounds.left, dy: poly[i][1] - rotatedBounds.top, rank: 3 });
          candidates.push({ dx: poly[i][0] + PACK_GAP_POINT - rotatedBounds.left, dy: poly[i][1] - rotatedBounds.top, rank: 4 });
        }
      }
    }
    candidates = uniquePolygonPlacementCandidates(candidates);
    for (var c = 0; c < candidates.length; c += 1) {
      var placedBounds = movedBounds(rotatedBounds, candidates[c].dx, candidates[c].dy);
      if (!boundsInsideTemplate(placedBounds, templateBounds)) continue;
      var placedPolygon = expandPolygon(translatePolygon(rotated, candidates[c].dx, candidates[c].dy), PACK_GAP_POINT / 2);
      var placedPolygonBounds = polygonBounds(placedPolygon);
      if (polygonIntersectsCollisionIndex(placedPolygon, placedPolygonBounds, obstacleCollisionIndex)) continue;
      var score = (candidates[c].rank * -10000) - ((templateBounds.top - placedBounds.top) * 100);
      if (best === null || score > best.score) best = { angle: angle, dx: candidates[c].dx, dy: candidates[c].dy, placedBounds: placedBounds, score: score };
    }
  }
  return best;
}
function resetPackContext(documentRef) {
  var borderLayer = null;
  try { borderLayer = ensureLayer(documentRef, 'BORDER'); } catch (error) { borderLayer = null; }
  var borderObstacles = borderLayer !== null ? collectVisibleBounds(borderLayer) : [];
  var borderPolygons = borderLayer !== null ? collectBorderPolygons(borderLayer, []) : [];
  var packArea = findPackAreaBounds(documentRef);
  CODEX_PACK_CONTEXT = {
    borderLayer: borderLayer,
    borderObstacles: borderObstacles,
    borderPolygons: borderPolygons,
    borderCollisionIndex: buildPolygonCollisionIndex(borderPolygons),
    packArea: packArea,
    templateBounds: { left: packArea.left, top: packArea.top, right: packArea.right, bottom: packArea.bottom }
  };
  return CODEX_PACK_CONTEXT;
}

function getPackContext(documentRef) {
  if (typeof CODEX_PACK_CONTEXT !== 'undefined' && CODEX_PACK_CONTEXT) return CODEX_PACK_CONTEXT;
  return resetPackContext(documentRef);
}

function addCurrentBorderToPackContext(documentRef) {
  try {
    var context = getPackContext(documentRef);
    var borderLayer = ensureLayer(documentRef, 'BORDER');
    var outline = findNamedPageItem(borderLayer, lazerOutlineName());
    if (outline === null) return;
    var bounds = boundsOf(outline);
    if (bounds !== null) context.borderObstacles.push(bounds);
    var points = pathPointsToPolygon(outline);
    if (points && points.length >= 3) {
      context.borderPolygons.push(points);
      var entryBounds = polygonBounds(points);
      if (entryBounds !== null) context.borderCollisionIndex.push({ points: points, bounds: entryBounds, segments: polygonSegments(points) });
    }
  } catch (error) {}
}


function packImagesOnSheet(parentLayer, documentRef) {
  var lazerOutlineBeforeGroup = findNamedPageItem(parentLayer, lazerOutlineName());
  if (DEBUG_LAZER_STEPS_ENABLED && lazerOutlineBeforeGroup !== null) drawLongestEdgesDebug(documentRef, lazerOutlineBeforeGroup);

  var wholeImagesGroup = groupContainerItems(parentLayer, 'TEMP_PACK_GROUP_IMAGES', false);
  if (wholeImagesGroup === null) return;

  var packContext = getPackContext(documentRef);
  var borderObstacles = packContext.borderObstacles;
  var borderPolygons = packContext.borderPolygons;
  var borderCollisionIndex = packContext.borderCollisionIndex;
  var packArea = packContext.packArea;
  var templateBounds = packContext.templateBounds;
  var lazerOutline = findNamedPageItem(parentLayer, lazerOutlineName());
  if (lazerOutline === null) return;

  var bestPlacement = chooseBestPlacementForItem(lazerOutline, templateBounds, borderObstacles, borderPolygons, borderCollisionIndex);
  if (bestPlacement === null && borderPolygons.length > 0) bestPlacement = chooseBestPlacementPolygonFallback(lazerOutline, templateBounds, borderPolygons, borderCollisionIndex);
  if (bestPlacement === null) {
    try { wholeImagesGroup.remove(); } catch (error) {}
    if (!(typeof CODEX_BATCH_ITEMS !== 'undefined' && CODEX_BATCH_ITEMS && CODEX_BATCH_ITEMS.length)) {
      writeRunResult(false, false, 'NO_FIT_CURRENT_SHEET');
    }
    throw new Error('NO_FIT_CURRENT_SHEET');
  } else {
    rotateItemsAroundUnion([wholeImagesGroup], bestPlacement.angle);
    // Illustrator rotates the full group around the group center, while the
    // candidate was calculated around the outline center. Anchor the real
    // post-rotation outline bounds to the validated target bounds.
    lazerOutline = findNamedPageItem(parentLayer, lazerOutlineName());
    if (lazerOutline === null) {
      try { wholeImagesGroup.remove(); } catch (error) {}
      writeRunResult(false, false, 'NO_LAZER_OUTLINE_AFTER_ROTATE');
      throw new Error('NO_LAZER_OUTLINE_AFTER_ROTATE');
    }
    var actualRotatedBounds = boundsOf(lazerOutline);
    var placementDx = bestPlacement.placedBounds.left - actualRotatedBounds.left;
    var placementDy = bestPlacement.placedBounds.top - actualRotatedBounds.top;
    try { wholeImagesGroup.translate(placementDx, placementDy); } catch (error) {}
    addReport(['PACK per-item BORDER used', 'Angle: ' + bestPlacement.angle, 'Score: ' + Math.round(bestPlacement.score)].join('\n'));
  }

  lazerOutline = findNamedPageItem(parentLayer, lazerOutlineName());
  // FAST candidates are already ordered top-to-bottom/left-to-right. Repeated
  // one-point Illustrator translations are slow and cannot improve safety.
  if (lazerOutline !== null && PACKING_MODE !== 'FAST') pushPackedGroup(wholeImagesGroup, lazerOutline, templateBounds, borderObstacles);

  lazerOutline = findNamedPageItem(parentLayer, lazerOutlineName());
  var finalAnchorBounds = lazerOutline !== null ? boundsOf(lazerOutline) : boundsOf(wholeImagesGroup);
  var nearestGap = nearestGapToObstacles(finalAnchorBounds, borderObstacles);

  addReport([
    'PACK DONE',
    'Area: ' + packArea.source,
    'BORDER obstacles: ' + borderObstacles.length,
    'Nearest BORDER gap cm: ' + (nearestGap === null ? 'N/A' : (Math.round((nearestGap / CM_TO_POINT) * 100) / 100)),
    'Mode: per-item BORDER placement'
  ].join('\n'));

  // Keep TEMP_PACK_GROUP_IMAGES grouped after arranging. Ungroup later only when requested.
}
function groupCaseLayer(documentRef, caseLayer) {
  var items = [];
  for (var i = 0; i < caseLayer.pageItems.length; i += 1) {
    try {
      unlockAndShow(caseLayer.pageItems[i]);
      items.push(caseLayer.pageItems[i]);
    } catch (error) {}
  }
  if (items.length <= 1) return items.length === 1 ? items[0] : null;
  documentRef.selection = null;
  for (var j = 0; j < items.length; j += 1) {
    try { items[j].selected = true; } catch (error) {}
  }
  try { app.executeMenuCommand('group'); } catch (error) {}
  var group = null;
  if (documentRef.selection !== null && documentRef.selection.length > 0) {
    try { group = documentRef.selection[0]; } catch (error) {}
  }
  if (group !== null) {
    try { group.name = 'TEMP_ALIGN_GROUP_' + caseLayer.name; } catch (error) {}
  }
  return group;
}

function selectAllImagesItems(documentRef, parentLayer) {
  var items = [];
  documentRef.selection = null;
  for (var i = 0; i < parentLayer.layers.length; i += 1) {
    var caseLayer = parentLayer.layers[i];
    if (isCaseLayerName(caseLayer.name, 'lazer')) {
      var grouped = groupCaseLayer(documentRef, caseLayer);
      if (grouped !== null) items.push(grouped);
      continue;
    }
    for (var j = 0; j < caseLayer.pageItems.length; j += 1) {
      try {
        unlockAndShow(caseLayer.pageItems[j]);
        items.push(caseLayer.pageItems[j]);
      } catch (error) {}
    }
  }
  documentRef.selection = null;
  for (var k = 0; k < items.length; k += 1) {
    try { items[k].selected = true; } catch (error) {}
  }
  return items;
}

function ungroupTempAlignGroup(container, groupName) {
  for (var i = container.groupItems.length - 1; i >= 0; i -= 1) {
    try {
      var group = container.groupItems[i];
      if (group.name !== groupName) {
        ungroupTempAlignGroup(group, groupName);
        continue;
      }
      unlockAndShow(group);
      while (group.pageItems.length > 0) {
        try { group.pageItems[0].move(container, ElementPlacement.PLACEATEND); } catch (error) { break; }
      }
      group.remove();
    } catch (error) {}
  }
}

function ungroupLazer(documentRef, parentLayer) {
  for (var i = 0; i < parentLayer.layers.length; i += 1) {
    var caseLayer = parentLayer.layers[i];
    if (!isCaseLayerName(caseLayer.name, 'lazer')) continue;
    ungroupTempAlignGroup(caseLayer, 'TEMP_ALIGN_GROUP_lazer');
  }
  documentRef.selection = null;
}

function moveCaseBundle(parentLayer, label, dx, dy) {
  var caseGroup = findNamedPageItem(parentLayer, caseLayerName(label));
  var debugItem = findDebugBounds(parentLayer, label);
  try { if (caseGroup !== null) caseGroup.translate(dx, dy); } catch (error) {}
  try { if (debugItem !== null) debugItem.translate(dx, dy); } catch (error) {}
}

function alignLazerBeforeScale(documentRef, parentLayer) {
  var lazerClip = findNamedPageItem(parentLayer, caseLayerName('lazer'));
  var lazerDebug = findNamedPageItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_lazer');
  if (lazerClip === null || lazerDebug === null) return;
  unlockAndShow(parentLayer);
  unlockAndShow(lazerClip);
  unlockAndShow(lazerDebug);
  documentRef.selection = null;
  try { lazerClip.selected = true; } catch (error) {}
  try { lazerDebug.selected = true; } catch (error) {}
  try { app.executeMenuCommand('group'); } catch (error) {}
  var tempGroup = null;
  if (documentRef.selection !== null && documentRef.selection.length > 0) {
    try { tempGroup = documentRef.selection[0]; } catch (error) {}
  }
  if (tempGroup === null) return;
  try { tempGroup.name = 'TEMP_ALIGN_GROUP_lazer'; } catch (error) {}
  unlockAndShow(tempGroup);
  documentRef.selection = null;
  var selectableItems = [];
  collectSelectablePageItems(parentLayer, selectableItems, false);
  for (var i = 0; i < selectableItems.length; i += 1) {
    try { selectableItems[i].selected = true; } catch (error) {}
  }
  try { app.executeMenuCommand('Horizontal Align Center'); } catch (error) {}
  try { app.redraw(); } catch (error) {}
  documentRef.selection = null;
  selectableItems = [];
  collectSelectablePageItems(parentLayer, selectableItems, false);
  for (var j = 0; j < selectableItems.length; j += 1) {
    try { selectableItems[j].selected = true; } catch (error) {}
  }
  try { app.executeMenuCommand('Vertical Align Center'); } catch (error) {}
  try { app.redraw(); } catch (error) {}
  ungroupTempAlignGroup(parentLayer, 'TEMP_ALIGN_GROUP_lazer');
}

function green() {
  var color = new RGBColor(); color.red = 0; color.green = 180; color.blue = 80; return color;
}

function removeNamedPageItems(container, itemName) {
  for (var i = container.pageItems.length - 1; i >= 0; i -= 1) {
    try {
      var item = container.pageItems[i];
      if (item.typename === 'GroupItem') removeNamedPageItems(item, itemName);
      if (item.name === itemName) {
        unlockAndShow(item);
        item.remove();
      }
    } catch (error) {}
  }
}

function removeDebugLazer(parentLayer) {
  removeDebugByLabel(parentLayer, 'lazer');
}

function cleanupFailedItemArtifacts(documentRef, parentLayer) {
  var labels = ['lazer', 'front', 'back'];
  for (var i = 0; i < labels.length; i += 1) {
    var label = labels[i];
    removeSublayer(parentLayer, label);
    removeSublayer(parentLayer, caseLayerName(label));
    removeNamedPageItems(parentLayer, caseLayerName(label));
    removeNamedPageItems(parentLayer, 'MASK_30_48CM_' + label);
    removeNamedPageItems(parentLayer, 'MASK_TRIMMED_' + label);
    removeNamedPageItems(parentLayer, 'MASK_BORDER_' + label);
    removeNamedPageItems(parentLayer, 'IMAGE_' + label);
    removeDebugByLabel(parentLayer, label);
  }
  removeNamedPageItems(parentLayer, lazerOutlineName());
  removeNamedPageItems(parentLayer, 'TEMP_SCALE_GROUP_IMAGES');
  removeNamedPageItems(parentLayer, 'TEMP_ALIGN_GROUP_lazer');
  removeNamedPageItems(parentLayer, 'TEMP_PACK_GROUP_IMAGES');
  try { removeDocumentLayer(documentRef, longestEdgesLayerName()); } catch (error) {}
  try { app.activeDocument.selection = null; } catch (error) {}
}

function moveNamedItemToLayer(sourceContainer, itemName, targetLayer) {
  var item = findNamedPageItem(sourceContainer, itemName);
  if (item === null) return false;
  try {
    unlockAndShow(targetLayer);
    unlockAndShow(item);
    item.move(targetLayer, ElementPlacement.PLACEATBEGINNING);
    return true;
  } catch (error) {}
  return false;
}

function moveAllNamedItemsToLayer(sourceContainer, itemName, targetLayer) {
  var count = 0;
  while (true) {
    var moved = moveNamedItemToLayer(sourceContainer, itemName, targetLayer);
    if (!moved) break;
    count += 1;
    if (count > 500) break;
  }
  return count;
}

function lockNamedItems(container, itemName) {
  var count = 0;
  if (container === null) return count;
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (item.typename === 'GroupItem') count += lockNamedItems(item, itemName);
      if (item.name === itemName) {
        unlockAndShow(item);
        item.locked = true;
        count += 1;
      }
    } catch (error) {}
  }
  return count;
}
function replaceOutputLazerClipMaskWithBorderCopy(borderLayer, lazerLayer) {
  var outline = findNamedPageItem(borderLayer, lazerOutlineName());
  var group = findNamedPageItem(lazerLayer, caseLayerName('lazer'));
  if (outline === null || group === null) return false;
  var oldMask = findClipMaskInGroup(group, 'lazer');
  var maskCopy = null;
  try {
    unlockAndShow(outline);
    unlockAndShow(group);
    maskCopy = outline.duplicate(group, ElementPlacement.PLACEATBEGINNING);
    maskCopy.name = IGNORE_CHECK_FALSE ? lazerClipMaskName() : 'MASK_FROM_' + lazerOutlineName();
    maskCopy.filled = false;
    maskCopy.stroked = false;
    maskCopy.clipping = true;
    group.clipped = true;
    try { maskCopy.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
    if (oldMask !== null && oldMask !== maskCopy) {
      try { unlockAndShow(oldMask); oldMask.clipping = false; oldMask.remove(); } catch (removeError) {}
    }
    return true;
  } catch (error) {
    try { if (maskCopy !== null) maskCopy.remove(); } catch (cleanupError) {}
  }
  return false;
}
function releaseLazerClipMaskForOutput(parentLayer) {
  var group = findNamedPageItem(parentLayer, caseLayerName('lazer'));
  if (group === null) return false;
  var mask = findClipMaskInGroup(group, 'lazer');
  try {
    unlockAndShow(group);
    if (mask === null) return false;
    var maskName = String(mask.name || '');
    if (maskName !== 'MASK_30_48CM_lazer') {
      addReport('LAZER output: kept final ' + maskName + '; removed only temporary 30.48cm mask.');
      return false;
    }
    unlockAndShow(mask);
    mask.clipping = false;
    group.clipped = false;
    mask.remove();
    addReport('LAZER output: removed temporary MASK_30_48CM_lazer; kept final border clip.');
    return true;
  } catch (error) {}
  return false;
}

function releaseAndRemoveLazerClipMaskForError(parentLayer) {
  var group = findNamedPageItem(parentLayer, caseLayerName('lazer'));
  if (group === null) return false;
  var mask = findClipMaskInGroup(group, 'lazer');
  if (mask === null) return false;
  try {
    var maskName = String(mask.name || '(unnamed mask)');
    unlockAndShow(group);
    unlockAndShow(mask);
    mask.clipping = false;
    group.clipped = false;
    mask.remove();
    addReport('ERROR mode LAZER: Release Clipping Mask + removed ' + maskName + '.');
    return true;
  } catch (error) {
    throw new Error('ERROR_LAZER_RELEASE_CLIP_FAILED: ' + String(error));
  }
}
function normalizeLazerOutputNames(lazerLayer) {
  var renamed = 0;
  for (var i = 0; i < lazerLayer.pageItems.length; i += 1) {
    try {
      var caseGroup = lazerLayer.pageItems[i];
      if (caseGroup.typename !== 'GroupItem') continue;
      var caseName = String(caseGroup.name || '');
      if (caseName.lastIndexOf('_lazer') !== caseName.length - 6) continue;
      var artworkName = caseName.substring(0, caseName.length - 6);
      var clipName = 'MASK_' + caseName;
      for (var j = 0; j < caseGroup.pageItems.length; j += 1) {
        try {
          var item = caseGroup.pageItems[j];
          if (item.clipping === true || item.name === 'MASK_BORDER_lazer' || String(item.name || '').indexOf('MASK_FROM_') === 0) {
            item.name = clipName;
            renamed += 1;
          } else if (item.name === 'IMAGE_lazer' || item.name === lazerArtworkName()) {
            item.name = artworkName;
            renamed += 1;
          }
        } catch (itemError) {}
      }
    } catch (groupError) {}
  }
  return renamed;
}
function finalMoveItemsToOutputLayers(documentRef, parentLayer) {
  removeDocumentLayer(documentRef, longestEdgesLayerName());
  try { ungroupCaseItems(parentLayer, 'TEMP_PACK_GROUP_IMAGES'); } catch (error) {}

  var borderLayer = ensureLayer(documentRef, 'BORDER');
  var backLayer = ensureLayer(documentRef, 'BACK');
  var frontLayer = ensureLayer(documentRef, 'FRONT');
  var lazerLayer = ensureLayer(documentRef, 'LAZER');

  var movedBorder = moveAllNamedItemsToLayer(parentLayer, lazerOutlineName(), borderLayer);
  var movedBack = moveAllNamedItemsToLayer(parentLayer, caseLayerName('back'), backLayer);
  var movedFront = moveAllNamedItemsToLayer(parentLayer, caseLayerName('front'), frontLayer);
  var movedLazer = moveAllNamedItemsToLayer(parentLayer, caseLayerName('lazer'), lazerLayer);
  addReport('Moved BORDER: ' + movedBorder);
  for (var mb = 0; mb < borderLayer.pageItems.length; mb += 1) { try { markPackedBorderItem(borderLayer.pageItems[mb]); } catch (error) {} }
  addReport('Moved BACK: ' + movedBack);
  addReport('Moved FRONT: ' + movedFront);
  addReport('Moved LAZER: ' + movedLazer);
  if (IGNORE_CHECK_FALSE) {
    var lazerNamesUpdated = normalizeLazerOutputNames(lazerLayer);
    if (lazerNamesUpdated > 0) addReport('ERROR mode LAZER clipping/name cleanup: ' + lazerNamesUpdated + ' item(s); removed MASK_FROM_ naming.');
  }
  addReport('QTY sequential item: ' + (typeof CODEX_QTY_INDEX !== 'undefined' ? CODEX_QTY_INDEX : 1) + '/' + (typeof CODEX_ITEM_QTY !== 'undefined' ? CODEX_ITEM_QTY : 1));

}

function cross(o, a, b) {
  return ((a[0] - o[0]) * (b[1] - o[1])) - ((a[1] - o[1]) * (b[0] - o[0]));
}

function sortPointsForHull(points) {
  points.sort(function(a, b) {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });
  var unique = [];
  for (var i = 0; i < points.length; i += 1) {
    if (i === 0 || points[i][0] !== points[i - 1][0] || points[i][1] !== points[i - 1][1]) unique.push(points[i]);
  }
  return unique;
}

function convexHull(points) {
  var sorted = sortPointsForHull(points);
  if (sorted.length <= 3) return sorted;
  var lower = [];
  for (var i = 0; i < sorted.length; i += 1) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) lower.pop();
    lower.push(sorted[i]);
  }
  var upper = [];
  for (var j = sorted.length - 1; j >= 0; j -= 1) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[j]) <= 0) upper.pop();
    upper.push(sorted[j]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
function pageItemVisualArea(item) {
  try {
    if (item.typename === 'PathItem' && typeof item.area === 'number') return Math.abs(item.area);
  } catch (error) {}
  try {
    var b = boundsOf(item);
    return Math.abs(b.width * b.height);
  } catch (error) {}
  return 0;
}

function findLargestTracePathItem(container) {
  var bestItem = null;
  var bestArea = -1;
  function inspect(item) {
    if (item === null) return;
    try {
      if (item.typename === 'PathItem') {
        if (item.clipping === true) return;
        var area = pageItemVisualArea(item);
        if (area > bestArea) { bestArea = area; bestItem = item; }
        return;
      }
      if (item.typename === 'CompoundPathItem') {
        for (var c = 0; c < item.pathItems.length; c += 1) inspect(item.pathItems[c]);
        return;
      }
      if (item.pageItems) {
        for (var i = 0; i < item.pageItems.length; i += 1) inspect(item.pageItems[i]);
      }
    } catch (error) {}
  }
  inspect(container);
  return bestItem;
}

function copyPageItemExact(sourceItem, targetParent, itemName, strokeOnly) {
  if (sourceItem === null || targetParent === null) return null;
  var copied = null;
  try {
    copied = sourceItem.duplicate(targetParent, ElementPlacement.PLACEATBEGINNING);
    copied.name = itemName;
    if (strokeOnly === true) {
      try { copied.filled = false; } catch (error) {}
      try { copied.stroked = true; } catch (error) {}
      try { copied.strokeWidth = LAZER_STROKE_WIDTH; } catch (error) {}
      try { copied.strokeColor = green(); } catch (error) {}
    } else {
      try { copied.filled = false; } catch (error) {}
      try { copied.stroked = false; } catch (error) {}
    }
    unlockAndShow(copied);
    return copied;
  } catch (error) {
    try { if (copied !== null) copied.remove(); } catch (cleanupError) {}
  }
  return null;
}

function copyExactLazerTraceOutline(parentLayer) {
  var tracedLazer = findNamedPageItem(parentLayer, lazerArtworkName());
  if (tracedLazer === null) return null;
  var sourcePath = findLargestTracePathItem(tracedLazer);
  if (sourcePath === null) return null;
  var outline = copyPageItemExact(sourcePath, parentLayer, lazerOutlineName(), true);
  if (outline !== null) {
    try { outline.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
  }
  return outline;
}

function drawLazerOutlineAfterScale(parentLayer) {
  if (!CODEX_COLORED_METRICS || !CODEX_COLORED_METRICS.components || CODEX_COLORED_METRICS.components.length === 0) return null;
  removeNamedPageItems(parentLayer, lazerOutlineName());
  var component = CODEX_COLORED_METRICS.components[0];
  if (!component || !component.sampledOutline || component.sampledOutline.length === 0) return null;
  var debugItem = findDebugBounds(parentLayer, 'lazer');
  if (debugItem === null) return null;
  var db = boundsOf(debugItem);
  var scaleX = db.width / CODEX_COLORED_METRICS.components[0].widthPx;
  var scaleY = db.height / CODEX_COLORED_METRICS.components[0].heightPx;
  var pathPoints = [];
  for (var p = 0; p < component.sampledOutline.length; p += 1) {
    var point = component.sampledOutline[p];
    var x = db.left + (point.x - component.minX) * scaleX;
    var y = db.top - (point.y - component.minY) * scaleY;
    pathPoints.push([x, y]);
  }
  if (pathPoints.length < 3) return null;
  var outline = parentLayer.pathItems.add();
  outline.name = lazerOutlineName();
  outline.stroked = true;
  outline.strokeWidth = LAZER_STROKE_WIDTH;
  outline.strokeColor = green();
  outline.filled = false;
  if (pathPoints.length >= 2) {
    var flatPoints = [];
    for (var r = 0; r < pathPoints.length; r += 1) {
      flatPoints.push(pathPoints[r][0]);
      flatPoints.push(pathPoints[r][1]);
    }
    try {
      outline.setEntirePath(pathPoints);
      outline.closed = true;
    } catch (error) {
      outline.remove();
      return null;
    }
  }
  unlockAndShow(outline);
  try { outline.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
  return outline;
}

function createPathCopyFromOutline(parent, outline, itemName) {
  if (parent === null || outline === null) return null;
  return copyPageItemExact(outline, parent, itemName, false);
}

function expandLazerMaskBleed(maskItem) {
  if (maskItem === null || LAZER_MASK_BLEED_POINT <= 0) return;
  try {
    var maskBounds = boundsOf(maskItem);
    if (maskBounds.width <= 0 || maskBounds.height <= 0) return;
    var scaleX = ((maskBounds.width + (LAZER_MASK_BLEED_POINT * 2)) / maskBounds.width) * 100;
    var scaleY = ((maskBounds.height + (LAZER_MASK_BLEED_POINT * 2)) / maskBounds.height) * 100;
    maskItem.resize(scaleX, scaleY, true, true, true, true, 100, Transformation.CENTER);
  } catch (error) {}
}

function applyOutlineClipMaskToCase(parentLayer, label) {
  var group = findNamedPageItem(parentLayer, caseLayerName(label));
  if (group === null) return false;
  var outline = label === 'lazer' ? null : findPackingLazerOutline(parentLayer);
  if (label !== 'lazer' && outline === null) return false;
  var oldMask = findClipMaskInGroup(group, label);
  var maskCopy = null;
  try {
    unlockAndShow(group);
    if (label === 'lazer') {
      var debugBounds = findDebugBounds(parentLayer, 'lazer');
      if (debugBounds === null) return false;
      var bounds = boundsOf(debugBounds);
      maskCopy = group.pathItems.rectangle(
        bounds.top + LAZER_MASK_BLEED_POINT,
        bounds.left - LAZER_MASK_BLEED_POINT,
        bounds.width + (LAZER_MASK_BLEED_POINT * 2),
        bounds.height + (LAZER_MASK_BLEED_POINT * 2)
      );
      maskCopy.name = 'MASK_BORDER_lazer';
      maskCopy.filled = false;
      maskCopy.stroked = false;
      addReport('MASK_BORDER_lazer uses colored-bounds rectangle + ' + LAZER_MASK_BLEED_CM + 'cm each side.');
    } else {
      unlockAndShow(outline);
      maskCopy = createPathCopyFromOutline(group, outline, 'MASK_BORDER_' + label);
    }
    if (maskCopy === null) return false;
    maskCopy.clipping = true;
    group.clipped = true;
    try { maskCopy.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
    if (oldMask !== null && oldMask !== maskCopy) {
      try { unlockAndShow(oldMask); oldMask.clipping = false; oldMask.remove(); } catch (removeError) {}
    }
    return true;
  } catch (error) {
    try { if (maskCopy !== null) maskCopy.remove(); } catch (cleanupError) {}
  }
  return false;
}

function alignLazerPathToDebugOutlineAfterPack(parentLayer) {
  var lazerGroup = findNamedPageItem(parentLayer, caseLayerName('lazer'));
  var debugOutline = findNamedPageItem(parentLayer, lazerOutlineName());
  if (lazerGroup === null || debugOutline === null) return false;
  var largestPath = findLargestTracePathItem(lazerGroup);
  if (largestPath === null) return false;
  try {
    var pathBounds = boundsOf(largestPath);
    var outlineBounds = boundsOf(debugOutline);
    if (pathBounds === null || outlineBounds === null) return false;
    var pathCenterX = (pathBounds.left + pathBounds.right) / 2;
    var outlineCenterX = (outlineBounds.left + outlineBounds.right) / 2;
    var dx = outlineCenterX - pathCenterX;
    var dy = outlineBounds.top - pathBounds.top;
    if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) return true;
    largestPath.translate(dx, dy);
    addReport('ALIGN LAZER PATH->DEBUG_LAZER: dx=' + dx + 'pt, dy=' + dy + 'pt (top-anchored).');
    return true;
  } catch (error) {}
  return false;
}
function applyOutlineClipMasksAfterPacking(parentLayer) {
  var count = 0;
  if (applyOutlineClipMaskToCase(parentLayer, 'lazer')) count += 1;
  if (applyOutlineClipMaskToCase(parentLayer, 'front')) count += 1;
  if (CODEX_SIDE_COUNT >= 2 && applyOutlineClipMaskToCase(parentLayer, 'back')) count += 1;
  addReport('Outline clip masks after pack: ' + count);
  return count;
}
function replaceLazerClipMaskWithOutline(parentLayer) {
  var outline = findNamedPageItem(parentLayer, lazerOutlineName());
  var group = findNamedPageItem(parentLayer, caseLayerName('lazer'));
  if (outline === null || group === null) return false;
  var oldMask = findClipMaskInGroup(group, 'lazer');
  var maskCopy = null;
  try {
    unlockAndShow(outline);
    maskCopy = outline.duplicate(group, ElementPlacement.PLACEATBEGINNING);
    maskCopy.name = lazerClipMaskName();
    maskCopy.filled = false;
    maskCopy.stroked = false;
    maskCopy.clipping = true;
    group.clipped = true;
    try { maskCopy.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
    if (oldMask !== null && oldMask !== maskCopy) {
      try { unlockAndShow(oldMask); oldMask.clipping = false; oldMask.remove(); } catch (removeError) {}
    }
    return true;
  } catch (error) {
    try { if (maskCopy !== null) maskCopy.remove(); } catch (cleanupError) {}
  }
  return false;
}
function runCase(documentRef, parentLayer, label, verticalMode, offsetIndex, preferredIndex, useUnion) {
  var caseLayer = createCaseLayer(parentLayer, label);
  var sourceImagePath = label === 'lazer' && typeof CODEX_LAZER_IMAGE_PATH !== 'undefined' && CODEX_LAZER_IMAGE_PATH ? CODEX_LAZER_IMAGE_PATH : CODEX_IMAGE_PATH;
  var imageItem = embedImage(caseLayer, documentRef, sourceImagePath, label, offsetIndex, label === 'lazer');
  if (imageItem === null) throw new Error('Kh?ng t?m th?y IMAGE_' + label);
  validateImportedImageWidth(imageItem, label);
  var mask = createMask(caseLayer, documentRef, label, offsetIndex);
  if (label === 'lazer') debugLazerStep('Da tao o vuong 30.48cm', mask);
  alignImageToMask(imageItem, mask, verticalMode);
  var checkMode = false;
  try { checkMode = (typeof CODEX_USE_CHECK_MEASUREMENT !== 'undefined' && CODEX_USE_CHECK_MEASUREMENT === true) || (typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true) || IGNORE_CHECK_FALSE; } catch (error) {}
  var lazerCleanupMode = checkMode || IGNORE_CHECK_FALSE;
  if (checkMode) {
    addReport('CHECK_ALIGN_' + String(label).toUpperCase() + ': horizontal=center, vertical=' + verticalMode + ', source=geometric raster bounds');
  }
  if (label === 'lazer') debugLazerStep('Ảnh đã import, embed và căn Center/Top', imageItem);

  var picked = null;
  var edgeBounds = null;
  if (label === 'lazer') {
    var preTraceBoundsList = allColoredBounds(imageItem, CODEX_COLORED_METRICS);
    picked = pickBounds(mask, preTraceBoundsList, preferredIndex, useUnion === true);
    var lazerComponentPick = pickBestComponentForRasterMask(imageItem, CODEX_COLORED_METRICS, mask, preferredIndex, useUnion === true);
    if (checkMode && lazerComponentPick) addReport('CHECK_PICK_LAZER: mode=' + lazerComponentPick.mode + ' | component=' + lazerComponentPick.index + ' | overlapScore=' + Math.round(lazerComponentPick.score));
    edgeBounds = (lazerComponentPick ? exactColorEdgeBoundsFromComponent(imageItem, CODEX_COLORED_METRICS, lazerComponentPick.component, mask) : null) || exactColorEdgeBoundsFromRaster(imageItem, CODEX_COLORED_METRICS, mask) || outlineEdgeBoundsFromRaster(imageItem, CODEX_COLORED_METRICS.components[0], mask) || visibleColoredBoundsInsideMask(mask, preTraceBoundsList) || picked;
    var lazerDebugBounds = drawDebug(caseLayer, edgeBounds || picked, label);
    imageItem = traceLazerSilhouette(imageItem, caseLayer);
    if (lazerCleanupMode) {
      removeLazerArtworkBelowMaskForCheck(imageItem, mask);
      removeLazerArtworkOutsideReferenceBounds(imageItem, edgeBounds || picked);
      removeLazerRectFramePathsForCheck(imageItem);
      if (IGNORE_CHECK_FALSE && !checkMode) addReport('ERROR mode: applied CHECK LAZER cleanup before packing.');
    }

    showCheckEdgeDistance(label, mask, edgeBounds, lazerDebugBounds);
  }

  var group = makeClip(caseLayer, imageItem, mask, label);
  if (label === 'lazer') debugLazerStep(checkMode ? 'LAZER clipping mask 30.48cm before pack' : 'LAZER clipping mask 30.48cm', group);
  if (label !== 'lazer') {
    var clippedRaster = findRasterInGroup(group);
    if (clippedRaster === null) throw new Error('CLIP_IMAGE_30_48CM_' + label + ' thieu IMAGE_' + label);
    var boundsList = allColoredBounds(clippedRaster, CODEX_COLORED_METRICS);
    picked = pickBounds(mask, boundsList, preferredIndex, useUnion === true);
    var printComponentPick = pickBestComponentForRasterMask(clippedRaster, CODEX_COLORED_METRICS, mask, preferredIndex, useUnion === true);
    if (checkMode && printComponentPick) addReport('CHECK_PICK_' + String(label).toUpperCase() + ': mode=' + printComponentPick.mode + ' | component=' + printComponentPick.index + ' | overlapScore=' + Math.round(printComponentPick.score));
    edgeBounds = (printComponentPick ? exactColorEdgeBoundsFromComponent(clippedRaster, CODEX_COLORED_METRICS, printComponentPick.component, mask) : null) || exactColorEdgeBoundsFromRaster(clippedRaster, CODEX_COLORED_METRICS, mask) || outlineEdgeBoundsFromRaster(clippedRaster, CODEX_COLORED_METRICS.components[0], mask) || visibleColoredBoundsInsideMask(mask, boundsList) || picked;
    var printDebugBounds = drawDebug(caseLayer, edgeBounds || picked, label);
    showCheckEdgeDistance(label, mask, edgeBounds, printDebugBounds);
  }

  if (label === 'lazer' && checkMode) addReport('MASK_30_48CM_lazer clipping make first, keep through packing, reclip after pack, then remove before LAZER output.');
  else addReport('MASK_30_48CM_' + label + ' remains a 30.48cm square until MASK_BORDER_' + label + ' replaces it.');
  if (!CODEX_SUPPRESS_REDRAW) app.redraw();
  if (!checkMode) addReport(report(label, mask, edgeBounds || picked));
}

function existsNamedItem(container, itemName) {
  for (var i = 0; i < container.pageItems.length; i += 1) {
    try {
      var item = container.pageItems[i];
      if (item.name === itemName) return true;
      if (item.typename === 'GroupItem' && existsNamedItem(item, itemName)) return true;
    } catch (error) {}
  }
  return false;
}

function existsSublayer(parentLayer, layerName) {
  for (var i = 0; i < parentLayer.layers.length; i += 1) {
    try { if (parentLayer.layers[i].name === layerName) return true; } catch (error) {}
  }
  return false;
}

function auditImagesLayer(parentLayer) {
  var messages = [];
  var documentRef = app.activeDocument;
  var packArea = findPackAreaBounds(app.activeDocument);
  for (var i = 0; i < CODEX_REPORTS.length; i += 1) {
    messages.push(CODEX_REPORTS[i]);
    messages.push('---');
  }
  messages.push('AUDIT Images');
  messages.push('pack area: ' + packArea.source);
  messages.push('pack top-left: ' + ptToCm(packArea.left) + 'cm, ' + ptToCm(packArea.top) + 'cm');
  messages.push('LAZER output: ' + existsNamedItem(ensureLayer(documentRef, 'LAZER'), caseLayerName('lazer')));
  messages.push('FRONT output: ' + existsNamedItem(ensureLayer(documentRef, 'FRONT'), caseLayerName('front')));
  messages.push('BACK output: ' + existsNamedItem(ensureLayer(documentRef, 'BACK'), caseLayerName('back')));
  messages.push('BORDER output: ' + existsNamedItem(ensureLayer(documentRef, 'BORDER'), lazerOutlineName()));
  messages.push('debug lazer removed: ' + !existsNamedItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_lazer'));
  messages.push('debug front removed: ' + !existsNamedItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_front'));
  messages.push('debug back removed: ' + !existsNamedItem(parentLayer, 'DEBUG_BLACK_PIXEL_BOUNDS_back'));
  messages.push('temp scale absent: ' + !existsNamedItem(parentLayer, 'TEMP_SCALE_GROUP_IMAGES'));
  messages.push('temp align absent: ' + !existsNamedItem(parentLayer, 'TEMP_ALIGN_GROUP_lazer'));
  messages.push('temp pack removed: ' + !existsNamedItem(parentLayer, 'TEMP_PACK_GROUP_IMAGES'));
  messages.push('longest edge layer removed: ' + !existsSublayer(app.activeDocument, longestEdgesLayerName()));
  messages.push('---');
  messages.push(verifyLongestEdgeAgainstTemplate(parentLayer, app.activeDocument));
  alert(messages.join('\n'));
}
function run() {
  var documentRef = getOrOpenTemplate(CODEX_TEMPLATE_PATH);
  var parentLayer = ensureLayer(documentRef, 'Images');
  resetPackContext(documentRef);
  runCase(documentRef, parentLayer, 'lazer', 'top', 0, 0);
  if (isSingleBadgeFlow()) {
    addReport(isBadgeReel() ? 'Badge-reel flow: lazer + front(bottom), no back' : 'Single-side flow: lazer + front(bottom), no back');
    runCase(documentRef, parentLayer, 'front', 'bottom', 1, 1, true);
  } else {
    runCase(documentRef, parentLayer, 'front', 'center', 1, 1, true);
    if (CODEX_SIDE_COUNT >= 2) runCase(documentRef, parentLayer, 'back', 'bottom', 2, 2, true);
  }
  alignLazerBeforeScale(documentRef, parentLayer);
  scaleImagesByLazerSize(documentRef, parentLayer);
  if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Đã scale theo kích thước item', findNamedPageItem(parentLayer, caseLayerName('lazer')));
  removeDebugByLabel(parentLayer, 'front');
  removeDebugByLabel(parentLayer, 'back');
  drawLazerOutlineAfterScale(parentLayer);
  if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Đã tạo DEBUG_LAZER/BORDER hình dạng item', findNamedPageItem(parentLayer, lazerOutlineName()));
  try {
    packImagesOnSheet(parentLayer, documentRef);
    applyOutlineClipMasksAfterPacking(parentLayer);
    alignLazerPathToDebugOutlineAfterPack(parentLayer);
    if (IGNORE_CHECK_FALSE && replaceLazerClipMaskWithOutline(parentLayer)) {
      addReport('ERROR mode: removed temporary MASK_BORDER_lazer after packing; kept outline clip.');
    }
    if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Đã sắp xếp né BORDER', findNamedPageItem(parentLayer, lazerOutlineName()));
    removeDebugLazer(parentLayer);
    if (IGNORE_CHECK_FALSE) releaseAndRemoveLazerClipMaskForError(parentLayer);
    else releaseLazerClipMaskForOutput(parentLayer);
    finalMoveItemsToOutputLayers(documentRef, parentLayer);
    addCurrentBorderToPackContext(documentRef);
    writeRunResult(true, true, 'OK');
    if (typeof CODEX_IS_LAST_RUN === 'undefined' || CODEX_IS_LAST_RUN) {
      auditImagesLayer(parentLayer);
    }
    app.redraw();
  } catch (error) {
    if (String(error).indexOf('NO_FIT_CURRENT_SHEET') < 0) writeRunResult(false, false, String(error));
    throw error;
  }
}

function runBatch() {
  var documentRef = getOrOpenTemplate(CODEX_TEMPLATE_PATH);
  try { documentRef.activate(); app.redraw(); } catch (error) {}
  var parentLayer = ensureLayer(documentRef, 'Images');
  resetPackContext(documentRef);
  var results = [];
  var noFitCountBySize = {};
  var blockedSizeKeys = {};
  try {
    if (typeof CODEX_BLOCKED_SIZE_KEYS !== 'undefined' && CODEX_BLOCKED_SIZE_KEYS) {
      for (var initialSizeIndex = 0; initialSizeIndex < CODEX_BLOCKED_SIZE_KEYS.length; initialSizeIndex += 1) {
        blockedSizeKeys[String(CODEX_BLOCKED_SIZE_KEYS[initialSizeIndex])] = true;
      }
    }
  } catch (error) {}
  BLOCKED_SIZE_KEYS = blockedSizeKeys;
  if (typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true) resetCheckDistanceLayer(documentRef);
  CODEX_SUPPRESS_REDRAW = true;
  writeProgress(0, CODEX_BATCH_ITEMS.length, 'START_BATCH', null, '');
  for (var i = 0; i < CODEX_BATCH_ITEMS.length; i += 1) {
    var item = CODEX_BATCH_ITEMS[i];
    writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'DOING', item, '');
    CODEX_IMAGE_PATH = item.imagePath;
    CODEX_IMAGE_BASENAME = item.imageBaseName;
    CODEX_IMAGE_ID = item.imageId;
    CODEX_LAZER_IMAGE_PATH = item.lazerImagePath || item.imagePath;
    CODEX_SIDE_COUNT = item.sideCount;
    CODEX_ITEM_SIZE_INCH = item.itemSizeInch;
    CODEX_ITEM_QTY = item.itemQty;
    CODEX_IMAGE_WIDTH_POINT = item.placementWidthPoint;
    CODEX_IMAGE_HEIGHT_POINT = item.placementHeightPoint;
    CODEX_QTY_INDEX = item.qtyIndex;
    CODEX_ITEM_RUN_SUFFIX = item.runSuffix;
    CODEX_IS_LAST_RUN = false;
    CODEX_COLORED_METRICS = item.coloredMetrics;
    CODEX_REPORTS = [];
    resetCheckMeasurements();
    var currentSizeKey = String(Number(item.itemSizeInch));
    if (blockedSizeKeys[currentSizeKey]) {
      results.push({ success: false, fit: false, message: 'SKIPPED_SIZE_AFTER_TWO_NO_FIT', reason: 'size=' + currentSizeKey });
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'SKIP_SIZE', item, 'SKIPPED_SIZE_AFTER_TWO_NO_FIT');
      continue;
    }
    try {
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'TRACE_LAZER', item, '');
      runCase(documentRef, parentLayer, 'lazer', 'top', 0, 0);
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'LAZER_READY', item, '');
      if (isSingleBadgeFlow()) {
        addReport(isBadgeReel() ? 'Badge-reel flow: lazer + front(bottom), no back' : 'Single-side flow: lazer + front(bottom), no back');
        runCase(documentRef, parentLayer, 'front', 'bottom', 1, 1, true);
      } else {
        runCase(documentRef, parentLayer, 'front', 'center', 1, 1, true);
        if (CODEX_SIDE_COUNT >= 2) runCase(documentRef, parentLayer, 'back', 'bottom', 2, 2, true);
      }
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'PRINT_READY', item, '');
      var shouldCheckCompare = true;
      var compareOk = checkCompareMeasurements(CODEX_SIDE_COUNT);
      if (!compareOk && IGNORE_CHECK_FALSE) {
        addReport('IGNORE_CHECK_FALSE: compare vẫn false; chuyển ảnh vào images_error, không pack item này.');
      }
      var checkPreviewContinueOnFalse = false;
      try { checkPreviewContinueOnFalse = typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true; } catch (error) {}
      var compareFalseReason = null;
      if (!compareOk) {
        compareFalseReason = buildCheckFailReason(CODEX_SIDE_COUNT);
        if (!compareOk) addReport(IGNORE_CHECK_FALSE ? 'ERROR: CHECK_COMPARE_FALSE; bo qua item nay, khong pack.' : 'CHECK preview: compare false; dung truoc scale/pack de kiem tra.');
        if (!compareOk) writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'CHECK_COMPARE_FALSE', item, 'CHECK_COMPARE_FALSE');
        if (!compareOk && !checkPreviewContinueOnFalse) {
          results.push({ success: false, fit: false, message: 'CHECK_COMPARE_FALSE', reason: compareFalseReason, evidence: CODEX_REPORTS.slice(0) });
          cleanupFailedItemArtifacts(documentRef, parentLayer);
          continue;
        }
      }
      if (checkPreviewContinueOnFalse) {
        var checkOnlyMessage = compareFalseReason !== null ? 'CHECK_COMPARE_FALSE' : 'CHECK_COMPARE_TRUE';
        addReport(compareFalseReason !== null ? 'CHECK mode: compare false; stopped before scale/pack so you can inspect.' : 'CHECK mode: compare passed; stopped before scale/pack so you can inspect.');
        results.push({ success: compareFalseReason === null, fit: true, message: checkOnlyMessage, reason: compareFalseReason, evidence: CODEX_REPORTS.slice(0) });
        writeProgress(i + 1, CODEX_BATCH_ITEMS.length, checkOnlyMessage, item, checkOnlyMessage);
        writeBatchRunResult(results, checkOnlyMessage);
        CODEX_SUPPRESS_REDRAW = false;
        try { app.redraw(); } catch (redrawError) {}
        return;
      }
      alignLazerBeforeScale(documentRef, parentLayer);
      scaleImagesByLazerSize(documentRef, parentLayer);
  if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Đã scale theo kích thước item', findNamedPageItem(parentLayer, caseLayerName('lazer')));
      removeDebugByLabel(parentLayer, 'front');
      removeDebugByLabel(parentLayer, 'back');
      drawLazerOutlineAfterScale(parentLayer);
  if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Đã tạo DEBUG_LAZER/BORDER hình dạng item', findNamedPageItem(parentLayer, lazerOutlineName()));
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'PACKING', item, '');
      packImagesOnSheet(parentLayer, documentRef);
      applyOutlineClipMasksAfterPacking(parentLayer);
    alignLazerPathToDebugOutlineAfterPack(parentLayer);
    if (IGNORE_CHECK_FALSE && replaceLazerClipMaskWithOutline(parentLayer)) {
      addReport('ERROR mode: removed temporary MASK_BORDER_lazer after packing; kept outline clip.');
    }
      if (DEBUG_LAZER_STEPS_ENABLED) debugLazerStep('Da sap xep ne BORDER', findNamedPageItem(parentLayer, lazerOutlineName()));
      removeDebugLazer(parentLayer);
      if (IGNORE_CHECK_FALSE) releaseAndRemoveLazerClipMaskForError(parentLayer);
      else releaseLazerClipMaskForOutput(parentLayer);
      finalMoveItemsToOutputLayers(documentRef, parentLayer);
      addCurrentBorderToPackContext(documentRef);
      results.push({ success: true, fit: true, message: 'OK' });
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'DONE', item, 'OK');
      if (shouldProgressRedraw(i + 1)) { try { app.redraw(); } catch (redrawError) {} }
    } catch (error) {
      var errorMessage = String(error);
      if (errorMessage.indexOf('CHECK_IMAGE_WIDTH_FALSE') >= 0 || errorMessage.indexOf('CHECK_MASK_30_48CM_WIDTH_FALSE') >= 0 || errorMessage.indexOf('CHECK_COMPARE_FALSE') >= 0) {
        addReport('CHECK_COMPARE: false | reason=image_width_or_compare_failed | ' + errorMessage);
        results.push({ success: false, fit: false, message: 'CHECK_COMPARE_FALSE', reason: errorMessage, evidence: CODEX_REPORTS.slice(0) });
        writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'CHECK_COMPARE_FALSE', item, errorMessage);
        if (typeof CODEX_CHECK_FULL_PIPELINE !== 'undefined' && CODEX_CHECK_FULL_PIPELINE === true) {
          CODEX_SUPPRESS_REDRAW = false;
          writeBatchRunResult(results, 'CHECK_COMPARE_FALSE');
          try { app.redraw(); } catch (redrawError) {}
          return;
        }
        cleanupFailedItemArtifacts(documentRef, parentLayer);
        continue;
      }
      if (errorMessage.indexOf('NO_FIT_CURRENT_SHEET') >= 0) {
        var noFitCount = Number(noFitCountBySize[currentSizeKey] || 0) + 1;
        noFitCountBySize[currentSizeKey] = noFitCount;
        if (noFitCount >= 2) blockedSizeKeys[currentSizeKey] = true;
        BLOCKED_SIZE_KEYS = blockedSizeKeys;
        results.push({ success: false, fit: false, message: 'NO_FIT_CURRENT_SHEET', reason: 'size=' + currentSizeKey + ', attempt=' + noFitCount });
        writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'NO_FIT', item, 'NO_FIT_CURRENT_SHEET size=' + currentSizeKey + ' attempt=' + noFitCount);
        if (item.continueAfterNoFit === true) continue;
        writeBatchRunResult(results, errorMessage);
        return;
      }
      results.push({ success: false, fit: false, message: errorMessage });
      writeProgress(i + 1, CODEX_BATCH_ITEMS.length, 'ERROR', item, errorMessage);
      CODEX_SUPPRESS_REDRAW = false;
      writeBatchRunResult(results, errorMessage);
      throw error;
    }
  }
  CODEX_SUPPRESS_REDRAW = false;
  if (REDRAW_AT_BATCH_END) { try { app.redraw(); } catch (error) {} }
  writeProgress(CODEX_BATCH_ITEMS.length, CODEX_BATCH_ITEMS.length, 'DONE_BATCH', null, 'OK');
  writeBatchRunResult(results, 'OK');
}

try {
  if (typeof CODEX_BATCH_ITEMS !== 'undefined' && CODEX_BATCH_ITEMS && CODEX_BATCH_ITEMS.length) runBatch();
  else run();
} catch (error) {
  var topLevelError = String(error);
  try {
    if (typeof CODEX_BATCH_ITEMS !== 'undefined' && CODEX_BATCH_ITEMS && CODEX_BATCH_ITEMS.length) writeBatchRunResult([], topLevelError);
    else writeRunResult(false, false, topLevelError);
  } catch (writeError) {}
  throw error;
}













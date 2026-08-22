var CM_TO_POINT = 28.346456692913385;
var EXPECTED_WIDTH_CM = 30.48;
var WIDTH_TOLERANCE_CM = 0.01;

function normalizePath(value) {
  try { return String(value).replace(/\\/g, '/').toLowerCase(); } catch (error) {}
  return '';
}

function ensureLayer(documentRef, layerName) {
  for (var i = 0; i < documentRef.layers.length; i += 1) {
    try {
      if (String(documentRef.layers[i].name).toLowerCase() === String(layerName).toLowerCase()) return documentRef.layers[i];
    } catch (error) {}
  }
  var layer = documentRef.layers.add();
  layer.name = layerName;
  return layer;
}

function getOrOpenTemplate(templatePath) {
  var templateFile = new File(templatePath);
  if (!templateFile.exists) throw new Error('TEMPLATE_MISSING: ' + templatePath);
  var targetPath = normalizePath(templateFile.fsName || templatePath);
  for (var i = 0; i < app.documents.length; i += 1) {
    try {
      var documentRef = app.documents[i];
      var documentPath = normalizePath(documentRef.fullName && documentRef.fullName.fsName ? documentRef.fullName.fsName : '');
      if (documentPath === targetPath) {
        documentRef.activate();
        return documentRef;
      }
    } catch (error) {}
  }
  return app.open(templateFile);
}

function removeLayerItems(layer) {
  for (var i = layer.pageItems.length - 1; i >= 0; i -= 1) {
    try { layer.pageItems[i].remove(); } catch (error) {}
  }
}

function writeResult(success, matches, widthCm, templateWidthCm, message) {
  var file = new File(CODEX_RESULT_PATH);
  file.encoding = 'UTF-8';
  if (!file.open('w')) throw new Error('CANNOT_WRITE_RESULT: ' + CODEX_RESULT_PATH);
  file.write('{"success":' + (success ? 'true' : 'false') + ',"matches":' + (matches ? 'true' : 'false') + ',"widthCm":' + Number(widthCm).toFixed(4) + ',"templateWidthCm":' + Number(templateWidthCm).toFixed(4) + ',"expectedWidthCm":' + EXPECTED_WIDTH_CM + ',"message":"' + String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}');
  file.close();
}

function run() {
  var documentRef = getOrOpenTemplate(CODEX_TEMPLATE_PATH);
  var imageFile = new File(CODEX_IMAGE_PATH);
  if (!imageFile.exists) throw new Error('IMAGE_MISSING: ' + CODEX_IMAGE_PATH);

  var checkLayer = ensureLayer(documentRef, '__CHECK_SIZE__');
  checkLayer.locked = false;
  checkLayer.visible = true;
  removeLayerItems(checkLayer);
  documentRef.activeLayer = checkLayer;

  var placed = checkLayer.placedItems.add();
  placed.file = imageFile;
  if (!(CODEX_IMAGE_WIDTH_POINT > 0) || !(CODEX_IMAGE_HEIGHT_POINT > 0)) throw new Error('INVALID_PNG_DPI_SIZE');
  placed.width = CODEX_IMAGE_WIDTH_POINT;
  placed.height = CODEX_IMAGE_HEIGHT_POINT;

  var artboard = documentRef.artboards[documentRef.artboards.getActiveArtboardIndex()].artboardRect;
  placed.left = artboard[0] + 20;
  placed.top = artboard[1] - 20;
  placed.name = 'CHECK_IMAGE_WIDTH';
  documentRef.selection = null;
  placed.selected = true;
  try { app.redraw(); } catch (error) {}

  var widthCm = placed.width / CM_TO_POINT;
  var templateWidthCm = Math.abs(artboard[2] - artboard[0]) / CM_TO_POINT;
  var matches = Math.abs(widthCm - EXPECTED_WIDTH_CM) <= WIDTH_TOLERANCE_CM;
  writeResult(true, matches, widthCm, templateWidthCm, matches ? 'WIDTH_MATCHES_30_48CM' : 'WIDTH_DOES_NOT_MATCH_30_48CM');
}

try {
  run();
} catch (error) {
  try { writeResult(false, false, 0, 0, String(error)); } catch (writeError) {}
  throw error;
}

function normalizePath(value) {
  try { return String(value).replace(/\\/g, '/').toLowerCase(); } catch (error) {}
  return '';
}

function ensureFolderForFile(filePath) {
  var file = new File(filePath);
  var folder = file.parent;
  if (!folder.exists && !folder.create()) throw new Error('CANNOT_CREATE_PREVIEW_FOLDER: ' + folder.fsName);
}

function closeRecoveredDocuments() {
  try {
    for (var index = app.documents.length - 1; index >= 0; index -= 1) {
      try {
        var documentRef = app.documents[index];
        if (String(documentRef.name || '').indexOf('[Recovered]') >= 0) documentRef.close(SaveOptions.DONOTSAVECHANGES);
      } catch (error) {}
    }
  } catch (error) {}
}

function getOrOpenTemplate(templatePath) {
  closeRecoveredDocuments();
  var templateFile = new File(templatePath);
  if (!templateFile.exists) throw new Error('SHEET_PREVIEW_SOURCE_MISSING: ' + templatePath);
  var targetPath = normalizePath(templateFile.fsName || templatePath);
  for (var index = 0; index < app.documents.length; index += 1) {
    try {
      var documentRef = app.documents[index];
      var documentPath = normalizePath(documentRef.fullName && documentRef.fullName.fsName ? documentRef.fullName.fsName : '');
      if (documentPath === targetPath) {
        documentRef.activate();
        return { documentRef: documentRef, openedByScript: false };
      }
    } catch (error) {}
  }
  return { documentRef: app.open(templateFile), openedByScript: true };
}
function writeResult(success, message) {
  var file = new File(CODEX_SHEET_PREVIEW_RESULT_PATH);
  file.encoding = 'UTF-8';
  if (!file.open('w')) return;
  var safeMessage = String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  file.write('{"success":' + (success ? 'true' : 'false') + ',"message":"' + safeMessage + '"}');
  file.close();
}

function captureLayerState(documentRef) {
  var state = [];
  for (var index = 0; index < documentRef.layers.length; index += 1) {
    var layer = documentRef.layers[index];
    state.push({ layer: layer, visible: layer.visible });
  }
  return state;
}

function restoreLayerState(state) {
  for (var index = 0; index < state.length; index += 1) {
    try { state[index].layer.visible = state[index].visible; } catch (error) {}
  }
}

function showEyeAndBorderOnly(documentRef) {
  var foundEye = false;
  var foundBorder = false;
  for (var index = 0; index < documentRef.layers.length; index += 1) {
    var layer = documentRef.layers[index];
    var name = String(layer.name).toLowerCase();
    var visible = name === 'eye' || name === 'border';
    layer.visible = visible;
    if (name === 'eye') foundEye = true;
    if (name === 'border') foundBorder = true;
  }
  if (!foundEye && !foundBorder) throw new Error('PREVIEW_LAYERS_NOT_FOUND: EYE, BORDER');
  try { documentRef.selection = null; } catch (error) {}
  try { app.redraw(); } catch (error) {}
}

function exportPreview(documentRef, outputPath) {
  ensureFolderForFile(outputPath);
  var outputFile = new File(outputPath);
  if (outputFile.exists) try { outputFile.remove(); } catch (error) {}
  var options = new ExportOptionsPNG24();
  options.artBoardClipping = true;
  options.horizontalScale = (96 / 72) * 100;
  options.verticalScale = (96 / 72) * 100;
  options.transparency = true;
  options.interlaced = false;
  options.antiAliasing = true;
  documentRef.exportFile(outputFile, ExportType.PNG24, options);
  if (!outputFile.exists) throw new Error('SHEET_PREVIEW_EXPORT_FAILED: ' + outputPath);
}

(function () {
  var documentRef = null;
  var openedByScript = false;
  var layerState = [];
  var originalInteractionLevel = null;
  try {
    try { originalInteractionLevel = app.userInteractionLevel; app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; } catch (error) {} 
    var opened = getOrOpenTemplate(CODEX_SHEET_PREVIEW_SOURCE_PATH);
    documentRef = opened.documentRef;
    openedByScript = opened.openedByScript;
    if (!documentRef) throw new Error('SHEET_PREVIEW_OPEN_FAILED: ' + CODEX_SHEET_PREVIEW_SOURCE_PATH);
    documentRef.activate();
    layerState = captureLayerState(documentRef);
    showEyeAndBorderOnly(documentRef);
    exportPreview(documentRef, CODEX_SHEET_PREVIEW_OUTPUT_PATH);
    writeResult(true, 'OK');
  } catch (error) {
    writeResult(false, String(error));
  } finally {
    try { if (originalInteractionLevel !== null) app.userInteractionLevel = originalInteractionLevel; } catch (error) {}
    if (documentRef !== null) {
      if (openedByScript) {
        try { documentRef.close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
      } else {
        restoreLayerState(layerState);
        try { app.redraw(); } catch (error) {}
      }
    }
  }
})();
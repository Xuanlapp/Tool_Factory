var CODEX_WAIT_PRINTED_SOURCE_PATH = "D:/FFACTORY/Arcylic/wait/wait_5-5.ai";
var CODEX_WAIT_PRINTED_RESULT_PATH = "D:/FFACTORY/Arcylic/.runtime/wait-printed-result.json";
var CODEX_WAIT_PRINTED_MANIFEST_PATH = "D:/FFACTORY/Arcylic/wait/wait_5-5.manifest.json";
﻿function normalizePath(value) {
  try { return String(value).replace(/\\/g, '/').toLowerCase(); } catch (error) {}
  return '';
}

function writeResult(success, message) {
  var file = new File(CODEX_WAIT_PRINTED_RESULT_PATH);
  file.encoding = 'UTF-8';
  if (!file.open('w')) return;
  var safeMessage = String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  file.write('{"success":' + (success ? 'true' : 'false') + ',"message":"' + safeMessage + '"}');
  file.close();
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

function getOrOpenDocument(filePath) {
  closeRecoveredDocuments();
  var sourceFile = new File(filePath);
  if (!sourceFile.exists) throw new Error('WAIT_FILE_MISSING: ' + filePath);
  var targetPath = normalizePath(sourceFile.fsName || filePath);
  for (var index = 0; index < app.documents.length; index += 1) {
    try {
      var documentRef = app.documents[index];
      var documentPath = normalizePath(documentRef.fullName && documentRef.fullName.fsName ? documentRef.fullName.fsName : '');
      if (documentPath === targetPath) {
        documentRef.activate();
        return documentRef;
      }
    } catch (error) {}
  }
  return app.open(sourceFile);
}

function unlockLayer(layer) {
  try { layer.locked = false; } catch (error) {}
  try { layer.visible = true; } catch (error) {}
}

function clearLayerContents(layer) {
  unlockLayer(layer);
  for (var childIndex = layer.layers.length - 1; childIndex >= 0; childIndex -= 1) {
    try { clearLayerContents(layer.layers[childIndex]); } catch (error) {}
  }
  for (var itemIndex = layer.pageItems.length - 1; itemIndex >= 0; itemIndex -= 1) {
    try {
      var item = layer.pageItems[itemIndex];
      try { item.locked = false; } catch (error) {}
      item.remove();
    } catch (error) {}
  }
}

function findTopLayer(documentRef, layerName) {
  var target = String(layerName).toLowerCase();
  for (var index = 0; index < documentRef.layers.length; index += 1) {
    var layer = documentRef.layers[index];
    if (String(layer.name || '').toLowerCase() === target) return layer;
  }
  return null;
}

(function () {
  var originalInteractionLevel = null;
  try {
    try { originalInteractionLevel = app.userInteractionLevel; app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; } catch (error) {}
    var documentRef = getOrOpenDocument(CODEX_WAIT_PRINTED_SOURCE_PATH);
    documentRef.activate();
    var cleared = [];
    var layerNames = ['FRONT', 'BACK', 'LAZER'];
    for (var index = 0; index < layerNames.length; index += 1) {
      var layer = findTopLayer(documentRef, layerNames[index]);
      if (layer !== null) {
        clearLayerContents(layer);
        cleared.push(layerNames[index]);
      }
    }
    if (cleared.length === 0) throw new Error('PRINTED_LAYERS_NOT_FOUND: FRONT, BACK, LAZER');
    documentRef.save();
    try { documentRef.close(SaveOptions.SAVECHANGES); } catch (closeError) {}
    try {
      var manifestFile = new File(CODEX_WAIT_PRINTED_MANIFEST_PATH);
      var manifest = {};
      if (manifestFile.exists && manifestFile.open('r')) { var raw = manifestFile.read(); manifestFile.close(); try { manifest = JSON.parse(raw); } catch (parseError) {} }
      manifest.printed = true;
      manifest.printedAt = new Date().toISOString();
      manifestFile.encoding = 'UTF-8';
      if (manifestFile.open('w')) { manifestFile.write(JSON.stringify(manifest, null, 2)); manifestFile.close(); }
    } catch (manifestError) {}
    writeResult(true, 'Đã xóa nội dung FRONT/BACK/LAZER và lưu file wait.');
  } catch (error) {
    writeResult(false, String(error));
    throw error;
  } finally {
    try { if (originalInteractionLevel !== null) app.userInteractionLevel = originalInteractionLevel; } catch (error) {}
  }
})();

function debugPipelineStep(stepName) {
  var enabled = false;
  try { enabled = typeof CODEX_DEBUG_PIPELINE !== 'undefined' && CODEX_DEBUG_PIPELINE === true; } catch (error) {}
  if (!enabled) return;
  try { app.redraw(); } catch (error) {}
  alert('DEBUG PIPELINE - ' + stepName + '\n\nBấm OK để chạy bước tiếp theo.');
}

function normalizePath(value) {
  try { return String(value).replace(/\\/g, '/').toLowerCase(); } catch (error) {}
  return '';
}

function ensureFolderForFile(filePath) {
  var file = new File(filePath);
  var folder = file.parent;
  if (!folder.exists && !folder.create()) throw new Error('CANNOT_CREATE_FOLDER: ' + folder.fsName);
}

function layerHasArtwork(layer) {
  if (layer === null) return false;
  try {
    if (layer.pageItems.length > 0) return true;
  } catch (error) {}
  try {
    if (layer.layers.length > 0) {
      for (var i = 0; i < layer.layers.length; i += 1) {
        if (layerHasArtwork(layer.layers[i])) return true;
      }
    }
  } catch (error) {}
  return false;
}

function findTopLayer(documentRef, layerName) {
  var wanted = String(layerName).toLowerCase();
  for (var i = 0; i < documentRef.layers.length; i += 1) {
    try {
      if (String(documentRef.layers[i].name).toLowerCase() === wanted) return documentRef.layers[i];
    } catch (error) {}
  }
  return null;
}

function exportLabelLayerName() { return 'EXPORT_LABEL'; }

function outputAiBaseName() {
  try {
    var file = new File(CODEX_OUTPUT_AI_PATH);
    return String(file.name || '').replace(/\.ai$/i, '');
  } catch (error) {}
  var rawPath = String(CODEX_OUTPUT_AI_PATH || '').replace(/\\/g, '/');
  var parts = rawPath.split('/');
  return String(parts[parts.length - 1] || '').replace(/\.ai$/i, '');
}

function rgb(red, green, blue) {
  var color = new RGBColor();
  color.red = red; color.green = green; color.blue = blue;
  return color;
}

function removeExportLabel(documentRef) {
  try {
    var layer = findTopLayer(documentRef, exportLabelLayerName());
    if (layer !== null) layer.remove();
  } catch (error) {}
}

function placeLabelInFreeSpace(documentRef, textFrame) {
  var artboard = documentRef.artboards[documentRef.artboards.getActiveArtboardIndex()].artboardRect;
  var artboardBounds = { left: artboard[0], top: artboard[1], right: artboard[2], bottom: artboard[3] };
  var current = textFrame.geometricBounds;
  var centeredLeft = artboardBounds.left + ((artboardBounds.right - artboardBounds.left) - (current[2] - current[0])) / 2;
  // Place the filename inside the template, directly below its top edge.
  textFrame.translate(centeredLeft - current[0], artboardBounds.top - current[1]);
}

function addExportFileNameLabel(documentRef) {
  removeExportLabel(documentRef);
  var layer = documentRef.layers.add();
  layer.name = exportLabelLayerName();
  layer.locked = false;
  layer.visible = true;
  var artboard = documentRef.artboards[documentRef.artboards.getActiveArtboardIndex()].artboardRect;
  var left = artboard[0];
  var top = artboard[1];
  var labelText = outputAiBaseName();
  var textFrame = layer.textFrames.add();
  textFrame.contents = labelText;
  textFrame.kind = TextType.POINTTEXT;
  textFrame.position = [left, top];
  try { textFrame.textRange.characterAttributes.size = 13; } catch (error) {}
  try { textFrame.textRange.characterAttributes.fillColor = rgb(20, 20, 20); } catch (error) {}
  try { textFrame.textRange.characterAttributes.textFont = app.textFonts.getByName('Arial-BoldMT'); } catch (error) {}
  try { textFrame.paragraphs[0].paragraphAttributes.justification = Justification.CENTER; } catch (error) {}
  placeLabelInFreeSpace(documentRef, textFrame);
  try { layer.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (error) {}
}

function setVisibleLayers(documentRef, visibleNames) {
  var wanted = {};
  for (var n = 0; n < visibleNames.length; n += 1) wanted[String(visibleNames[n]).toLowerCase()] = true;
  for (var i = 0; i < documentRef.layers.length; i += 1) {
    try {
      var layer = documentRef.layers[i];
      layer.locked = false;
      layer.visible = wanted[String(layer.name).toLowerCase()] === true;
    } catch (error) {}
  }
  try { documentRef.selection = null; } catch (error) {}
  try { app.redraw(); } catch (error) {}
}

function exportPng300(documentRef, outputPath, visibleLayers) {
  ensureFolderForFile(outputPath);
  setVisibleLayers(documentRef, visibleLayers);
  debugPipelineStep('?? b?t layer ?? export PNG: ' + visibleLayers.join(' + '));
  var outputFile = new File(outputPath);
  if (outputFile.exists) try { outputFile.remove(); } catch (error) {}
  var options = new ExportOptionsPNG24();
  options.artBoardClipping = true;
  options.horizontalScale = (300 / 72) * 100;
  options.verticalScale = (300 / 72) * 100;
  options.transparency = true;
  options.interlaced = false;
  options.antiAliasing = true;
  try { options.antiAliasingMethod = AntiAliasingMethod.TYPEOPTIMIZED; } catch (error) {}
  debugPipelineStep('Chu?n b? Export PNG 300ppi: ' + outputPath);
  documentRef.exportFile(outputFile, ExportType.PNG24, options);
  debugPipelineStep('?? Export PNG xong: ' + outputPath);
  if (!outputFile.exists) throw new Error('PNG_EXPORT_FAILED: ' + outputPath);
}

function selectAllInContainer(container) {
  var count = 0;
  try {
    for (var itemIndex = 0; itemIndex < container.pageItems.length; itemIndex += 1) {
      try {
        container.pageItems[itemIndex].locked = false;
        container.pageItems[itemIndex].hidden = false;
        container.pageItems[itemIndex].selected = true;
        count += 1;
      } catch (error) {}
    }
  } catch (error) {}
  try {
    for (var layerIndex = 0; layerIndex < container.layers.length; layerIndex += 1) count += selectAllInContainer(container.layers[layerIndex]);
  } catch (error) {}
  return count;
}

function selectAllInLayer(documentRef, layer) {
  documentRef.selection = null;
  if (layer === null) return 0;
  return selectAllInContainer(layer);
}

function copyLazerInPlace(sourceDocument, targetDocument) {
  sourceDocument.activate();
  var sourceLayer = findTopLayer(sourceDocument, 'LAZER');
  if (sourceLayer === null || !layerHasArtwork(sourceLayer)) sourceLayer = findTopLayer(sourceDocument, 'BORDER');
  if (sourceLayer === null || !layerHasArtwork(sourceLayer)) throw new Error('LAZER_AND_BORDER_LAYER_EMPTY');
  setVisibleLayers(sourceDocument, [sourceLayer.name]);
  var selectedCount = selectAllInLayer(sourceDocument, sourceLayer);
  if (selectedCount <= 0) throw new Error('LAZER_AND_BORDER_LAYER_EMPTY');
  app.executeMenuCommand('copy');
  targetDocument.activate();
  var targetLayer = findTopLayer(targetDocument, 'LAZER');
  if (targetLayer === null) {
    targetLayer = targetDocument.layers.add();
    targetLayer.name = 'LAZER';
  }
  targetLayer.locked = false;
  targetLayer.visible = true;
  targetDocument.activeLayer = targetLayer;
  try {
    app.executeMenuCommand('pasteInPlace');
  } catch (error) {
    app.executeMenuCommand('pasteFront');
  }
  try {
    var pasted = targetDocument.selection;
    for (var i = 0; i < pasted.length; i += 1) pasted[i].move(targetLayer, ElementPlacement.PLACEATBEGINNING);
  } catch (error) {}
  targetDocument.selection = null;
}

function saveLazerIllustrator8(sourceDocument, templatePath, outputPath) {
  ensureFolderForFile(outputPath);
  var templateFile = new File(templatePath);
  if (!templateFile.exists) throw new Error('LAZER_TEMPLATE_MISSING: ' + templatePath);
  debugPipelineStep('Chu?n b? m? Template_Lazer.ai');
  var targetDocument = app.open(templateFile);
  debugPipelineStep('?? m? Template_Lazer.ai');
  copyLazerInPlace(sourceDocument, targetDocument);
  debugPipelineStep('?? copy LAZER v? paste in place v?o Template_Lazer');
  var outputFile = new File(outputPath);
  if (outputFile.exists) try { outputFile.remove(); } catch (error) {}
  var options = new IllustratorSaveOptions();
  options.compatibility = Compatibility.ILLUSTRATOR8;
  options.pdfCompatible = false;
  try { options.compressed = true; } catch (error) {}
  debugPipelineStep('Chu?n b? Save As LAZER Illustrator 8');
  targetDocument.saveAs(outputFile, options);
  debugPipelineStep('?? Save As LAZER Illustrator 8 xong');
  if (!outputFile.exists) throw new Error('LAZER_SAVE_FAILED: ' + outputPath);
  try { targetDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
}

function findOpenOutputDocument(outputPath) {
  var targetFile = new File(outputPath);
  var targetPath = normalizePath(targetFile.fsName || outputPath);
  var targetName = String(targetFile.name).toLowerCase();
  for (var i = 0; i < app.documents.length; i += 1) {
    try {
      var documentRef = app.documents[i];
      var documentPath = normalizePath(documentRef.fullName && documentRef.fullName.fsName ? documentRef.fullName.fsName : '');
      if (documentPath === targetPath || String(documentRef.name).toLowerCase() === targetName) {
        return documentRef;
      }
    } catch (error) {}
  }
  return null;
}

function writeResult(success, message) {
  try {
    var file = new File(CODEX_EXPORT_RESULT_PATH);
    file.encoding = 'UTF-8';
    file.open('w');
    file.write('{"success":' + (success ? 'true' : 'false') + ',"message":"' + String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '","backExported":' + (typeof CODEX_BACK_EXPORTED !== 'undefined' && CODEX_BACK_EXPORTED ? 'true' : 'false') + '}');
    file.close();
  } catch (error) {}
}

function closeAllDocuments() {
  try {
    for (var i = app.documents.length - 1; i >= 0; i -= 1) {
      try { app.documents[i].close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
    }
  } catch (error) {}
}

function runExportStep(stepName, operation) {
  try {
    return operation();
  } catch (error) {
    throw new Error(stepName + ': ' + String(error));
  }
}

function run() {
  var sourceDocument = null;
  try {
    var sourceFile = new File(CODEX_OUTPUT_AI_PATH);
    if (!sourceFile.exists) throw new Error('OUTPUT_AI_MISSING: ' + CODEX_OUTPUT_AI_PATH);
    debugPipelineStep('Chu?n b? m? output_ai');
    sourceDocument = findOpenOutputDocument(CODEX_OUTPUT_AI_PATH);
    if (sourceDocument === null) sourceDocument = runExportStep('OPEN_OUTPUT_AI', function () { return app.open(sourceFile); });
    debugPipelineStep('?? m? output_ai');
    var exportFront = typeof CODEX_EXPORT_FRONT === 'undefined' || CODEX_EXPORT_FRONT === true;
    var exportBack = typeof CODEX_EXPORT_BACK === 'undefined' || CODEX_EXPORT_BACK === true;
    var exportLazer = typeof CODEX_EXPORT_LAZER === 'undefined' || CODEX_EXPORT_LAZER === true;
    runExportStep('ADD_EXPORT_LABEL', function () { addExportFileNameLabel(sourceDocument); });
    if (exportFront) runExportStep('EXPORT_FRONT_PNG', function () { exportPng300(sourceDocument, CODEX_OUTPUT_FRONT_PATH, ['EYE', 'FRONT', exportLabelLayerName()]); });
    var backLayer = findTopLayer(sourceDocument, 'BACK');
    var hasBackArtwork = backLayer !== null && layerHasArtwork(backLayer);
    var backExported = exportBack && hasBackArtwork;
    if (backExported) {
      runExportStep('EXPORT_BACK_PNG', function () { exportPng300(sourceDocument, CODEX_OUTPUT_BACK_PATH, ['BACK', exportLabelLayerName()]); });
    } else if (exportBack) {
      try {
        var backFile = new File(CODEX_OUTPUT_BACK_PATH);
        if (backFile.exists) backFile.remove();
      } catch (cleanupError) {}
    }
    CODEX_BACK_EXPORTED = backExported;
    removeExportLabel(sourceDocument);
    if (exportLazer) runExportStep('EXPORT_LAZER_AI', function () { saveLazerIllustrator8(sourceDocument, CODEX_LAZER_TEMPLATE_PATH, CODEX_OUTPUT_LAZER_PATH); });
    writeResult(true, 'OK');
  } catch (error) {
    writeResult(false, String(error));
    closeAllDocuments();
    try { app.quit(); } catch (quitError) {}
    throw error;
  }
  closeAllDocuments();
  try { app.quit(); } catch (error) {}
}

run();

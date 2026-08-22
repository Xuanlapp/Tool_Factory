function normalizedPath(value) {
  try { return String(value).replace(/\\/g, '/').toLowerCase(); } catch (error) {}
  return '';
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
  closeRecoveredDocuments();
  var templateFile = new File(templatePath);
  var targetPath = normalizedPath(templateFile.fsName || templatePath);
  var templateName = String(templateFile.name).toLowerCase();
  for (var i = 0; i < app.documents.length; i += 1) {
    try {
      var documentRef = app.documents[i];
      var documentPath = normalizedPath(documentRef.fullName && documentRef.fullName.fsName ? documentRef.fullName.fsName : documentRef.fullName);
      if (documentPath === targetPath || String(documentRef.name).toLowerCase() === templateName) {
        documentRef.activate();
        return documentRef;
      }
    } catch (error) {}
  }
  return app.open(templateFile);
}

function keepIllustratorWarm() {
  try {
    if (app.documents.length <= 1) app.documents.add();
  } catch (error) {}
}

function closeAllDocumentsWithoutSaving() {
  try {
    for (var i = app.documents.length - 1; i >= 0; i -= 1) {
      try { app.documents[i].close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
    }
  } catch (error) {}
}

function embedLinkedImages(documentRef) {
  var linked = [];
  try {
    for (var i = 0; i < documentRef.placedItems.length; i += 1) linked.push(documentRef.placedItems[i]);
  } catch (error) {}
  for (var j = 0; j < linked.length; j += 1) {
    try { linked[j].embed(); } catch (error) { throw new Error('EMBED_LINKED_IMAGE_FAILED: ' + String(error)); }
  }
}

function debugPipelineStep(stepName) {
  var enabled = false;
  try { enabled = typeof CODEX_DEBUG_PIPELINE !== 'undefined' && CODEX_DEBUG_PIPELINE === true; } catch (error) {}
  if (!enabled) return;
  try { app.redraw(); } catch (error) {}
  alert('DEBUG PIPELINE - ' + stepName + '\n\nBấm OK để chạy bước tiếp theo.');
}

function writeSaveResult(saved, message) {
  if (typeof CODEX_SAVE_RESULT_PATH === 'undefined' || !CODEX_SAVE_RESULT_PATH) return;
  try {
    var file = new File(CODEX_SAVE_RESULT_PATH);
    file.encoding = 'UTF-8';
    file.open('w');
    file.write('{"saved":' + (saved ? 'true' : 'false') + ',"message":"' + String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}');
    file.close();
  } catch (error) {}
}

function run() {
  var documentRef = getOrOpenTemplate(CODEX_TEMPLATE_PATH);
  var saved = false;
  var message = '';
  var outputFile = new File(CODEX_OUTPUT_AI_PATH);
  var templateFile = new File(CODEX_TEMPLATE_PATH);
  var sameOutputAsTemplate = normalizedPath(outputFile.fsName || CODEX_OUTPUT_AI_PATH) === normalizedPath(templateFile.fsName || CODEX_TEMPLATE_PATH);
  var tempFile = new File(String(CODEX_OUTPUT_AI_PATH).replace(/\.ai$/i, '.saving.ai'));
  var tempFileWithExtraExtension = new File(tempFile.fsName + '.ai');
  var options = new IllustratorSaveOptions();
  options.pdfCompatible = false;
  options.compressed = true;
  try {
    documentRef.activate();
    if (typeof CODEX_EMBED_LINKED_IMAGES !== 'undefined' && CODEX_EMBED_LINKED_IMAGES === true) embedLinkedImages(documentRef);
    if (sameOutputAsTemplate) {
      debugPipelineStep('Chuan bi Save AI same path');
      documentRef.save();
      debugPipelineStep('Save AI same path xong');
      if (!outputFile.exists) throw new Error('SAME_PATH_SAVE_FAILED');
      saved = true;
    } else {
      if (tempFile.exists) try { tempFile.remove(); } catch (cleanupError) {}
      if (tempFileWithExtraExtension.exists) try { tempFileWithExtraExtension.remove(); } catch (cleanupError) {}
      debugPipelineStep('Chuan bi Save As AI');
      documentRef.saveAs(tempFile, options);
      debugPipelineStep('Save As AI xong');
      var actualTempFile = tempFile.exists ? tempFile : (tempFileWithExtraExtension.exists ? tempFileWithExtraExtension : null);
      if (actualTempFile === null) throw new Error('TEMP_SAVE_FILE_NOT_FOUND');
      var extensionlessOutputFile = new File(String(outputFile.fsName).replace(/\.ai$/i, ''));
      try { if (outputFile.exists) outputFile.remove(); } catch (cleanupError) {}
      try { if (extensionlessOutputFile.exists) extensionlessOutputFile.remove(); } catch (cleanupError) {}
      try { actualTempFile.rename(outputFile.name.replace(/\.ai$/i, '')); } catch (renameError) {
        try { actualTempFile.copy(outputFile.fsName); actualTempFile.remove(); } catch (copyError) { throw copyError; }
      }
      if (!outputFile.exists && extensionlessOutputFile.exists) {
        try { extensionlessOutputFile.copy(outputFile.fsName); extensionlessOutputFile.remove(); } catch (copyError) { throw copyError; }
      }
      if (!outputFile.exists) throw new Error('TEMP_SAVE_FAILED');
      saved = true;
    }
  } catch (error) {
    message = String(error);
  }
  debugPipelineStep('Ghi k?t qu? save');
  writeSaveResult(saved, message);
  if (!saved) throw new Error(message || 'SAVE_AI_FAILED');
  var shouldQuit = false;
  try { shouldQuit = typeof CODEX_QUIT_ILLUSTRATOR_AFTER_SAVE !== 'undefined' && CODEX_QUIT_ILLUSTRATOR_AFTER_SAVE === true; } catch (error) {}
  if (shouldQuit) {
    closeAllDocumentsWithoutSaving();
    try { app.quit(); } catch (quitError) {}
    return;
  }
  var shouldClose = true;
  try { if (typeof CODEX_CLOSE_AFTER_SAVE !== 'undefined') shouldClose = CODEX_CLOSE_AFTER_SAVE !== false; } catch (error) {}
  if (shouldClose) {
    try { documentRef.close(SaveOptions.DONOTSAVECHANGES); } catch (closeError) {}
  }
}


run();


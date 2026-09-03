(function () {
  var resultPath = typeof CODEX_STICKER_ACTION_RESULT_PATH !== 'undefined' ? CODEX_STICKER_ACTION_RESULT_PATH : '';
  function writeResult(success, message) {
    if (!resultPath) return;
    try {
      var file = new File(resultPath);
      file.encoding = 'UTF-8';
      file.open('w');
      file.write('{"success":' + (success ? 'true' : 'false') + ',"message":"' + String(message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}');
      file.close();
    } catch (error) {}
  }
  try {
    var actionFile = new File(CODEX_STICKER_ACTION_PATH);
    if (!actionFile.exists) throw new Error('Không tìm thấy file Action: ' + actionFile.fsName);
    // Replace the existing set so every machine uses the packaged version.
    try { app.unloadAction('My set', ''); } catch (unloadError) {}
    app.loadAction(actionFile);
    writeResult(true, 'Đã thay Action Set My set bằng bản mới trong app.');
  } catch (error) {
    var message = String(error);
    writeResult(false, message);
    throw error;
  }
}());

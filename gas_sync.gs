/**
 * ZODIAC OPS CENTER - DATA SYNC SERVICE v5.4
 *
 * Changes from v5.3:
 *   - SECURITY: shared secret check — rejects requests without correct secret
 *   - Headers changed to English
 */

const GAS_SECRET = "zodiac-2026-cmuh"; // must match CONFIG.GAS_SECRET in zzzzzz.html

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Server busy, please retry.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("No data received");

    const data = JSON.parse(e.postData.contents);

    if (data.secret !== GAS_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sessionId = data.sessionId;
    const rowsPayload = data.rows || [];
    if (!sessionId) throw new Error("Missing session ID");

    // 依學號排序，確保名單整齊
    rowsPayload.sort((a, b) => (a.studentId || "").toString().localeCompare((b.studentId || "").toString()));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sessionId);
    if (!sheet) sheet = ss.insertSheet(sessionId);

    const headers = [
      "Student ID",               "Name",                     "Zodiac",
      "Total Score",              "Status",
      "Group A: Calibration (5%)","Group A: Reading (15%)",   "Group A: Interactive (15%)",
      "Group A: Quiz (25%)",      "Group A: Reflection (10%)",
      "Group B: Assignment (15%)","Group B: Role",            "Group B: Contributions",
      "Group B: Gallery",
      "Feedback",                 "Self Score (1-5)",         "Warmup Confidence (1-5)",
      "Flags (Speedrun)",         "Last Sync"
    ]; // 19 cols

    // 永遠明確寫入第 1 列標題（避免 appendRow 因 lastRow 偏移導致標題消失）
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");

    // 清除舊資料列，保留標題
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }

    // 計分與欄位映射
    const outputRows = rowsPayload.map(r => {
      let score = 0, tags = [];

      if (r.calibration === 1) score += 5;
      if (r.rating      === 1) score += 10;
      if (r.assignment  === 1) score += 15;
      if (r.gallery     === 1) score += 15;  // v5.3: gallery 納入計分

      if (r.notebook === 1) {
        const d = Number(r.notebook_duration) || 0;
        if (d > 0 && d < 15) { score += 5;  tags.push(`ReadTooFast(${d}s)`); } else { score += 15; }
      }
      if (r.slido === 1) {
        const d = Number(r.slido_duration) || 0;
        if (d > 0 && d < 5)  { score += 5;  tags.push(`SlidoTooFast(${d}s)`); } else { score += 15; }
      }
      if (r.forms === 1) {
        const d = Number(r.forms_duration) || 0;
        if (d > 0 && d < 20) { score += 10; tags.push(`FormTooFast(${d}s)`); } else { score += 25; }
      }
      if (r.role === 'leader') {
        score += Math.min(10, (Number(r.leader_rating) || 0) * 2);
      }

      const now = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

      return [
        r.studentId || "",                                                                        //  1 學號
        r.name      || "",                                                                        //  2 姓名
        r.zodiac    || "",                                                                        //  3 生肖
        score,                                                                                    //  4 總分
        "Synced",                                                                                  //  5 Status
        r.calibration === 1 ? "OK" : "",                                                         //  6 校準
        r.notebook    === 1 ? ((r.notebook_duration || 0) + "s") : "",                          //  7 閱讀
        r.slido       === 1 ? ((r.slido_duration    || 0) + "s") : "",                          //  8 互動
        r.forms       === 1 ? ((r.forms_duration    || 0) + "s") : "",                          //  9 測驗
        r.rating      === 1 ? "OK" : "",                                                         // 10 反思
        r.assignment  === 1 ? "OK(15)" : "",                                                     // 11 作業/專案
        r.assignment_role === 'leader' ? "Leader" : (r.assignment_role === 'member' ? "Member" : ""), // 12 Role
        r.contributions || "",                                                                    // 13 協作貢獻
        r.gallery     === 1 ? "OK(15)" : "",                                                     // 14 展覽完成
        r.feedback    || "",                                                                      // 15 心得 (plain text)
        r.self_score  || "",                                                                      // 16 課末自評分
        r.calibration_confidence || "",                                                           // 17 暖身信心
        tags.join(", "),                                                                          // 18 異常標記
        now                                                                                       // 19 最後連線時間
      ];
    });

    if (outputRows.length > 0) {
      sheet.getRange(2, 1, outputRows.length, headers.length).setValues(outputRows);
    }

    // 同步時間戳記寫在第 20 欄第 1 列（標題列右側）
    const nowHeader = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    sheet.getRange(1, headers.length + 1).setValue("Last sync: " + nowHeader);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      rowCount: outputRows.length,
      message: `Successfully synced ${outputRows.length} rows to [${sessionId}]`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

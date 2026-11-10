/**
 * =========================================================================================
 * GOOGLE APPS SCRIPT - AUTO UPLOAD BUKTI KE GOOGLE DRIVE & SINKRONISASI SHEET BUKTITRANSFER
 * =========================================================================================
 * Folder Google Drive: BuktiFoto (ID: 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB)
 * Parent Folder: WARGA CLEOPATRA (ID: 1nFboWcdPdbncsrub31vzd3jgLRZOaZo_)
 * Spreadsheet ID: 1CzNnjH8-j8XR6UkQcP2qtFAY2jX28IVJoVWGeXJkxIw
 * Target Sheet: BuktiTransfer (GID: 4652474)
 *
 * PANDUAN PEMASANGAN:
 * 1. Buka spreadsheet "DataIuranCleopatra" di browser:
 *    https://docs.google.com/spreadsheets/d/1CzNnjH8-j8XR6UkQcP2qtFAY2jX28IVJoVWGeXJkxIw
 * 2. Klik menu "Ekstensi" (Extensions) > "Apps Script".
 * 3. Hapus seluruh isi kode lama yang ada di editor, lalu salin dan tempel SEMUA kode di bawah ini.
 * 4. Klik tombol "Simpan" (ikon disket).
 * 5. Klik "Terapkan" (Deploy) di kanan atas > pilih "Deployment baru" (New deployment).
 * 6. Klik ikon roda gigi di samping "Pilih jenis" > pilih "Aplikasi Web" (Web App).
 * 7. Isi konfigurasi:
 *    - Deskripsi: Webhook Bukti Transfer & Drive RT 011 Cleopatra
 *    - Jalankan sebagai (Execute as): "Saya" (Me / email Anda)
 *    - Siapa yang memiliki akses (Who has access): "Siapa saja" (Anyone) -> WAJIB agar aplikasi Next.js bisa memanggil webhook!
 * 8. Klik tombol "Terapkan" (Deploy).
 * 9. Berikan izin akses (Authorize access) dan pilih akun Google Anda.
 * 10. Salin "URL Aplikasi Web" (Web app URL) yang berakhiran "/exec".
 * 11. Masuk ke halaman Admin Web IPL Cleopatra > menu "Pengaturan RT", tempel URL tersebut di kolom "Webhook Google Drive / Apps Script", lalu klik Simpan.
 * =========================================================================================
 */

var TARGET_FOLDER_ID = "1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB";
var SPREADSHEET_ID = "1CzNnjH8-j8XR6UkQcP2qtFAY2jX28IVJoVWGeXJkxIw";
var SHEET_BUKTI_NAME = "BuktiTransfer";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ success: false, error: "Tidak ada data yang dikirim" });
    }

    var data = JSON.parse(e.postData.contents);
    var action = data.action || "upload_file";

    // 0. Aksi Append Baris ke Sheet Apapun (DataIuran, DataPengeluaran, RiwayatPelunasan, DataKasbon, dsb.)
    if (action === "append_row" || action === "append_rows") {
      var targetSheetName = data.sheetName || "DataIuran";
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(targetSheetName);
      if (!sheet) {
        sheet = ss.insertSheet(targetSheetName);
      }

      var rowsToAdd = [];
      if (action === "append_rows" && Array.isArray(data.rows)) {
        rowsToAdd = data.rows;
      } else if (Array.isArray(data.row)) {
        rowsToAdd = [data.row];
      }

      for (var i = 0; i < rowsToAdd.length; i++) {
        sheet.appendRow(rowsToAdd[i]);
      }

      return responseJson({
        success: true,
        message: "Berhasil menambahkan " + rowsToAdd.length + " baris ke sheet " + targetSheetName,
        sheetName: targetSheetName,
        count: rowsToAdd.length
      });
    }

    // 0.1 Aksi Hapus Baris Berdasarkan ID di Kolom Tertentu (Misal: Transaksi ID di Kolom 9 DataIuran)
    if (action === "delete_row") {
      var targetSheetName = data.sheetName || "DataIuran";
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(targetSheetName);
      var deleted = false;
      if (sheet) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var colIndex = data.colIndex || 9;
          var values = sheet.getRange(1, colIndex, lastRow, 1).getValues();
          for (var r = values.length - 1; r >= 1; r--) {
            if (values[r][0] && values[r][0].toString() === data.rowId.toString()) {
              sheet.deleteRow(r + 1);
              deleted = true;
              break;
            }
          }
        }
      }
      return responseJson({
        success: true,
        deleted: deleted,
        message: deleted ? "Baris berhasil dihapus dari sheet " + targetSheetName : "Baris tidak ditemukan"
      });
    }

    // 1. Aksi Verifikasi Bukti -> Simpan / Update ke Sheet BuktiTransfer
    if (action === "verify_bukti") {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(SHEET_BUKTI_NAME);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_BUKTI_NAME);
        sheet.appendRow([
          "Waktu Upload", "Nama Warga", "Nominal Transf", "Keterangan", "Link Google Drive",
          "Kategori", "Bulan", "Status", "Bukti ID", "Warga ID", "Blok",
          "Diverifikasi Pada", "Diverifikasi Oleh", "Catatan Admin", "Transaksi ID"
        ]);
      }

      var waktuUpload = data.waktuUpload || Utilities.formatDate(new Date(), "Asia/Jakarta", "M/d/yyyy HH:mm:ss");
      var namaWarga = data.namaWarga || "";
      var nominal = data.nominal || 0;
      var keterangan = data.keterangan || "";
      var driveLink = data.fileUrl || data.driveUrl || "";
      var kategori = data.kategori || "Iuran Bulanan";
      var bulan = data.bulan || "";
      var status = data.status || "Terverifikasi";
      var buktiId = data.buktiId || ("BKT-" + new Date().getTime());
      var residentId = data.wargaId || "";
      var blok = data.blok || "";
      var verifiedAt = data.verifiedAt || Utilities.formatDate(new Date(), "Asia/Jakarta", "M/d/yyyy HH:mm:ss");
      var verifiedBy = data.verifiedBy || "Bendahara RT";
      var adminNote = data.adminNote || "";
      var transactionId = data.transactionId || "";

      // Cek apakah Bukti ID sudah pernah ada di sheet untuk diupdate, atau tambahkan row baru
      var existingRowIndex = -1;
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var ids = sheet.getRange(2, 9, lastRow - 1, 1).getValues(); // Kolom 9 = Bukti ID
        for (var r = 0; r < ids.length; r++) {
          if (ids[r][0] && ids[r][0].toString() === buktiId.toString()) {
            existingRowIndex = r + 2;
            break;
          }
        }
      }

      var rowValues = [
        waktuUpload,
        namaWarga,
        nominal,
        keterangan,
        driveLink,
        kategori,
        bulan,
        status,
        buktiId,
        residentId,
        blok,
        verifiedAt,
        verifiedBy,
        adminNote,
        transactionId
      ];

      if (existingRowIndex > 0) {
        sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }

      return responseJson({
        success: true,
        message: "Data bukti transfer berhasil disimpan ke sheet BuktiTransfer",
        buktiId: buktiId,
        linkGoogleDrive: driveLink
      });
    }

    // 2. Aksi Upload File Base64 ke Folder Google Drive 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB
    var folderId = data.folderId || TARGET_FOLDER_ID;
    var folder = DriveApp.getFolderById(folderId);

    var contentType = data.mimetype || "image/jpeg";
    var filename = data.filename || ("bukti_" + new Date().getTime() + ".jpg");
    var bytes = Utilities.base64Decode(data.base64);
    var blob = Utilities.newBlob(bytes, contentType, filename);

    var file = folder.createFile(blob);
    // Berikan izin view agar dapat dibuka oleh link publik/warga
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileUrl = file.getUrl();

    // Jika data juga menyertakan info bukti (nama warga dll), otomatis catat ke sheet BuktiTransfer
    if (data.namaWarga || data.buktiId) {
      try {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = ss.getSheetByName(SHEET_BUKTI_NAME);
        if (sheet) {
          sheet.appendRow([
            Utilities.formatDate(new Date(), "Asia/Jakarta", "M/d/yyyy HH:mm:ss"),
            data.namaWarga || "",
            data.nominal || 0,
            data.keterangan || "",
            fileUrl,
            data.kategori || "Iuran Bulanan",
            data.bulan || "",
            data.status || "Menunggu Verifikasi",
            data.buktiId || ("BKT-" + new Date().getTime()),
            data.wargaId || "",
            data.blok || "",
            "", "", "", ""
          ]);
        }
      } catch (sheetErr) {
        Logger.log("Error appending to sheet BuktiTransfer: " + sheetErr);
      }
    }

    return responseJson({
      success: true,
      fileUrl: fileUrl,
      downloadUrl: file.getDownloadUrl(),
      fileId: file.getId(),
      filename: filename
    });
  } catch (err) {
    return responseJson({
      success: false,
      error: err.toString()
    });
  }
}

function doGet(e) {
  return responseJson({
    status: "active",
    message: "Google Drive & BuktiTransfer Sync Webhook Siap Digunakan",
    folderId: TARGET_FOLDER_ID,
    spreadsheetId: SPREADSHEET_ID,
    sheetName: SHEET_BUKTI_NAME
  });
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

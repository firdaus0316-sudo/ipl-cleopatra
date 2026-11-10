import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { formatDateIndo, MONTH_NAMES_ID, normalizePeriodCode, isIncomeInPeriod } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getPeriodLabel(code: string, year: number): string {
  if (code === 'ALL') return `Semua Bulan (${year})`;
  if (/^\d{4}-\d{2}$/.test(code)) {
    const [y, m] = code.split('-');
    return `${MONTH_NAMES_ID[m] || m} ${y}`;
  }
  return code;
}

function isExpenseInPeriod(exp: any, targetPeriod: string, year: number): boolean {
  if (exp.status !== 'Sah') return false;
  if (targetPeriod === 'ALL') {
    return Boolean(exp.tanggal && exp.tanggal.startsWith(String(year)));
  } else {
    const normTarget = normalizePeriodCode(targetPeriod);
    return Boolean(exp.tanggal && exp.tanggal.startsWith(normTarget));
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedTargetPeriod = searchParams.get('period') || '2026-11';
    const requestedYear =
      Number(searchParams.get('year')) ||
      (requestedTargetPeriod && requestedTargetPeriod.startsWith('20')
        ? Number(requestedTargetPeriod.slice(0, 4))
        : 2026);

    const isAll = requestedTargetPeriod === 'ALL';
    const periodLabel = getPeriodLabel(requestedTargetPeriod, requestedYear);
    const db = getDb();
    const todayStr = new Date().toISOString().slice(0, 10);
    const tanggalCetakIndo = formatDateIndo(todayStr);

    // Filter valid incomes & expenses
    const validIncomes = db.incomes.filter((i) => i.status === 'Sah');
    const validExpenses = db.expenses.filter((e) => e.status === 'Sah');

    // Filter per selected period
    const reportIncomes = validIncomes.filter((i) => isIncomeInPeriod(i, requestedTargetPeriod, requestedYear));
    const reportExpenses = validExpenses.filter((e) => isExpenseInPeriod(e, requestedTargetPeriod, requestedYear));

    // Compute 12-month running cashflow
    let currentRunningSaldo = db.settings.saldoAwal || 0;
    const monthNumbers = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const twelveMonths = monthNumbers.map((mNum, idx) => {
      const pCode = `${requestedYear}-${mNum}`;
      const mIncomes = validIncomes.filter((i) => isIncomeInPeriod(i, pCode, requestedYear));
      const mExpenses = validExpenses.filter((e) => isExpenseInPeriod(e, pCode, requestedYear));

      const masuk = mIncomes.reduce((s, i) => s + i.nominal, 0);
      const keluar = mExpenses.reduce((s, e) => s + e.nominal, 0);
      const saldoAwalBulan = currentRunningSaldo;
      const surplusDefisit = masuk - keluar;
      const saldoAkhirBulan = saldoAwalBulan + surplusDefisit;
      currentRunningSaldo = saldoAkhirBulan;

      return {
        monthNumber: idx + 1,
        monthName: `${MONTH_NAMES_ID[mNum]} ${requestedYear}`,
        periodCode: pCode,
        saldoAwal: saldoAwalBulan,
        totalMasuk: masuk,
        totalKeluar: keluar,
        surplusDefisit,
        saldoAkhir: saldoAkhirBulan,
      };
    });

    let repSaldoAwal = 0;
    let repSaldoAkhir = 0;
    const repTotalMasuk = reportIncomes.reduce((s, i) => s + i.nominal, 0);
    const repTotalKeluar = reportExpenses.reduce((s, e) => s + e.nominal, 0);

    if (isAll) {
      repSaldoAwal = db.settings.saldoAwal || 0;
      repSaldoAkhir = repSaldoAwal + repTotalMasuk - repTotalKeluar;
    } else {
      const monthData = twelveMonths.find((m) => m.periodCode === requestedTargetPeriod);
      if (monthData) {
        repSaldoAwal = monthData.saldoAwal;
        repSaldoAkhir = monthData.saldoAkhir;
      } else {
        repSaldoAwal = db.settings.saldoAwal || 0;
        repSaldoAkhir = repSaldoAwal + repTotalMasuk - repTotalKeluar;
      }
    }

    // Initialize Excel Workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IPL Cleopatra - Pengurus RT 011 / RW 028';
    wb.created = new Date();

    // Load Logo Cleopatra image
    const logoPath = path.join(process.cwd(), 'public', 'logo-cleopatra.jpg');
    let logoImageId: number | null = null;
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoImageId = wb.addImage({
        buffer: logoBuffer as any,
        extension: 'jpeg',
      });
    }

    // Helper: Build Kop Surat on any worksheet
    const applyKopSurat = (ws: ExcelJS.Worksheet, maxColLetter = 'G') => {
      if (logoImageId !== null) {
        ws.addImage(logoImageId, {
          tl: { col: 0.2, row: 0.15 },
          ext: { width: 72, height: 72 },
        });
      }

      // Merge Kop Headers
      ws.mergeCells(`B1:${maxColLetter}1`);
      const r1 = ws.getCell('B1');
      r1.value = 'PENGURUS RT 011 / RW 028 CLUSTER CLEOPATRA';
      r1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
      r1.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`B2:${maxColLetter}2`);
      const r2 = ws.getCell('B2');
      r2.value = 'IPL CLEOPATRA - LAPORAN BULANAN';
      r2.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F172A' } };
      r2.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`B3:${maxColLetter}3`);
      const r3 = ws.getCell('B3');
      r3.value =
        'Laporan Pertanggungjawaban Pembukuan & Arus Kas Keuangan RT • Perumahan Griya Bukit Jaya Cluster Cleopatra, RT 011 / RW 028';
      r3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
      r3.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`B4:${maxColLetter}4`);
      const r4 = ws.getCell('B4');
      r4.value = `Periode: ${periodLabel}   |   Tanggal Cetak: Bekasi, ${tanggalCetakIndo}`;
      r4.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF059669' } };
      r4.alignment = { horizontal: 'center', vertical: 'middle' };

      // Row 5: Double bottom border line
      const maxColNum = maxColLetter.charCodeAt(0) - 64;
      for (let c = 1; c <= maxColNum; c++) {
        const cell = ws.getCell(5, c);
        cell.border = { bottom: { style: 'double', color: { argb: 'FF0F172A' } } };
      }
      ws.getRow(1).height = 20;
      ws.getRow(2).height = 26;
      ws.getRow(3).height = 18;
      ws.getRow(4).height = 18;
      ws.getRow(5).height = 8;
    };

    // Helper: Build Signature section on any worksheet
    const applySignatures = (ws: ExcelJS.Worksheet, startRow: number, maxColLetter = 'G') => {
      // Row: Kota & Tanggal
      const dateCell = ws.getCell(`${maxColLetter}${startRow}`);
      dateCell.value = `Bekasi, ${tanggalCetakIndo}`;
      dateCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF334155' } };
      dateCell.alignment = { horizontal: 'right' };

      // Row: Title Pengurus
      ws.mergeCells(`A${startRow + 1}:${maxColLetter}${startRow + 1}`);
      const titleCell = ws.getCell(`A${startRow + 1}`);
      titleCell.value = 'PENGURUS RT 011 / RW 028 CLUSTER CLEOPATRA';
      titleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Jabatan Row
      const rJabatan = startRow + 3;
      ws.getCell(`A${rJabatan}`).value = 'Bendahara RT 011';
      ws.getCell(`A${rJabatan}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`A${rJabatan}`).alignment = { horizontal: 'center' };

      ws.getCell(`D${rJabatan}`).value = 'Sekretaris RT 011';
      ws.getCell(`D${rJabatan}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`D${rJabatan}`).alignment = { horizontal: 'center' };

      ws.getCell(`F${rJabatan}`).value = 'Ketua RT 011 / RW 028';
      ws.getCell(`F${rJabatan}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`F${rJabatan}`).alignment = { horizontal: 'center' };

      // Names Row (after 4 blank rows for signature)
      const rName = rJabatan + 4;
      const bCell = ws.getCell(`A${rName}`);
      bCell.value = 'Eri Raihanul Firdaus';
      bCell.font = { name: 'Arial', size: 10, bold: true, underline: true };
      bCell.alignment = { horizontal: 'center' };

      const sCell = ws.getCell(`D${rName}`);
      sCell.value = 'Aris Setiawan';
      sCell.font = { name: 'Arial', size: 10, bold: true, underline: true };
      sCell.alignment = { horizontal: 'center' };

      const kCell = ws.getCell(`F${rName}`);
      kCell.value = 'Firmansyah';
      kCell.font = { name: 'Arial', size: 10, bold: true, underline: true };
      kCell.alignment = { horizontal: 'center' };

      // Role Subtext Row
      const rSub = rName + 1;
      ws.getCell(`A${rSub}`).value = '(Pengelola Keuangan RT)';
      ws.getCell(`A${rSub}`).font = { name: 'Arial', size: 8.5, color: { argb: 'FF64748B' } };
      ws.getCell(`A${rSub}`).alignment = { horizontal: 'center' };

      ws.getCell(`D${rSub}`).value = '(Administrasi & Catatan)';
      ws.getCell(`D${rSub}`).font = { name: 'Arial', size: 8.5, color: { argb: 'FF64748B' } };
      ws.getCell(`D${rSub}`).alignment = { horizontal: 'center' };

      ws.getCell(`F${rSub}`).value = '(Penanggung Jawab Lingkungan)';
      ws.getCell(`F${rSub}`).font = { name: 'Arial', size: 8.5, color: { argb: 'FF64748B' } };
      ws.getCell(`F${rSub}`).alignment = { horizontal: 'center' };
    };

    // ==========================================
    // SHEET 1: RINGKASAN KAS
    // ==========================================
    const wsSummary = wb.addWorksheet('Ringkasan Kas', {
      views: [{ showGridLines: true }],
    });
    wsSummary.columns = [
      { width: 7 }, // A
      { width: 22 }, // B
      { width: 20 }, // C
      { width: 22 }, // D
      { width: 22 }, // E
      { width: 20 }, // F
      { width: 24 }, // G
    ];

    applyKopSurat(wsSummary, 'G');

    // Section 1 Header: Ringkasan Saldo Kas
    wsSummary.mergeCells('A7:G7');
    const h1 = wsSummary.getCell('A7');
    h1.value = 'RINGKASAN SALDO KAS RT';
    h1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    h1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    wsSummary.getRow(7).height = 24;

    // Summary Table Headers
    const summaryHeaders = ['Komponen Kas', '', 'Keterangan', '', '', 'Nominal (Rp)', ''];
    wsSummary.mergeCells('A8:B8');
    wsSummary.getCell('A8').value = 'Komponen Kas';
    wsSummary.mergeCells('C8:E8');
    wsSummary.getCell('C8').value = 'Keterangan';
    wsSummary.mergeCells('F8:G8');
    wsSummary.getCell('F8').value = 'Nominal (Rp)';

    ['A8', 'B8', 'C8', 'D8', 'E8', 'F8', 'G8'].forEach((addr) => {
      const c = wsSummary.getCell(addr);
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    wsSummary.getRow(8).height = 22;

    const summaryRowsData = [
      {
        nama: 'Saldo Awal Kas',
        desc: isAll ? `Saldo Awal Tahun ${requestedYear}` : `Saldo Awal Periode ${periodLabel}`,
        nominal: repSaldoAwal,
        isBold: false,
        color: 'FF0F172A',
      },
      {
        nama: 'Penerimaan Kas (Masuk)',
        desc: `Total Penerimaan Kas Masuk Periode ${periodLabel}`,
        nominal: repTotalMasuk,
        isBold: false,
        color: 'FF1D4ED8',
      },
      {
        nama: 'Pengeluaran Kas (Keluar)',
        desc: `Total Pengeluaran Kas Belanja/Operasional Periode ${periodLabel}`,
        nominal: repTotalKeluar,
        isBold: false,
        color: 'FFBE123C',
      },
      {
        nama: 'Saldo Akhir Kas Tersisa',
        desc: isAll ? `Sisa Saldo Kas Tahun ${requestedYear}` : `Sisa Saldo Kas Akhir Periode ${periodLabel}`,
        nominal: repSaldoAkhir,
        isBold: true,
        color: 'FF047857',
      },
    ];

    summaryRowsData.forEach((row, i) => {
      const rNum = 9 + i;
      wsSummary.mergeCells(`A${rNum}:B${rNum}`);
      wsSummary.getCell(`A${rNum}`).value = row.nama;
      wsSummary.mergeCells(`C${rNum}:E${rNum}`);
      wsSummary.getCell(`C${rNum}`).value = row.desc;
      wsSummary.mergeCells(`F${rNum}:G${rNum}`);
      wsSummary.getCell(`F${rNum}`).value = row.nominal;

      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((col) => {
        const c = wsSummary.getCell(`${col}${rNum}`);
        c.font = { name: 'Arial', size: 10, bold: row.isBold, color: { argb: row.color } };
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (i % 2 === 1) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      });

      wsSummary.getCell(`A${rNum}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      wsSummary.getCell(`C${rNum}`).alignment = { horizontal: 'left', vertical: 'middle' };
      wsSummary.getCell(`F${rNum}`).alignment = { horizontal: 'right', vertical: 'middle' };
      wsSummary.getCell(`F${rNum}`).numFmt = '#,##0';
      wsSummary.getRow(rNum).height = 20;
    });

    let nextRow = 14;

    // Rekapitulasi 12 Bulan (Jika ALL)
    if (isAll) {
      nextRow = 15;
      wsSummary.mergeCells(`A${nextRow}:G${nextRow}`);
      const h2 = wsSummary.getCell(`A${nextRow}`);
      h2.value = `REKAPITULASI ARUS KAS 12 BULAN (TAHUN ${requestedYear})`;
      h2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      h2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      wsSummary.getRow(nextRow).height = 24;

      nextRow++;
      const headers12 = [
        'No',
        'Periode Bulan',
        'Saldo Awal (Rp)',
        'Pemasukan (Rp)',
        'Pengeluaran (Rp)',
        'Surplus / Defisit',
        'Saldo Akhir (Rp)',
      ];
      headers12.forEach((h, idx) => {
        const colLetter = String.fromCharCode(65 + idx);
        const cell = wsSummary.getCell(`${colLetter}${nextRow}`);
        cell.value = h;
        cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: idx === 0 ? 'center' : idx === 1 ? 'left' : 'right', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      wsSummary.getRow(nextRow).height = 22;

      twelveMonths.forEach((m) => {
        nextRow++;
        const rowValues = [
          m.monthNumber,
          m.monthName,
          m.saldoAwal,
          m.totalMasuk,
          m.totalKeluar,
          m.surplusDefisit,
          m.saldoAkhir,
        ];
        rowValues.forEach((val, idx) => {
          const colLetter = String.fromCharCode(65 + idx);
          const cell = wsSummary.getCell(`${colLetter}${nextRow}`);
          cell.value = val;
          cell.font = {
            name: 'Arial',
            size: 9.5,
            bold: idx === 1 || idx === 6,
            color: {
              argb:
                idx === 3
                  ? 'FF1D4ED8'
                  : idx === 4
                  ? 'FFBE123C'
                  : idx === 5
                  ? Number(val) >= 0
                    ? 'FF059669'
                    : 'FFBE123C'
                  : idx === 6
                  ? 'FF047857'
                  : 'FF0F172A',
            },
          };
          cell.alignment = {
            horizontal: idx === 0 ? 'center' : idx === 1 ? 'left' : 'right',
            vertical: 'middle',
          };
          if (idx >= 2) cell.numFmt = '#,##0';
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          if (m.monthNumber % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        });
        wsSummary.getRow(nextRow).height = 19;
      });

      // Total Row 12 Bulan
      nextRow++;
      const totalRow = [
        '',
        `TOTAL TAHUN ${requestedYear}`,
        db.settings.saldoAwal || 0,
        repTotalMasuk,
        repTotalKeluar,
        repTotalMasuk - repTotalKeluar,
        repSaldoAkhir,
      ];
      totalRow.forEach((val, idx) => {
        const colLetter = String.fromCharCode(65 + idx);
        const cell = wsSummary.getCell(`${colLetter}${nextRow}`);
        cell.value = val;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.alignment = { horizontal: idx <= 1 ? 'center' : 'right', vertical: 'middle' };
        if (idx >= 2) cell.numFmt = '#,##0';
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      wsSummary.getRow(nextRow).height = 24;
    }

    // Apply Signatures on Sheet 1
    applySignatures(wsSummary, nextRow + 3, 'G');

    // ==========================================
    // SHEET 2: PENERIMAAN KAS (TANPA ID TRANSAKSI & STATUS)
    // ==========================================
    const wsIncomes = wb.addWorksheet('Penerimaan Kas', {
      views: [{ showGridLines: true }],
    });
    wsIncomes.columns = [
      { width: 6 }, // A: No
      { width: 14 }, // B: Tanggal
      { width: 28 }, // C: Sumber / Nama Warga
      { width: 22 }, // D: Kategori
      { width: 22 }, // E: Bulan Tagihan
      { width: 18 }, // F: Nominal (Rp)
    ];

    applyKopSurat(wsIncomes, 'F');

    // Sheet 2 Title Bar
    wsIncomes.mergeCells('A7:F7');
    const hInc = wsIncomes.getCell('A7');
    hInc.value = `RINCIAN PENERIMAAN KAS MASUK - ${periodLabel.toUpperCase()}`;
    hInc.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    hInc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    hInc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    wsIncomes.getRow(7).height = 24;

    // Table Headers (NO ID TRANSAKSI, NO STATUS!)
    const incHeaders = ['No', 'Tanggal', 'Sumber / Nama Warga', 'Kategori', 'Bulan Tagihan', 'Nominal (Rp)'];
    incHeaders.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = wsIncomes.getCell(`${colLetter}8`);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      cell.alignment = { horizontal: idx === 0 || idx === 1 ? 'center' : idx === 5 ? 'right' : 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    wsIncomes.getRow(8).height = 22;

    let rInc = 8;
    if (reportIncomes.length === 0) {
      rInc++;
      wsIncomes.mergeCells(`A${rInc}:F${rInc}`);
      const emptyCell = wsIncomes.getCell(`A${rInc}`);
      emptyCell.value = `Tidak ada data penerimaan kas masuk pada periode ${periodLabel}.`;
      emptyCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      wsIncomes.getRow(rInc).height = 24;
    } else {
      reportIncomes.forEach((inc, idx) => {
        rInc++;
        const rowValues = [
          idx + 1,
          inc.tanggal || '-',
          inc.sumber || '-',
          inc.kategori || 'Iuran Bulanan',
          Array.isArray(inc.bulan) ? inc.bulan.join(', ') : inc.bulan || '-',
          inc.nominal,
        ];
        rowValues.forEach((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + cIdx);
          const cell = wsIncomes.getCell(`${colLetter}${rInc}`);
          cell.value = val;
          cell.font = { name: 'Arial', size: 9.5, bold: cIdx === 2 || cIdx === 5 };
          cell.alignment = {
            horizontal: cIdx === 0 || cIdx === 1 ? 'center' : cIdx === 5 ? 'right' : 'left',
            vertical: 'middle',
          };
          if (cIdx === 5) cell.numFmt = '#,##0';
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        });
        wsIncomes.getRow(rInc).height = 19;
      });

      // Total Penerimaan Kas
      rInc++;
      wsIncomes.mergeCells(`A${rInc}:E${rInc}`);
      const tLabel = wsIncomes.getCell(`A${rInc}`);
      tLabel.value = 'TOTAL PENERIMAAN KAS MASUK';
      tLabel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      tLabel.alignment = { horizontal: 'right', vertical: 'middle' };

      const tVal = wsIncomes.getCell(`F${rInc}`);
      tVal.value = repTotalMasuk;
      tVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
      tVal.numFmt = '#,##0';
      tVal.alignment = { horizontal: 'right', vertical: 'middle' };

      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        const cell = wsIncomes.getCell(`${col}${rInc}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      wsIncomes.getRow(rInc).height = 24;
    }

    applySignatures(wsIncomes, rInc + 3, 'F');

    // ==========================================
    // SHEET 3: PENGELUARAN KAS (TANPA ID TRANSAKSI & STATUS)
    // ==========================================
    const wsExpenses = wb.addWorksheet('Pengeluaran Kas', {
      views: [{ showGridLines: true }],
    });
    wsExpenses.columns = [
      { width: 6 }, // A: No
      { width: 14 }, // B: Tanggal
      { width: 22 }, // C: Kategori
      { width: 26 }, // D: Penerima
      { width: 34 }, // E: Keterangan
      { width: 18 }, // F: Nominal (Rp)
    ];

    applyKopSurat(wsExpenses, 'F');

    // Sheet 3 Title Bar
    wsExpenses.mergeCells('A7:F7');
    const hExp = wsExpenses.getCell('A7');
    hExp.value = `RINCIAN PENGELUARAN KAS KELUAR - ${periodLabel.toUpperCase()}`;
    hExp.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    hExp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
    hExp.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    wsExpenses.getRow(7).height = 24;

    // Table Headers (NO ID TRANSAKSI, NO STATUS!)
    const expHeaders = ['No', 'Tanggal', 'Kategori Pengeluaran', 'Penerima / Terkait', 'Keterangan', 'Nominal (Rp)'];
    expHeaders.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = wsExpenses.getCell(`${colLetter}8`);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
      cell.alignment = { horizontal: idx === 0 || idx === 1 ? 'center' : idx === 5 ? 'right' : 'left', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    wsExpenses.getRow(8).height = 22;

    let rExp = 8;
    if (reportExpenses.length === 0) {
      rExp++;
      wsExpenses.mergeCells(`A${rExp}:F${rExp}`);
      const emptyCell = wsExpenses.getCell(`A${rExp}`);
      emptyCell.value = `Tidak ada data pengeluaran kas pada periode ${periodLabel}.`;
      emptyCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      wsExpenses.getRow(rExp).height = 24;
    } else {
      reportExpenses.forEach((exp, idx) => {
        rExp++;
        const rowValues = [
          idx + 1,
          exp.tanggal || '-',
          exp.kategori || 'Operasional',
          exp.penerima || '-',
          exp.keterangan || '-',
          exp.nominal,
        ];
        rowValues.forEach((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + cIdx);
          const cell = wsExpenses.getCell(`${colLetter}${rExp}`);
          cell.value = val;
          cell.font = { name: 'Arial', size: 9.5, bold: cIdx === 3 || cIdx === 5 };
          cell.alignment = {
            horizontal: cIdx === 0 || cIdx === 1 ? 'center' : cIdx === 5 ? 'right' : 'left',
            vertical: 'middle',
          };
          if (cIdx === 5) cell.numFmt = '#,##0';
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        });
        wsExpenses.getRow(rExp).height = 19;
      });

      // Total Pengeluaran Kas
      rExp++;
      wsExpenses.mergeCells(`A${rExp}:E${rExp}`);
      const tLabel = wsExpenses.getCell(`A${rExp}`);
      tLabel.value = 'TOTAL PENGELUARAN KAS KELUAR';
      tLabel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      tLabel.alignment = { horizontal: 'right', vertical: 'middle' };

      const tVal = wsExpenses.getCell(`F${rExp}`);
      tVal.value = repTotalKeluar;
      tVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFBE123C' } };
      tVal.numFmt = '#,##0';
      tVal.alignment = { horizontal: 'right', vertical: 'middle' };

      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        const cell = wsExpenses.getCell(`${col}${rExp}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      wsExpenses.getRow(rExp).height = 24;
    }

    applySignatures(wsExpenses, rExp + 3, 'F');

    // Generate buffer
    const buffer = await wb.xlsx.writeBuffer();
    const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Laporan_Keuangan_IPL_Cleopatra_${cleanPeriod}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

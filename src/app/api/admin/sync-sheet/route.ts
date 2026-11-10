import { NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { syncAllGoogleSheetsData } from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  try {
    const result = await syncAllGoogleSheetsData();

    if (!result.success && result.residents.length === 0) {
      return NextResponse.json(
        { success: false, error: result.errors.join('; ') || 'Gagal mengambil data dari Google Sheets.' },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. Master Warga
    if (result.residents.length > 0) {
      db.residents = result.residents;
    }

    // 2. Saldo Awal
    if (result.saldoAwal > 0) {
      db.settings.saldoAwal = result.saldoAwal;
    }
    if (result.saldoAwalHistory.length > 0) {
      db.saldoAwalHistory = result.saldoAwalHistory;
    }

    // 3. Data Iuran (Kas Masuk)
    // Sheet incomes adalah 52 transaksi bawaan spreadsheet.
    // Local-only incomes adalah transaksi hasil verifikasi bukti transfer warga, transaksi manual, pembayaran cicilan tunggakan (INC-TUNG-), atau pengembalian kasbon (INC-KSB-).
    if (result.incomes.length > 0) {
      const sheetIncIds = new Set(result.incomes.map((i) => i.id));
      const localOnlyIncomes = (db.incomes || []).filter((i) => {
        // Jangan pertahankan ID yang berasal dari Google Sheet atau baris lama sheet
        if (sheetIncIds.has(i.id) || i.id.startsWith('SHEET-') || /^INC-\d+$/.test(i.id)) {
          return false;
        }

        // Pertahankan hanya transaksi kas masuk lokal yang valid
        return (
          Boolean(i.buktiId && !i.buktiId.startsWith('BKT-SHEET-')) ||
          i.id.startsWith('INC-TUNG-') ||
          i.id.startsWith('INC-KSB-') ||
          i.id.startsWith('INC-MANUAL-')
        );
      });

      db.incomes = [...result.incomes, ...localOnlyIncomes].sort(
        (a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
      );
    }

    // 4. Data Pengeluaran
    // Sheet expenses adalah 6 transaksi bawaan spreadsheet.
    // Local-only expenses adalah pengeluaran manual baru atau kasbon baru (EXP-KSB-).
    if (result.expenses.length > 0) {
      const sheetExpIds = new Set(result.expenses.map((e) => e.id));
      const localOnlyExpenses = (db.expenses || []).filter((e) => {
        return (
          !sheetExpIds.has(e.id) &&
          (e.id.startsWith('EXP-KSB-') || e.id.startsWith('EXP-MANUAL-'))
        );
      });

      db.expenses = [...result.expenses, ...localOnlyExpenses].sort(
        (a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
      );
    }

    // 5. Tunggakan Lama - Pertahankan riwayat pembayaran lokal yang sudah dicatat & tunggakan baru lokal
    if (result.tunggakanLama.length > 0) {
      const existingTunggakanMap = new Map((db.tunggakanLama || []).map((t) => [t.id, t]));
      const sheetIds = new Set(result.tunggakanLama.map((s) => s.id));
      const localOnlyTunggakan = (db.tunggakanLama || []).filter((t) => !sheetIds.has(t.id));

      const mergedSheetTunggakan = result.tunggakanLama.map((sheetItem) => {
        const localItem = existingTunggakanMap.get(sheetItem.id);
        if (localItem && (localItem.riwayatPembayaran?.length || 0) > 0) {
          // Pertahankan sisa, nominal terbayar, dan riwayat pembayaran cicilan lokal
          return {
            ...sheetItem,
            jumlah: localItem.jumlah,
            terbayar: localItem.terbayar || 0,
            status: localItem.status,
            riwayatPembayaran: localItem.riwayatPembayaran,
          };
        }
        return {
          ...sheetItem,
          nominalAwal: sheetItem.nominalAwal || sheetItem.jumlah,
          terbayar: sheetItem.terbayar || 0,
          riwayatPembayaran: sheetItem.riwayatPembayaran || [],
        };
      });

      db.tunggakanLama = [...localOnlyTunggakan, ...mergedSheetTunggakan];
    }

    // 6. Data Kasbon - Pertahankan riwayat pembayaran kasbon & kasbon baru lokal
    if (result.kasbon.length > 0) {
      const existingKasbonMap = new Map((db.kasbon || []).map((k) => [k.id, k]));
      const localOnlyKasbon = (db.kasbon || []).filter((k) => k.id.startsWith('KSB-'));

      const mergedSheetKasbon = result.kasbon.map((sheetItem) => {
        const localItem = existingKasbonMap.get(sheetItem.id);
        if (localItem && (localItem.riwayatPembayaran?.length || 0) > 0) {
          return {
            ...sheetItem,
            nominal: localItem.nominal,
            terbayar: localItem.terbayar || 0,
            status: localItem.status,
            riwayatPembayaran: localItem.riwayatPembayaran,
          };
        }
        return {
          ...sheetItem,
          nominalAwal: sheetItem.nominalAwal || sheetItem.nominal,
          terbayar: sheetItem.terbayar || 0,
          riwayatPembayaran: sheetItem.riwayatPembayaran || [],
        };
      });

      db.kasbon = [...localOnlyKasbon, ...mergedSheetKasbon];
    }

    // 7. Bukti Transfer (Sheet BuktiTransfer)
    if (result.proofs && result.proofs.length > 0) {
      const existingProofMap = new Map((db.proofs || []).map((p) => [p.id, p]));
      const localOnlyProofs = (db.proofs || []).filter(
        (p) => !result.proofs.some((sp) => sp.id === p.id || (sp.residentName.toLowerCase() === p.residentName.toLowerCase() && sp.nominal === p.nominal))
      );

      const mergedProofs = result.proofs.map((sheetProof) => {
        const local = existingProofMap.get(sheetProof.id);
        if (local) {
          return {
            ...sheetProof,
            buktiUrl: local.buktiUrl && local.buktiUrl.startsWith('data:') ? local.buktiUrl : sheetProof.buktiUrl,
            driveUrl: sheetProof.driveUrl || local.driveUrl,
            status: local.status === 'Terverifikasi' ? 'Terverifikasi' : sheetProof.status,
            adminNote: local.adminNote || sheetProof.adminNote,
          };
        }
        return sheetProof;
      });

      db.proofs = [...localOnlyProofs, ...mergedProofs];
    }

    saveDb(db);

    const summaryMsg = `Sinkronisasi selesai: ${result.residents.length} Warga, ${result.incomes.length} Iuran, ${result.expenses.length} Pengeluaran, ${result.tunggakanLama.length} Tunggakan (${(result.tunggakanWarga || []).length} Warga + ${(result.tunggakanNonWarga || []).length} Non-Warga), ${result.kasbon.length} Kasbon, ${(result.proofs || []).length} Bukti Transfer. Saldo Awal: Rp ${result.saldoAwal.toLocaleString('id-ID')}`;

    addLog('Sinkronisasi Google Sheets Lengkap', summaryMsg, 'Admin');

    return NextResponse.json({
      success: true,
      message: summaryMsg,
      counts: {
        residents: result.residents.length,
        incomes: result.incomes.length,
        expenses: result.expenses.length,
        tunggakanLama: result.tunggakanLama.length,
        tunggakanWarga: (result.tunggakanWarga || []).length,
        tunggakanNonWarga: (result.tunggakanNonWarga || []).length,
        kasbon: result.kasbon.length,
        proofs: (result.proofs || []).length,
        saldoAwal: result.saldoAwal,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

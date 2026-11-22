import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { syncAllGoogleSheetsData, syncAllDbNamesWithMaster } from '@/lib/googleSheet';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
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
      const deletedSet = new Set(db.deletedIncomeIds || []);
      const localOnlyIncomes = (db.incomes || []).filter((i) => {
        // Jangan pertahankan ID yang berasal dari Google Sheet, baris lama sheet, atau sudah dihapus
        if (deletedSet.has(i.id) || sheetIncIds.has(i.id) || i.id.startsWith('SHEET-') || /^INC-\d+$/.test(i.id)) {
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
        const sheetTerbayar = sheetItem.terbayar ?? Math.max(0, (sheetItem.nominalAwal || sheetItem.jumlah) - sheetItem.jumlah);
        const riwayat = (localItem?.riwayatPembayaran?.length || 0) > 0
          ? localItem!.riwayatPembayaran!
          : (sheetItem.riwayatPembayaran || []);
        return {
          ...sheetItem,
          nominalAwal: sheetItem.nominalAwal || sheetItem.jumlah,
          terbayar: sheetTerbayar > 0 ? sheetTerbayar : (localItem?.terbayar || 0),
          riwayatPembayaran: riwayat,
        };
      });

      db.tunggakanLama = [...localOnlyTunggakan, ...mergedSheetTunggakan];
    }

    // 6. Data Kasbon - Selalu hitung terbayar dari selisih Nominal Awal vs Sisa di Sheet
    if (result.kasbon.length > 0) {
      const existingKasbonMap = new Map((db.kasbon || []).map((k) => [k.id, k]));
      const localOnlyKasbon = (db.kasbon || []).filter((k) => k.id.startsWith('KSB-'));

      const mergedSheetKasbon = result.kasbon.map((sheetItem) => {
        const localItem = existingKasbonMap.get(sheetItem.id);
        const sheetTerbayar = sheetItem.terbayar ?? Math.max(0, (sheetItem.nominalAwal || sheetItem.nominal) - sheetItem.nominal);
        const riwayat = (localItem?.riwayatPembayaran?.length || 0) > 0
          ? localItem!.riwayatPembayaran!
          : (sheetItem.riwayatPembayaran || []);
        return {
          ...sheetItem,
          nominalAwal: sheetItem.nominalAwal || sheetItem.nominal,
          terbayar: sheetTerbayar > 0 ? sheetTerbayar : (localItem?.terbayar || 0),
          riwayatPembayaran: riwayat,
        };
      });

      db.kasbon = [...localOnlyKasbon, ...mergedSheetKasbon];
    }

    // 7. Bukti Transfer (Sheet BuktiTransfer)
    if (result.proofs && result.proofs.length > 0) {
      const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);
      const validSheetProofs = result.proofs.filter((p) => !deletedProofSet.has(p.id));
      const existingProofMap = new Map((db.proofs || []).map((p) => [p.id, p]));
      const localOnlyProofs = (db.proofs || []).filter(
        (p) => !deletedProofSet.has(p.id) && !validSheetProofs.some((sp) => sp.id === p.id)
      );

      const mergedProofs = validSheetProofs.map((sheetProof) => {
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

    syncAllDbNamesWithMaster(db);
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

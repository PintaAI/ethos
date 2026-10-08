# Rencana optimasi sync Ethos dari referensi Hakgyo

Rekomendasi: adaptasi perlindungan antrean, scheduler, dan protokol incremental Hakgyo secara bertahap. Pertahankan SQLite dan protokol transaksi Ethos yang sudah ada. Mulai dengan correctness dan pengurangan kerja lokal melalui perubahan JS; LifeFlow incremental menyusul bersama perubahan server. Keamanan OTA menjadi syarat penerimaan tiap tahap, bukan asumsi dari runtimeVersion yang sama.

Kajian 2 Oktober 2026 ini memakai working tree Ethos pada HEAD `03a040a`, server cashflow-notion pada HEAD `7a64df4`, dan referensi mobile di `/root/projects/hakgyo-v2/apps/mobile`. Ethos dan server mempunyai perubahan belum di-commit. Versi lokal aplikasi 1.1.5; schema lokal 27 sedangkan HEAD masih 26. Ini bukan verifikasi kode yang sudah terpasang di perangkat atau deployment server produksi. Hasil implementasi tahap 1 setelah kajian tercatat di bagian akhir; belum ada publikasi OTA.

## Perbandingan implementasi

Detail source Hakgyo dan batasannya tercatat dalam [kajian referensi Hakgyo](./hakgyo-mobile-sync-reference.md). Perbandingan ini memisahkan mekanisme yang cocok diadaptasi dari kebutuhan domain Ethos.

| Aspek | Ethos saat ini | Referensi Hakgyo | Keputusan |
| --- | --- | --- | --- |
| Penyimpanan lokal | SQLite, status dirty Cashflow, tombstone LifeFlow | Repository lokal dengan antrean perubahan, penulisan berurutan | Pertahankan SQLite; ambil invariant antreannya |
| Push transaksi | Batch 75, mutation ID, ACK bersyarat, fallback endpoint lama | Checkpoint batch dengan partial ACK, pembatasan waktu, dan drain antrean | Ethos sudah memiliki fondasi baik; lengkapi race dan retry |
| Pull | Entries memakai cursor dan page 200; data dan cursor diterapkan dalam transaksi | Manifest token dan revisi course menghindari unduhan ulang | Pertahankan cursor entries; gunakan ide revisi untuk metadata dan LifeFlow |
| LifeFlow | Semua live rows dan tombstone dikirim, server mengembalikan snapshot lengkap | Progress dikirim dari pending changes | Kandidat utama pengurangan payload dan kerja SQLite |
| Scheduling | Mount/effect dengan freshness 5 menit, refresh manual, task background minimum 60 menit | Foreground, reconnect, retry jitter, serta checkAfterMs server | Scheduler tunggal dengan debounce dan follow-up ketika ada edit baru |
| Konflik dan ACK | Entries ACK mengecek timestamp/status; entitas Cashflow lain memakai ACK berdasarkan ID saja | ACK hanya membersihkan snapshot pending yang cocok dengan versi yang dikirim | Terapkan ACK berbasis versi/snapshot secara konsisten |
| Kegagalan | Ringkasan issue area sudah sedang dikembangkan | Pisahkan error sementara, terminal, dan dead letter | Pertahankan semua mutation gagal untuk diperbaiki; jangan meniru batas pembuangan data |

Sumber Ethos: [orchestrator](../src/lib/sync/syncEngine.ts), [hook](../src/lib/sync/useSync.ts), [policy](../src/lib/sync/syncPolicy.ts), [background task](../src/tasks/syncBackground.ts), [LifeFlow sync](../src/lib/sync/lifeflowSync.ts). Sumber kontrak server: [entries](../../cashflow-notion/lib/entry-sync.ts), [LifeFlow](../../cashflow-notion/lib/lifeflow/store.ts).

## Temuan yang menentukan urutan pekerjaan

1. **ACK dapat melewatkan edit baru pada entitas selain entries.** `markSynced` memperbarui status dan timestamp hanya berdasarkan ID. Contoh: kategori versi A dikirim; pengguna mengedit menjadi B selama request; ACK A lalu menandai row B sebagai synced. Ini adalah risiko dari pembacaan source, belum reproduksi pada perangkat. Periksa juga delete ACK dan jarak antara pembacaan LWW dengan upsert. Entries sudah memakai conditional ACK; perlindungan ini perlu diperluas dan tidak boleh hilang saat refactor. [ACK](../src/lib/sync/syncStatus.ts), [pushCategories dan pushEntries](../src/lib/sync/syncEngine.ts).

2. **LifeFlow melakukan kerja sebanding dengan seluruh histori.** Collector membaca semua rows dari tiga tabel dan semua tombstone. Apply menerima timestamp yang sama, sehingga snapshot yang tidak berubah tetap dapat menulis domain rows. Hasil sync menghitung jumlah payload, bukan jumlah perubahan SQLite. Server sudah menyaring mutation yang tidak lebih baru, tetapi tetap membaca, memvalidasi, dan mengembalikan snapshot lengkap. [Collector](../src/lib/sync/lifeflowCollect.ts), [apply](../src/lib/sync/lifeflowApply.ts), [counter](../src/lib/sync/lifeflowSync.ts), [server filter](../../cashflow-notion/lib/lifeflow/sync-plan.ts).

3. **Penghitungan perubahan lintas domain keliru.** `lifeFlowChanged = pushed + pulled`, sementara `cashflowChanged = totalPulled - lifeFlowChanged`. Misalnya Cashflow menarik 1 perubahan dan LifeFlow mengirim/menerima 100/100 rows: `totalPulled=101`, `lifeFlowChanged=200`, sehingga `cashflowChanged=0`. Provider Cashflow dapat tidak di-refresh, sementara LifeFlow di-refresh walaupun payload identik. Gunakan counter perubahan aktual per domain, terpisah dari traffic dan jumlah ACK. [syncNow](../src/lib/sync/syncEngine.ts), [refresh decision](../src/lib/sync/syncPolicy.ts).

4. **Delete LifeFlow selama request membutuhkan perlindungan tombstone.** Pemeriksaan timestamp apply hanya melihat live row. Jika row dihapus secara lokal ketika snapshot lama sedang terbang, respons live yang lama dapat menghidupkan row lagi dan menghapus tombstone. Bandingkan live state serta tombstone, dan hapus tombstone hanya saat versi delete tersebut benar-benar diakui. [existingUpdatedAt dan applyLifeFlowEntity](../src/lib/sync/lifeflowApply.ts).

5. **Single-flight belum menjamin follow-up.** `syncNow` mengembalikan Promise yang sedang aktif, sedangkan hook menolak pemanggilan ketika running. Belum ada jaminan satu putaran tambahan untuk mutation yang masuk setelah tahap collect selesai. Prefetch metadata juga memulai empat request untuk setiap wallet secara bersamaan tanpa batas global. Pertahankan urutan parent sebelum child; batasi concurrency request independen. [syncNow](../src/lib/sync/syncEngine.ts), [useSync](../src/lib/sync/useSync.ts).

6. **Cursor LifeFlow tidak boleh menggunakan timestamp klien sebagai urutan perubahan.** Server menyimpan `updatedAt` dari perangkat. Perubahan offline bertanggal lebih tua daripada cursor terakhir dapat terlewat jika kelak delta hanya memakai `updatedAt > cursor`. Revision server harus terpisah dari timestamp konflik. Selain itu, seleksi LWW sekarang terjadi sebelum transaksi write; protokol baru perlu memeriksa konflik secara atomik. [store](../../cashflow-notion/lib/lifeflow/store.ts).

## Tahap 1 Perbaikan JS tanpa migrasi schema

Tujuannya mengamankan data dan mengurangi write serta refresh yang tidak perlu. Kontrak server dan bentuk data lokal tetap kompatibel.

- Luaskan conditional ACK ke semua entitas dan delete. ACK hanya mengakui snapshot yang dikirim; edit berikutnya tetap pending. Untuk create yang berhasil ketika row sudah berubah, simpan pemetaan remote ID tanpa menandai versi baru sebagai synced. Uji create lalu edit/delete selama request, termasuk fallback entries. Timestamp saja dapat bertabrakan pada edit dalam milidetik yang sama; cocokkan snapshot secara atomik atau gunakan revision lokal pada tahap berikutnya.
- Terapkan pemeriksaan konflik dan write dalam satu transaksi SQLite. Lindungi tombstone LifeFlow dari respons stale. Skip apply hanya ketika canonical payload dan versi memang identik; jangan menganggap timestamp sama berarti payload pasti sama.
- Pisahkan `sent`, `acknowledged`, `received`, dan `appliedChanges` per domain. Refresh provider hanya ketika hasil lokal yang dibacanya berubah; catat perubahan dari ACK juga bila mengubah data yang terlihat.
- Tambahkan scheduler di balik satu interface sync: trigger startup/foreground, mutation setelah commit lokal, reconnect, manual, dan background. Debounce edit beruntun dan simpan penanda follow-up bila ada pekerjaan selama run aktif. Freshness membatasi pull idle, tidak menunda dirty push.
- Gunakan `expo-network` yang sudah ada, lalu retry error sementara dengan exponential backoff dan jitter. Network state hanyalah petunjuk, bukan bukti server reachable. Hormati Retry-After untuk 429/503; 401 menunggu sesi valid; kegagalan validasi mempertahankan mutation dan memberi jalan perbaikan. Jangan menambahkan retry buta untuk create non-idempotent. [Network SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/network/).
- Batasi request independen, misalnya mulai dari 3 lalu ukur. Jangan menahan lock SQLite selama network. Pertahankan generation barrier dan transaksi page+cursor yang sudah ada. Penghentian sesi harus menghentikan trigger, membatalkan request, menunggu semua pekerjaan turunan selesai, lalu berpindah scope.

Keuntungan yang diharapkan: edit lebih cepat mencapai cloud, request gagal tidak berulang rapat, no-op sync tidak menulis domain rows/refresh UI, serta tidak ada dirty mutation yang hilang karena ACK lama. Pengurangan byte LifeFlow yang besar belum terjadi pada tahap ini.

## Tahap 2 LifeFlow incremental dengan server kompatibel

Tambahkan endpoint/version capability baru sambil mempertahankan endpoint snapshot lama. Client lama tetap bekerja; client baru memakai v2 hanya setelah capability dikonfirmasi. Error jaringan atau 500 tidak boleh dianggap bukti v2 tidak didukung.

Server menyediakan mutation ID idempotent, hasil per mutation, revision berurutan per user/scope, cursor opaque, pagination, tombstone, serta reset/bootstrap yang eksplisit. Alokasi revision dan write harus atomik dengan urutan commit yang aman agar transaksi yang commit belakangan tidak berada di belakang cursor. Semua penulis, termasuk endpoint lama dan web, harus menghasilkan revision yang sama. Batch validasi parent/child harus tetap konsisten; partial ACK hanya boleh memecah kelompok mutation yang independen.

Client menambahkan tabel metadata terpisah untuk pending mutation, receipt/versi terakhir, dan cursor per account/scope/protocol. Mutation ID tetap sama setelah crash atau respons hilang. Data domain dan pencatatan pending wajib commit bersama. ACK membersihkan hanya mutation/versi yang dikirim. Tombstone disimpan sampai server mengakuinya; gagal permanen tidak berarti boleh dibuang.

Bootstrap harus dapat dilanjutkan setelah aplikasi mati, mempertahankan edit offline selama snapshot masuk, dan menyimpan hasil page+cursor secara atomik. Tentukan retensi tombstone dan receipt secara eksplisit; client terlalu lama offline menerima reset protocol yang aman, bukan snapshot kosong yang dianggap perintah menghapus. Receipt entries saat ini dibersihkan setelah 90 hari; uji retry setelah retensi sebelum mengandalkannya sebagai deduplikasi tanpa batas. [entry-sync](../../cashflow-notion/lib/entry-sync.ts).

Perubahan awal memerlukan satu rekonsiliasi lengkap untuk membangun baseline. Setelah itu traffic normal mengikuti jumlah perubahan. Ilustrasi, bukan benchmark: histori 10.000 rows dengan 2 edit seharusnya mengirim sekitar 2 mutation plus envelope, bukan 10.000 rows. Ukuran bootstrap, validasi server, dan parent dependencies tetap harus diukur.

## Tahap 3 Metadata Cashflow dan pekerjaan opsional

Setelah dua tahap awal stabil, tambah manifest/revision per wallet untuk categories, quick fills, budgets, dan recurring entries. Saat ini ada empat full-list request per wallet; manifest memungkinkan melewati payload yang tidak berubah. Manfaatnya paling relevan untuk banyak wallet. Semua writer harus mengubah revision terkait sebelum optimization diaktifkan.

Kedua aplikasi sudah memakai SQLite, sehingga adaptasi ini tidak memerlukan pergantian storage. Hindari penghapusan cache saat migrasi dan batas 50 dead letters untuk data pengguna. WebSocket dan framework sync baru belum diperlukan untuk manfaat yang teridentifikasi. Counter, policy, queue, dan transport menjadi implementation internal dari module sync, dengan interface kecil untuk request sync, observasi status, dan penghentian scope.

## Migrasi dan kompatibilitas OTA

Konfigurasi lokal memakai `runtimeVersion.policy = appVersion`, dengan versi 1.1.5. Kecocokan runtime tidak memverifikasi schema atau kontrak backend. OTA hanya dapat memakai kemampuan native yang memang ada di binary target; perubahan native/dependency native/plugin memerlukan build dan runtime yang sesuai. Jangan mengubah kebijakan runtime sebagai bagian optimasi ini. Verifikasi fingerprint/dependency dan konfigurasi dari build yang benar-benar didistribusikan sebelum publish. [app.json](../app.json), [package.json](../package.json), [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

| Tahap | Migrasi | Jalur rilis |
| --- | --- | --- |
| 1 | Tidak ada perubahan schema/payload | Kandidat OTA setelah pengujian binary lama |
| 2 | Tabel metadata/index tambahan di SQLite; revision/receipt dan endpoint baru di server | Server kompatibel dahulu, lalu OTA bertahap |
| 3 | Metadata revision per wallet; kemungkinan index tambahan server | Server dahulu, client lewat capability |

Migration runner sekarang selalu menulis `PRAGMA user_version = DATABASE_VERSION`. Bundle HEAD dengan versi 26 yang membaca DB 27 akan menurunkan marker menjadi 26. Penambahan kolom v27 sudah mengecek keberadaan kolom, tetapi itu tidak membuat semua migrasi masa depan aman untuk replay. Perbaiki runner agar tidak menurunkan versi dan buat migration baru idempotent, transactional, serta dilindungi lock bersama background startup. Perbaikan runner baru tidak memperbaiki bundle lama yang sudah terdistribusi. [schema](../src/data/cashflow/schema.ts), [dbLock](../src/lib/sync/dbLock.ts).

Karena itu, sebelum tahap 2:

1. Tetapkan bundle rollback yang telah diuji, termasuk embedded bundle binary. Jangan mengandalkan semua user pernah memasang OTA perantara; upgrade langsung harus didukung.
2. Tambahkan tabel metadata tanpa rename/drop tabel atau kolom lama. Gunakan version marker metadata tersendiri dengan pemeriksaan struktur idempotent agar penurunan user_version oleh bundle lama tidak merusak antrean. Nomor migration final ditetapkan setelah pekerjaan lokal v27 diselesaikan.
3. Pertahankan representasi domain dan tombstone yang dapat dibaca bundle lama. Saat v2 aktif kembali setelah legacy bundle menulis, lakukan rekonsiliasi baseline penuh sebelum mempercayai metadata pending/cursor yang lama. Uji legacy edits dan deletes pada siklus downgrade; jangan hanya menguji bahwa layar bisa dibuka.
4. Backfill state tanpa menimpa payload, ID, remote mapping, dirty row, atau delete pending. Jangan menambahkan metadata sync ke row yang diserialisasi dengan `SELECT *`; gunakan tabel terpisah dan serializer allowlist.
5. Pisahkan scope account. Metadata tambahan wajib mengikuti kebijakan clear/switch akun dan tidak dipakai akun berikutnya. Kebijakan logout saat ini menghapus data lokal; perubahan ke antrean persisten perlu keputusan eksplisit tentang pending data, tidak boleh diam-diam mengirimnya sebagai akun lain. [logout](../src/components/profile/ProfileContent.tsx), [clear database](../src/data/cashflow/schema.ts).

Rollback OTA tidak mengembalikan SQLite. Expo menyebut perubahan persistent state sebagai alasan rollback bisa tidak aman. Jika bundle lama tidak bisa membaca/menulis state baru dengan benar, hentikan rollout dan lakukan fix-forward; jangan menjanjikan rollback universal. [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/).

## Pengujian dan keputusan rilis

Baseline yang sudah dijalankan: `bun test tests/syncPolicy.test.mjs tests/syncSql.test.mjs src/lib/sync/lifeflowSync.test.ts` — 7 lulus, 0 gagal. Ini memverifikasi test existing, bukan bukti correctness race, kinerja, maupun kompatibilitas OTA. Source ditemukan lewat graph MCP; coverage diperiksa dan server LifeFlow dibaca langsung ketika metadata freshness berubah.

Syarat implementasi sebelum rilis:

- Edit/delete ketika push dan pull sedang berjalan, create berhasil tetapi response hilang, partial ACK, mutation identik dikirim ulang, dan edit dengan timestamp sama. Pending edit/delete harus bertahan dan tidak menghasilkan duplikat.
- Kill aplikasi di tengah migration, bootstrap, apply page, serta setelah commit server sebelum ACK lokal. Data dan cursor tidak boleh terpisah; restart melanjutkan tanpa kehilangan perubahan.
- Mode offline lama, jam perangkat meleset, 401/403/429/500, toggle cloud sync, logout/login akun lain, foreground bersamaan background, dan expiration iOS. Jangan menganggap minimumInterval menjamin eksekusi; penjadwalan background ditentukan OS. [BackgroundTask SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/background-task/).
- Binary produksi iOS dan Android dengan fixture schema yang benar-benar pernah dirilis: upgrade langsung, upgrade → rollback → offline edit/delete → upgrade, serta launch offline. Test pasangan client lama/server baru dan client baru/server lama, termasuk field baru pada working tree seperti notify_start/notify_end.
- `npx tsc --noEmit`, lint, export native kedua platform, dan config check untuk paket yang akan diterbitkan. Uji perangkat nyata, bukan hanya fresh install, simulator, atau web export.
- Ukur p50/p95 durasi, request/byte, SQLite domain writes, refresh UI, umur pending tertua, error per area, dan convergence dua perangkat. Jangan merekam payload finansial. No-op seharusnya menghasilkan nol perubahan domain/refresh; traffic delta harus mengikuti changeset. Besar peningkatan ditentukan benchmark sebelum/sesudah.

Urutan distribusi yang diusulkan: internal/preview pada native runtime setara → 5% → 25% → 100%, dengan pemeriksaan crash/startup, migration failure, pending age, dan convergence di tiap tahap. Tambahkan kill switch untuk menonaktifkan scheduler/protokol baru tanpa membuang pending data. EAS mendukung rollout persentase; ketersediaan rollback tetap bergantung kompatibilitas data. [Expo rollouts](https://docs.expo.dev/eas-update/rollouts/).

Sebelum publish, tinjau kembali semua dirty/untracked files karena EAS mengekspor working tree, dan tentukan bundle yang benar-benar akan dikirim. Kajian ini belum memeriksa artefak binary terpasang, benchmark perangkat, atau deployment backend live; klaim aman untuk production harus menunggu syarat di atas lulus.

## Hasil implementasi tahap 1

Perubahan tahap 1 sudah diterapkan pada working tree dengan mempertahankan perubahan yang sudah ada sebelum pekerjaan ini. Tidak ada endpoint server baru, migration version baru, perubahan app version/runtime, plugin baru, atau dependency native baru. `@noble/hashes` 2.2.0 yang sebelumnya sudah ada secara transitive dijadikan dependency JS langsung untuk hash mutation ID.

- ACK Cashflow membandingkan snapshot row secara atomik, termasuk edit dengan timestamp sama. Create ACK tetap mengikat remote ID ketika pengguna sudah mengedit atau menghapus row. Delete ACK dan pull mempertahankan dirty overlay.
- Snapshot LifeFlow dikumpulkan dalam transaksi dan dibandingkan lagi ketika respons diterapkan. Edit/delete selama request, termasuk child yang baru ditambahkan, melindungi parent dari cascade delete. Tombstone lokal menghalangi respons live stale. Replay identik melewati write serta timestamp trigger. Pemeriksaan identitas item sistem juga tidak lagi memicu rewrite akibat flag notifikasi.
- Counter perubahan Cashflow dan LifeFlow terpisah dari jumlah payload. Provider hanya di-refresh jika hasil lokal berubah.
- Scheduler menangani debounce 750 ms, satu run aktif dengan follow-up mutation, pause offline/background, startup recovery, foreground freshness, reconnect, dan manual. Transaksi recurring yang dimaterialisasi saat refresh serta check-in harian baru juga memberi trigger setelah lock dilepas; check-in yang sudah tercatat tidak ditulis ulang. Retry sementara memakai backoff+jitter maksimal 15 menit, dengan Retry-After sebagai batas minimum server. Create non-idempotent yang gagal menahan trigger otomatis dalam sesi scheduler tersebut sampai sync manual; ini belum memberi jaminan exactly-once lintas restart/background pada endpoint legacy.
- Prefetch dibatasi menjadi tiga request metadata secara global, ditambah satu LifeFlow independen. Engine menunggu semua task yang sudah dimulai sebelum melaporkan idle. Logout, hapus akun, serta mematikan cloud sync menghentikan scheduler dan menunggu scope aktif selesai.
- Migration v27 yang sudah ada dibuat transactional, termasuk version marker, dan runner tidak menurunkan marker database yang lebih baru. Tidak ada penghapusan data atau schema sync tambahan pada tahap ini. Perbaikan ini tidak mengubah perilaku bundle lama yang sudah terdistribusi.

Verifikasi lokal: 45 tes terkait lulus tanpa kegagalan, memakai SQLite nyata dengan transport API/native image IO dimock, serta fake-clock scheduler. TypeScript, ESLint, config check, dan export native Android/iOS juga diverifikasi. Cakupan tes meliputi edit/create race dengan timestamp sama, tombstone, parent cascade, replay tanpa domain write, pembatasan concurrency pada enam wallet, penghentian request sebelum idle, retry policy, replay migration, serta rollback migration gagal. Ini membuktikan jalur lokal yang diuji; belum mengukur latency/byte pada perangkat atau membuktikan upgrade/rollback terhadap binary produksi.

Catatan status historis tahap 1: tahap 2 (LifeFlow incremental) dan tahap 3 (manifest metadata) saat itu belum diimplementasikan. Payload LifeFlow masih snapshot penuh. Sebelum rollout production, lakukan uji binary terpasang pada runtime yang sama, kontrak backend yang benar-benar deployed, dan siklus upgrade/rollback/offline write. Perubahan notifikasi v27 yang sudah ada di working tree juga perlu diuji bersama serializer legacy sebelum menentukan target rollback. Kandidat OTA tidak boleh dipublikasikan hanya berdasarkan export yang berhasil.


## Hasil implementasi tahap 2 dan 3

Tahap 2 dan 3 sekarang sudah diterapkan di Ethos dan server cashflow-notion. Antrean SQLite, mutation receipt persisten, cursor revision, inbox remote tertunda, scope akun, metadata manifest, capture trigger semua writer, endpoint baru dan fallback lama telah diuji. Jalur server v2 membaca mutation/parent/history terkait melalui index, dan tidak mengumpulkan snapshot penuh untuk setiap batch.

Audit artefak produksi menemukan embedded schema20 pada runtime1.1.5, sehingga keputusan rilis awal berubah: kandidat ini wajib memakai baseline native1.1.6. Migrasi lama sekarang mempertahankan data yang bisa dikonversi dan arsip ekspor untuk representasi lama yang berbeda. Tidak ada publikasi OTA atau deployment production dalam sesi ini. Hasil pengujian, batas bukti, urutan deploy dan rollback tersedia di [catatan rilis final](./ethos-sync-release.md).

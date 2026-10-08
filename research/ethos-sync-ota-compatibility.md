# Ethos sync: bukti kompatibilitas OTA dan gate rilis

Kajian read-only pada 2 Oktober 2026. Hasil ini membedakan kontrak source lokal, metadata build EAS, dan perilaku aplikasi yang benar-benar terpasang. Tidak ada OTA yang dipublish, backend yang dideploy, atau data produksi yang diubah oleh kajian ini.

## Defect yang harus ditangani

### Rollback ke serializer v26 mengirim SQLite integer sebagai boolean

Pada HEAD `03a040a1db274155a6856e1843d9ba69d06eaee6`, `src/lib/sync/lifeflowCollect.ts:5` hanya membuang `updated_at` dari Item; collector membaca `SELECT *`. Migration v27 menambahkan `notify_start` dan `notify_end` sebagai INTEGER. Setelah bundle v27 pernah berjalan, rollback ke bundle HEAD menghasilkan angka 0/1 dalam payload Item. Kontrak server yang diperiksa semula menggunakan `z.boolean().default(true)`, sehingga endpoint snapshot mengembalikan 400 sebelum memproses mutation. Source: [migration](/root/projects/ethos/src/data/cashflow/schema.ts:709), [collector saat ini](/root/projects/ethos/src/lib/sync/lifeflowCollect.ts:5), [kontrak server](/root/projects/cashflow-notion/lib/lifeflow/contract.ts:61), [endpoint snapshot](/root/projects/cashflow-notion/app/api/v1/lifeflow/sync/route.ts:5). Untuk source historis, gunakan `git show 03a040a1:src/lib/sync/lifeflowCollect.ts`.

Perbaikan server yang minimal: normalisasi **hanya angka tepat 0 dan 1** menjadi boolean untuk dua field tersebut, termasuk occurrence replacement; pertahankan default saat field tidak dikirim, dan tolak angka lain, string, object, serta null. Hindari `z.coerce.boolean()` karena nilai string seperti `"false"` tidak memberikan semantik yang diinginkan. Serializer baru tetap mengirim boolean. Response server tetap boolean sehingga client baru dan lama menerima bentuk yang sama.

Probe lokal menjalankan collector dan migration runner asli dari HEAD melalui Bun Transpiler, dengan SQLite nyata yang dimigrasi oleh source saat ini; bukan mock SQL. Hasil sebelum normalisasi server:

```text
legacyNotificationValues: 0/1
legacyServerParse: false
currentServerParse: true
legacy user_version: 26
re-upgrade user_version: 27
Item name/notify flags preserved; integrity_check: ok
```

Script probe tersimpan sementara di `/tmp/ethos-ota-compatibility-probe.ts`. Source runner HEAD menurunkan `user_version` menjadi 26; runner baru memulihkan marker secara idempotent tanpa menghapus row. Ini membuktikan jalur v26/v27 yang diuji, bukan rollback semua bundle historis. [Tes migration yang tersedia](/root/projects/ethos/src/data/cashflow/schemaCompatibility.test.ts:16) juga menguji replay additive dan rollback transaksi gagal.

Serializer exception HEAD tidak meneruskan notification flags di replacement JSON. Server memakai default true untuk field yang hilang. Jika exception dengan flag false diedit menggunakan bundle lama, nilai baru bisa kembali true. Uji eksplisit perilaku ini sebelum menyebut rollback mempertahankan seluruh preference; dukungan terhadap field yang memang tidak diketahui bundle lama tidak dapat disimpulkan dari parse sukses saja. Source historis: `git show 03a040a1:src/lib/sync/lifeflowCollect.ts`, branch `item_exception`; [default server](/root/projects/cashflow-notion/lib/lifeflow/contract.ts:64).

### Bundle embedded produksi memakai schema v20, dengan migration berikutnya yang merusak kompatibilitas

Build iOS produksi terbaru yang ditemukan berasal dari commit `ae3fdf071829ecf250406485fa5b1b5e6a70258e`. Source embedded tersebut menetapkan `DATABASE_VERSION = 20`. Repository LifeFlow lamanya membaca `time_boxes`, `habits`, dan `day_presets`; misalnya `src/data/lifeflow/repository.ts:230` berisi `SELECT * FROM time_boxes ORDER BY date DESC, start_time, id`. Source historis dapat dibaca dengan `git show ae3fdf0:src/data/cashflow/schema.ts` dan `git show ae3fdf0:src/data/lifeflow/repository.ts`.

Migration24 saat ini menghapus tabel tersebut. Migration25 menghapus `items`, `habit_logs`, `item_exceptions`, dan tombstone, lalu membuat tabel personal kosong serta menghapus preference journal. Kedua migration sudah ada sebelum optimasi sync ini; sifat destructive tetap relevan untuk OTA yang membawa seluruh working tree. Source: [migration24](/root/projects/ethos/src/data/cashflow/lifeflowUnifiedMigration.ts:33), [migration25](/root/projects/ethos/src/data/cashflow/lifeflowPersonalMigration.ts:13), [urutan runner](/root/projects/ethos/src/data/cashflow/schema.ts:670).

Konsekuensi yang didukung source: jalur upgrade langsung dari schema20 menjalankan reset tersebut; rollback ke embedded JS sesudahnya tidak lagi memiliki tabel yang dibaca. Perbaikan ACK/scheduler dan normalisasi boolean tidak menyelesaikan hal ini. Gate rilis: fixture schema20 dengan LifeFlow pengguna harus di-upgrade tanpa kehilangan histori, atau cakupan rollout harus secara terverifikasi dibatasi ke state yang sudah kompatibel dan rollback target harus bundle modern yang diuji. Jangan memakai rollback-to-embedded sebagai recovery universal. Expo menjelaskan bahwa rollback setelah perubahan persistent state bisa tidak aman dan harus diuji terhadap state pengguna; jika target lama tidak aman, gunakan fix-forward. [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/).

Probe tambahan `/tmp/ethos-embedded-upgrade-probe.ts` menjalankan function migration dan `listTimeBoxes` asli dari commit embedded `ae3fdf0`, lalu migration kandidat, pada SQLite nyata. Fixture memuat ordinary habit, completion log, dan time box. Hasil sebelum perbaikan migration:

```text
embedded schema version: 20
embedded repository rows before upgrade: 1
ordinary Items after current upgrade: 0
habit logs after current upgrade: 0
embedded repository query after upgrade: no such table: time_boxes
embedded migration after rollback lowers marker to: 20
next candidate migration: no such table: habits
```

Dengan demikian rollback embedded juga merusak marker yang dipakai re-upgrade; uji v26→27 saja tidak mencakup kasus ini. Ini adalah probe function repository historis asli, bukan sekadar query yang ditulis ulang.

## Pemetaan conversion migration yang didukung source

Bagian ini panduan implementasi, belum merupakan migration lossless yang sudah diterapkan atau diuji. Schema20 dibaca dari commit embedded. Schema21 menambah timestamp/trigger/tombstone; schema22 menambah `management_id` dan `system_type`; schema23 hanya menambah category management. Schema24 adalah unified Item per wallet; schema25 adalah personal Item tanpa wallet. [Scope migration22](/root/projects/ethos/src/data/cashflow/lifeflowMigration22.ts:16), [runner21–23](/root/projects/ethos/src/data/cashflow/schema.ts:525), [schema24](/root/projects/ethos/src/data/cashflow/lifeflowUnifiedMigration.ts:41), [schema25](/root/projects/ethos/src/data/cashflow/lifeflowPersonalMigration.ts:18).

| Source row | Projection ke personal unified | Informasi yang wajib tetap diarsipkan |
| --- | --- | --- |
| Ordinary `habits` | habit Item, name/color, untimed, recurrence daily untuk tujuh hari; selain itu weekly, interval1, `0=SU,1=MO,…6=SA` | `preferred_duration`, management/provenance, weekdays JSON asli dan source ID |
| `habit_logs` | remap habit→Item ID, date/completed_at, updated_at fallback completed_at | source habit/scope; setiap row saat canonical merge menimbulkan duplicate |
| Ordinary stored `time_boxes` | one-off event, starts_on=date, title→name, start/end/breaks, created_at/updated_at | completed/dismissed, habit link, preset links, original nullable color |
| Active `day_preset_schedules` × blocks | event per schedule+block; starts_on=start_date; once→no recurrence, daily→daily, weekly→mapped weekdays, interval1 | preset grouping/name, sort_order, active, original IDs, inactive/unscheduled templates |
| Stored snapshot dari mapped recurring preset block | eligible date→exception override bila snapshot berbeda; dismissed→cancelled exception | event completion dan original snapshot/provenance; dates tidak eligible atau once dismissal |
| Unified schema24 ordinary `items` | semua domain fields ditransfer, hanya management_id dikeluarkan | management/provenance, source schema/version |
| Unified24 logs/exceptions | remap parent ID, preserve completion/date/replacement payload dan timestamps | original parent/scope; ambiguous collision |
| Legacy tombstone | hanya jenis yang punya ID mapping aman diproyeksikan | semua original kind/entity_id/scope/timestamp, termasuk preset kinds yang tak punya padanan |

Tanggal `starts_on` untuk habit legacy belum ada di schema20–23: gunakan tanggal valid paling awal antara creation dan histori retained agar log lama tidak menjadi ineligible. Log yang weekday-nya tidak ada dalam definisi habit sekarang memerlukan penanganan conflict; jangan membuang log atau mengubah jadwal diam-diam untuk membuat validasi server lewat. Format waktu, warna hex, break kelipatan lima menit, identity, recurrence, dan parent eligibility harus diperiksa sebelum upload; row yang tidak bisa diproyeksikan aman tetap tersedia di arsip. [Validasi domain server](/root/projects/cashflow-notion/lib/lifeflow/contract.ts:55).

ID ordinary schema24 sudah merupakan primary key global; menghapus `management_id` saja tidak menimbulkan collision ID. System Items berbeda: schema24 membuat `lifeflow-app-check-in-{remoteWalletOrLocalId}` dan `lifeflow-journal-{remoteWalletOrLocalId}`, sehingga ada satu Item per wallet. Map semuanya ke `lifeflow-app-check-in` / `lifeflow-journal`, gunakan payload canonical personal, dan union log per date. Untuk dua completion pada date yang sama, pilih row dengan updated_at valid terbaru, lalu tie-break deterministik; arsipkan semua original rows sehingga merge tidak menghilangkan bukti histori. Tombstone satu wallet terhadap canonical system Item yang masih live di wallet lain tidak boleh otomatis menghapus canonical Item global. [Pembuatan ID schema24](/root/projects/ethos/src/data/cashflow/lifeflowUnifiedMigration.ts:125), [canonical personal ID](/root/projects/ethos/src/data/lifeflow/unifiedRepository.ts:77).

Projection preset tidak sepenuhnya mempertahankan perilaku: legacy `recurrence.ts` menekan virtual occurrence saat overlap atau color sama dengan row effective lain. Recurring Items baru tidak memiliki semantics template/group/active yang sama. Simpan graph preset lengkap; jangan mengklaim lossless behavior hanya karena semua blok berhasil menjadi recurring Items. Source historis: `git show ae3fdf0:src/data/lifeflow/recurrence.ts`, `resolveTimeBoxesForDate`.

Arsip lengkap sebaiknya ditulis dan conversion mapping dibuat atomik bersama migration marker. Nama tabel arsip terpisah dapat melindungi data pada app baru, tetapi **tidak** membuat bundle embedded lama kompatibel: embedded tetap membaca nama tabel lama dan columns `habit_id`. Kompatibilitas rollback memerlukan bridge schema/write dua arah yang diuji, atau native runtime baru dengan embedded bundle yang memahami schema personal dan recovery fix-forward. Perbaikan juga harus mengenali marker20 pada layout personal hasil rollback sehingga tidak mencoba `ALTER TABLE habits` yang sudah hilang. Data yang sudah dihapus oleh migration destructive yang pernah dijalankan tidak bisa dipulihkan dari SQLite kosong tanpa backup atau sumber remote.

## Bukti runtime dan native layer

Config kandidat menetapkan app1.1.5, runtime policy `appVersion`, SDK56, bundle ID `com.rorez.ethos`, serta channel production/preview/development. Tidak ada diff `app.json`, `eas.json`, atau `plugins/` terhadap commit build iOS produksi terbaru. Dependency JS `@noble/hashes`2.2.0 merupakan penambahan direct dependency kandidat. Source: [app config](/root/projects/ethos/app.json), [profiles](/root/projects/ethos/eas.json), [dependencies](/root/projects/ethos/package.json). SDK56 dan aturan native/runtime dikonfirmasi melalui [docs SDK56](https://docs.expo.dev/versions/v56.0.0/) dan [runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

Read-only `eas build:list` berhasil setelah akses jaringan sandbox diberikan. Token dan URL archive bertanda tangan tidak dicetak atau disimpan di repo. Metadata pada saat query:

| Kandidat binary | Build | Channel/distribution | Runtime / SDK | Source commit |
| --- | --- | --- | --- | --- |
| [iOS terbaru](https://expo.dev/accounts/rorez/projects/ethos/builds/eeb2c00d-a99b-49bb-9dc0-a29cb4566847) | 20, selesai 4 Agustus 2026 | production / STORE | 1.1.5 / 56.0.0 | `ae3fdf0` |
| [iOS sebelumnya](https://expo.dev/accounts/rorez/projects/ethos/builds/2caf4b02-08d9-48bf-8c87-67149a64200c) | 19, selesai 3 Agustus 2026 | production / STORE | 1.1.5 / 56.0.0 | `7a8813c` |
| [Android terbaru](https://expo.dev/accounts/rorez/projects/ethos/builds/a70e8d59-46ba-4719-bd37-4efb214a2e74) | 3, dibuat 21 September 2026 | preview / INTERNAL | 1.1.5 / 56.0.0 | `03a040a1` |

Query production+finished(limit20) mengembalikan12 build, semuanya iOS. Query Android+finished(limit50) mengembalikan7 build, semuanya internal; tidak ada finished Android production dalam hasil tersebut. Ini bukan bukti tidak ada binary dari proses build lain atau build lokal. Metadata EAS tidak membuktikan build20 telah dirilis di App Store atau bahwa semua perangkat pengguna memakainya.

Lockfile pada commit iOS build20 dan kandidat memiliki versi resolved yang sama untuk native packages yang dipakai sync: Expo56.0.18, SQLite56.0.5, Network56.0.5, BackgroundTask56.0.24, TaskManager56.0.24, Updates56.0.23, React Native0.85.3. Ini mendukung kesamaan source native yang relevan, tetapi tidak menggantikan pemeriksaan archive terbangun dan uji device. Perbandingan source: `git show ae3fdf0:package-lock.json` terhadap [lockfile kandidat](/root/projects/ethos/package-lock.json).

Generated native files lokal berbeda dan tidak boleh menjadi bukti runtime produksi: [Expo.plist](/root/projects/ethos/ios/ethos/Supporting/Expo.plist) memuat runtime1.1.4; [Android strings](/root/projects/ethos/android/app/src/main/res/values/strings.xml:4) dan [Gradle](/root/projects/ethos/android/app/build.gradle:96) memuat1.1.3. Direktori ini diabaikan Git. Metro export yang tersedia di `/tmp/ethos-sync-{android,ios}-final/metadata.json` hanya mencatat bundle/assets, bukan native binary yang terpasang.

## Matriks pengujian yang harus ditutup

| Jalur | Bukti yang ada | Yang masih harus diuji |
| --- | --- | --- |
| v26 JS + v27 SQLite + server baru | Probe menemukan integer0/1 dan marker downgrade/recovery | Parse0/1 sesudah normalisasi; boolean/omitted; penolakan input invalid; offline edit/delete sesudah rollback |
| schema20 embedded -> kandidat | Source menunjukkan migration destructive | Fixture histori pengguna dipertahankan; recovery restart; rollback modern dan batas rollback embedded |
| client lama + server incremental baru | Endpoint snapshot lama harus dipertahankan | Numeric/omitted flags, old response envelope, semua writer memberi revision |
| client baru + server lama | Belum dibuktikan oleh kajian ini | Fallback hanya pada capability unsupported; auth/500/network tidak dianggap unsupported |
| iOS native1.1.5 + OTA kandidat | EAS build metadata dan lockfile source cocok | Archive/perangkat produksi setara, launch offline, update/rollback, native background/resume |
| Android native1.1.5 + OTA kandidat | EAS preview build tersedia | Preview perangkat nyata; production binary yang dituju dan channel penerima jika ada |

Tidak ada klaim bahwa backend lokal sudah deployed, bahwa payload dari akun produksi diuji, atau bahwa upgrade/rollback pada device sudah lulus. Gunakan staged rollout setelah gate data/migration ditutup; persentase rollout tidak membuat migration destructive menjadi aman. Expo menganjurkan preview pada runtime yang sama dan verifikasi sebelum promotion. [Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

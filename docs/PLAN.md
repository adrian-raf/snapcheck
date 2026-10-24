# Rencana Proyek snapcheck

Dokumen ini menjelaskan **apa** yang dibangun, **kenapa**, **dalam urutan apa**, dan **standar kode** yang dipakai. Status per fase ditandai ✅ (selesai), 🔄 (berjalan), atau ⏳ (belum).

## 1. Tujuan

Membangun alat uji kepatuhan (conformance test harness) untuk SNAP BI yang:

1. **Membuktikan** bahwa sebuah implementasi SNAP (mock, sandbox bank, atau API internal) mengikuti aturan signature, response code, dan idempotensi.
2. **Mendokumentasikan perbedaan antar provider**, yang menjadi sumber bug integrasi paling sering.
3. Menjadi **portfolio flagship** untuk posisi SDET / QA Automation di fintech: menunjukkan pemahaman domain pembayaran, keamanan API, dan desain framework tes.

Yang **bukan** tujuan: membuat SDK produksi, atau menyimulasikan seluruh layanan SNAP.

## 2. Arsitektur

```
src/core/            Library murni SNAP: signature, hash body, timestamp, response code, EndpointUrl.
                     Tanpa HTTP, tanpa state, tanpa jam global → bisa dipakai ulang di mana pun.
src/profiles/        Schema + loader profile provider; accessor aturan (caseFor, timestampFormatOf).
profiles/            Satu file YAML per provider (default, bri, bca), lengkap dengan sumber.
src/mock-server/     Server SNAP palsu yang ketat (Fastify + zod), meniru satu profile.
  guards/            Satu aturan per guard (header, timestamp, token, signature, body, idempotensi).
  pipelines.ts       Urutan guard untuk access token dan untuk semua layanan transaksional.
  domain/            Logika bisnis: token, external ID, rekening, transfer, uang (bigint).
  routes/            Satu file per layanan SNAP; hanya mendeklarasikan schema body + handler.
src/requirements/    Katalog requirement (ID, dasar aturan, risiko bisnis, sumber) — satu sumber kebenaran.
src/reporting/       Agregasi verdict (fungsi murni) + renderer HTML/Markdown + reporter Playwright.
src/cli/             CLI `snapcheck` (run, mock, profiles, requirements); I/O diinjeksi agar bisa diuji.
src/keys/            Pembuatan key pair lokal yang aman dijalankan bersamaan.
tests/unit/          Vitest: core, profiles, domain, reporting, CLI. Golden vector dari OpenSSL.
tests/conformance/   Playwright: suite kepatuhan yang bisa diarahkan ke mock atau sandbox.
  requirements.ts    Helper `requirement(id)` untuk tag + anotasi tes.
  support/           SnapClient, fixtures, custom matcher, schema response, test data builder.
  specs/             Satu file per area: access token, keamanan transaksi, idempotensi, layanan.
bin/snapcheck.mjs    Entry point CLI (menjalankan TypeScript langsung lewat tsx, tanpa build).
Dockerfile, compose  Image mock (user non-root, healthcheck) + satu container per profile.
scripts/             Generator katalog requirement + cek traceability; pembungkus keys:ensure.
```

Alur sebuah request transaksional di mock:

```
requireHeaders → requireValidTimestamp → requireFreshTimestamp → authenticateBearer
  → requirePartnerMatchesToken → verifyTransactionalSignature → validateBody
  → claimExternalId → handler layanan
```

Alur pengujian per profile:

```
profiles/bri.yaml ──┬──▶ mock (MOCK_PROFILE=bri, port 4011)  ◀── HTTP ──┐
                    └──▶ suite (project "bri", profileName=bri) ─────────┘
```

Satu file profile menggerakkan kedua sisi, sehingga `npx playwright test` menguji ketiga profile sekaligus. Saat diarahkan ke sandbox (`SNAP_BASE_URL`), hanya sisi suite yang dipakai, dan profile ikut diuji: nilai profile yang salah membuat tes pemiliknya gagal.

Setiap guard melempar `SnapError(case, detail)`. Error handler menambahkan service code dari konfigurasi route, sehingga guard yang sama menghasilkan `4011100` di balance inquiry dan `4011700` di transfer.

## 3. Prinsip clean code yang diterapkan

| Prinsip                        | Wujud di kode                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single responsibility          | Satu guard = satu aturan. Satu route = satu layanan. `core` tidak tahu HTTP.                                                                                     |
| Dependency injection           | `buildApp` adalah satu-satunya tempat implementasi konkret dirangkai. `Clock` diinjeksi agar aturan waktu bisa diuji (lihat tes batas hari WIB).                 |
| Interface sebelum implementasi | `TokenStore`, `ExternalIdRegistry`, `AccountRepository`, `PartnerRegistry` → versi in-memory sekarang, Redis/Postgres nanti tanpa mengubah guard.                |
| Tidak ada magic string         | Header di `SnapHeader`, service code di `ServiceCode`, case di `SnapCase`. Typo menjadi error compile.                                                           |
| Fail fast                      | Konfigurasi divalidasi zod saat start; key yang hilang memberi pesan jelas beserta cara memperbaikinya.                                                          |
| Uang tanpa floating point      | Nominal dikonversi ke sen sebagai `bigint`.                                                                                                                      |
| Keamanan sebagai default       | Perbandingan HMAC constant-time; alasan gagal signature disamakan (anti-enumerasi); header sensitif di-redact dari log; key lokal di `.keys/` yang di-gitignore. |
| Komentar menjelaskan _kenapa_  | Bukan mengulang _apa_ yang sudah jelas dari kode.                                                                                                                |

## 4. Praktik terbaik Playwright yang diterapkan

| Praktik                       | Wujud                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom fixtures               | `target` dan `codes` (scope worker), `snap`, `accessToken`. Spec tidak pernah membaca env atau membuat client sendiri.                                          |
| Option fixture + projects     | `profileName` adalah option fixture; satu project per profile, masing-masing dengan `webServer` sendiri. `--project bri` menjalankan satu profile.              |
| Auto fixtures                 | `annotateProfile` mencatat profile (dan field yang belum terverifikasi) di setiap tes; `skipMockPolicyOnRealTarget` men-skip `@mock-policy` di sandbox.         |
| API object, bukan helper acak | `SnapClient` menandatangani dengan benar secara default dan menyediakan cara eksplisit untuk merusak **satu hal** (`signWith`, `sentBody`, `headers.omit/set`). |
| Custom matcher                | `toHaveSnapResponseCode('4091100')` mengecek status HTTP **dan** responseCode sekaligus, dengan pesan gagal yang menampilkan body.                              |
| Contract validation           | Response divalidasi schema zod yang ditulis dari sisi client, sengaja terpisah dari kode mock.                                                                  |
| Data builder                  | `aTransferIntrabank(target, overrides)` — ID unik per panggilan, aman untuk paralel.                                                                            |
| Data-driven test              | Loop untuk header wajib, format timestamp, dan format nominal.                                                                                                  |
| `test.step`                   | Tes multi-langkah (idempotensi) terbaca seperti skenario di laporan.                                                                                            |
| Tag & anotasi                 | `@IDEM-001`, `@standard`, `@mock-policy` → `--grep` per requirement, dan anotasi tampil di HTML report.                                                         |
| Tanpa retry                   | Tes kepatuhan deterministik; retry hanya menyembunyikan pelanggaran.                                                                                            |
| `webServer`                   | Satu mock per profile dinyalakan otomatis; health check `?profile=` menolak mock yang meniru profile lain. Dimatikan bila `SNAP_BASE_URL` diisi.                |
| Lint khusus                   | `eslint-plugin-playwright` + `typescript-eslint` strictTypeChecked.                                                                                             |

## 5. Fase pengerjaan

Asumsi kapasitas: 5–10 jam per minggu.

### Fase 1 — Fondasi ✅ (minggu 1–4)

- ✅ Core library + unit test, termasuk golden vector OpenSSL.
- ✅ Mock server: access token B2B, balance inquiry, transfer intrabank.
- ✅ Suite kepatuhan dengan katalog requirement, sumber tiap aturan, dan cek traceability otomatis.
- ✅ Verifikasi silang ke dokumentasi peserta SNAP ([SPEC-VERIFICATION.md](SPEC-VERIFICATION.md)).
- ✅ CI GitHub Actions.

### Fase 2 — Provider profiles ✅ (minggu 5–7)

- ✅ Profile YAML `default`, `bri`, `bca` dengan sumber dan daftar field `unverified` ([ADR 0002](adr/0002-provider-profiles-as-data.md)):
  - query string ikut ditandatangani atau tidak (BCA vs BRI),
  - zona waktu dan milidetik X-TIMESTAMP,
  - nilai `tokenType`,
  - case code duplicate partnerReferenceNo (`01` vs `00` di BRI),
  - path endpoint per provider.
- ✅ Mock meniru satu profile; suite membaca nilai harapan dari profile yang sama. Satu project Playwright per profile.
- ✅ Requirement baru: SIG-006 (query string), TS-001 (anti-replay), AUTH-003 (X-PARTNER-ID = pemilik token).
- ✅ Terbukti profile benar-benar diuji: salinan profile BRI yang salah satu field-nya diubah, bila dijalankan ke mock BRI, hanya menggagalkan requirement pemilik field itu.
- ↪️ Dipindah ke Fase 4: signature transaksional asimetris. Provider yang dicek hanya memakainya untuk notifikasi yang **mereka kirim** ke partner, jadi tempatnya bersama pengujian callback.
- ⏳ Belum: batas panjang field per provider (BRI lebih ketat dari nilai SNAP). Ditunda karena memerlukan schema body per profile.

### Fase 3 — Laporan & CLI ✅ (minggu 8–10)

- ✅ Reporter kustom Playwright → `compliance-report/`:
  - `index.html`: laporan mandiri (tanpa aset eksternal, terang/gelap, layak di ponsel) untuk pembaca non-teknis. Isinya verdict per profile, matriks requirement × profile, dan untuk setiap kegagalan: risiko bisnis, sumber aturan, serta pesan error.
  - `summary.md`: ringkasan Markdown, otomatis masuk ke job summary GitHub Actions.
  - `report.json`: data mentah untuk diolah alat lain (mis. QA Workbench).
  - Aturan verdict: gagal bila ada satu tes gagal; flaky dihitung gagal; "not run" bila difilter `--grep`.
  - Pesan error dari sistem yang diuji di-escape: tidak bisa menyisipkan markup ke laporan (ada unit test-nya).
- ✅ CLI `snapcheck`: `run`, `mock`, `profiles`, `requirements`.
  - `--env-file` memuat kredensial tanpa `source .env`, jadi jalan di PowerShell.
  - Playwright dijalankan lewat `node` langsung (tanpa shell/`npx`), sama di Windows dan Linux.
  - `run --profile bri` hanya menyalakan mock BRI.
  - Exit code: 0 lulus, 1 ada pemeriksaan gagal, 2 salah pemakaian.
- ✅ Docker: image mock dengan user non-root dan healthcheck; `compose.yaml` satu container per profile di port yang sama dengan Playwright.
  - Bila folder `.keys` di volume kosong, CLI memberi pesan jelas cara membuatnya di host.
  - Image **belum di-build** di lingkungan pengembangan (Docker Hub diblokir). Langkah runtime-nya diuji tanpa Docker; build penuh diverifikasi oleh job `docker` di CI.

### Fase 4 — Ketahanan ✅ (minggu 11+)

Fokus: **uang tidak boleh terdebit dua kali.** Lihat [ADR 0003](adr/0003-fault-injection-and-reference-client.md).

- ✅ Transfer Status Inquiry (service code 36), mengikuti BRI, Midtrans, Paydia.
  - Variasi provider baru di profile, `transferStatus.notFound`: `http-404` (BRI, Paydia → 404XX01) vs `status-07` (Midtrans → 200 + status 07).
  - Requirement STS-001 (standard) dan STS-002 (provider-variant); keduanya ikut jalan ke sandbox.
- ✅ Fault injection di mock lewat header `X-SNAPCHECK-FAULT`:
  - `error-before-commit`: 500, uang tidak bergerak.
  - `error-after-commit`: uang bergerak, lalu 500.
  - `timeout-after-commit`: uang bergerak, jawaban terlambat.
  - `pending`: 202, status Pending sampai settle.
  - Status pending dihitung dari clock yang diinjeksi (tanpa timer), jadi bisa diuji deterministik.
- ✅ Rekening uji otomatis: nomor berawalan 8 dibuat saat pertama dipakai dengan saldo awal tetap, sehingga tes paralel bisa memeriksa saldo secara tepat.
- ✅ Client referensi `transferWithRecovery`: cek status sebelum kirim ulang; kirim ulang hanya setelah "not found", selalu dengan `partnerReferenceNo` yang sama; hasil akhir `unknown` (eskalasi ke manusia) bila status tak kunjung final.
  - 18 unit test dengan gateway palsu + 4 tes end-to-end (RES-001…004) yang memeriksa saldo.
  - Terbukti: client yang mengirim ulang tanpa cek status dan memakai `partnerReferenceNo` baru → tes gagal di saldo (`990000.00` diharapkan, `980000.00` diterima = terdebit dua kali).
- ✅ Notifikasi settlement bertanda tangan SHA256withRSA (key provider di `.keys/provider/`) + **inbox** yang memverifikasinya (`snapcheck inbox`). Requirement NTF-001.
  - Payload notifikasi adalah buatan snapcheck (tidak ada provider yang mendokumentasikan payload notifikasi transfer intrabank). Format signature sendiri berbeda antar sumber; lihat SPEC-VERIFICATION.md.
- ⏳ Ditunda: virtual account (alurnya terbalik — bank memanggil partner — dan domainnya cukup besar untuk fase sendiri).
- ⏳ Di luar repo ini: integrasi `compliance-report/report.json` ke QA Workbench; artikel "Perbedaan implementasi SNAP antar provider".

## 6. Definition of Done (per fitur)

- [ ] Requirement baru tercatat di `requirements.ts` dengan basis dan risiko bisnis.
- [ ] Ada minimal satu tes positif dan satu tes negatif.
- [ ] `npm run check` hijau (format, lint, typecheck, unit, conformance).
- [ ] `npm run requirements:doc` hijau (tidak ada requirement tanpa tes).
- [ ] Sumber aturan dicatat; bila tidak ada di dokumen resmi, basisnya `mock-policy` atau `provider-variant`.

## 7. Risiko & mitigasi

| Risiko                                     | Mitigasi                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salah menafsirkan spesifikasi              | Setiap aturan punya `source` di katalog dan disilang-cek ke ≥ 2 peserta SNAP; yang berbeda diberi basis `provider-variant`. Developer Site resmi dicek manual (SPEC-VERIFICATION.md bagian 4). |
| Mock dan tes "sepakat dalam bug yang sama" | Schema response tes ditulis terpisah dari kode mock; golden vector dari OpenSSL.                                                                                                               |
| Membocorkan kredensial sandbox             | Kredensial hanya dari env; `.env` dan `.keys/` di-gitignore; jangan commit hasil HTML report dari sandbox.                                                                                     |
| Membebani sandbox bank                     | Jalankan suite ke sandbox secara manual, bukan di setiap push.                                                                                                                                 |

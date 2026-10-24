# Verifikasi Spesifikasi SNAP

Tanggal verifikasi: **24 Oktober 2026**

## 1. Sumber resmi dan batasannya

- **Regulasi:** [PADG No. 23/15/PADG/2021 tentang SNAP](https://www.bi.go.id/elicensing/helps/PADG_231521_SNAP.pdf).
  - Regulasi ini **tidak memuat** detail teknis seperti formula signature, nama header, response code, atau format timestamp.
  - Pasal 5 ayat (2) menyatakan standar teknis, keamanan, data, dan spesifikasi teknis **dipublikasikan pada Developer Site SNAP**.
  - Pasal 11 menggolongkan perubahan response code sebagai _minor update_, sehingga daftarnya memang dikelola di Developer Site, bukan di regulasi.
- **Developer Site SNAP:** [apidevportal.aspi-indonesia.or.id](https://apidevportal.aspi-indonesia.or.id), sesuai [halaman SNAP di situs ASPI](https://aspi-indonesia.or.id/standar-dan-layanan/standar-open-api-pembayaran-indonesia-snap/).
  - Sejak 1 September 2023, pengelolaan SNAP dialihkan dari BI ke ASPI ([BI](https://www.bi.go.id/id/layanan/Standar/SNAP)).
  - Domain lama `apidevportal.bi.go.id` sudah tidak aktif (DNS tidak ditemukan), meskipun mesin pencari masih mengindeksnya.
  - **Batasan:** situs ASPI memblokir pembacaan otomatis (robots.txt), jadi isinya tidak bisa saya baca langsung, dan saya tidak memaksanya.
- **Metode pengganti:** silang-cek ke dokumentasi publik **peserta SNAP** (bank dan PJP) yang menyalin spesifikasi tersebut ke situs masing-masing.
  - Aturan disebut `standard` hanya bila semua sumber yang diperiksa sepakat.
  - Bila sumber berbeda, aturan disebut `provider-variant`.

| Sumber                                                                                                                                                                                                                                           | Jenis | Yang dicek                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------- |
| [BRI – OAuth SNAP](https://developers.bri.co.id/en/snap-bi/apidocs-oauth-snap-bi)                                                                                                                                                                | Bank  | Token, timestamp, definisi path, response code token                   |
| [BRI – Intrabank Transfer](https://developers.bri.co.id/en/snap-bi/api-account-inquiry-internal-intrabank-transfer-v11)                                                                                                                          | Bank  | Header, field body (panjang "SNAP BI"), service code 17, response code |
| [BCA – Dokumentasi](https://developer.bca.co.id/en/Dokumentasi)                                                                                                                                                                                  | Bank  | Timestamp, X-EXTERNAL-ID, relative URL, token                          |
| [DOKU – HTTP status & case code](https://developers.doku.com/getting-started-with-doku-api/response-code/http-status-and-case-code)                                                                                                              | PJP   | Tabel response code                                                    |
| [DOKU – Symmetric](https://developers.doku.com/get-started-with-doku-api/signature-component/snap/symmetric-signature.md) / [Asymmetric](https://developers.doku.com/get-started-with-doku-api/signature-component/snap/asymmetric-signature.md) | PJP   | Formula signature                                                      |
| [Durianpay – Response codes](https://docs.durianpay.id/reference/response-code-handling)                                                                                                                                                         | PJP   | Service code, tabel response code                                      |
| [Paydia – SNAP signature](https://docs-snap.paydia.id/snap-introduction/snap-signature/)                                                                                                                                                         | PJP   | Formula signature, encoding                                            |
| [PayerMax – SNAP guide](https://docs.payermax.com/en/202606-version/developer/SNAP.md)                                                                                                                                                           | PJP   | Timestamp, definisi path, body kosong                                  |
| [Midtrans – Error mapping](https://docs.midtrans.com/reference/error-mapping)                                                                                                                                                                    | PJP   | 409XX01                                                                |

## 2. Hasil per aturan

✅ cocok · 🔧 diperbaiki di kode · ⚠️ berbeda antar provider

| Aturan                                 | Implementasi snapcheck                                                                  | Hasil                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| stringToSign access token              | `clientKey + "\|" + X-TIMESTAMP`, SHA256withRSA, Base64                                 | ✅ BRI, BCA, DOKU, Paydia, PayerMax                                                                                                                 |
| stringToSign transaksional (simetris)  | `METHOD:path:token:lowercase(hex(sha256(minify(body)))):timestamp`, HMAC-SHA512, Base64 | ✅ BRI, BCA, DOKU, Paydia, PayerMax                                                                                                                 |
| stringToSign transaksional (asimetris) | Sama tanpa token, SHA256withRSA                                                         | ✅ DOKU, PayerMax                                                                                                                                   |
| Body kosong                            | Di-hash sebagai string kosong                                                           | ✅ PayerMax (contoh kode resmi). Sumber lain tidak menyebutkan.                                                                                     |
| Query string di path                   | Mock: path dipakai apa adanya                                                           | ⚠️ BCA: **ikut** ditandatangani (diurutkan, di-encode RFC 3986). BRI & PayerMax: **tidak ikut**.                                                    |
| Format X-TIMESTAMP                     | ISO 8601 dengan zona waktu; mengirim `+07:00` tanpa milidetik                           | ⚠️ BCA: 25 karakter tanpa milidetik. BRI: dengan milidetik, dan halaman token meminta UTC. Validator mock menerima keduanya.                        |
| X-EXTERNAL-ID                          | Numerik, unik per partner per hari                                                      | ✅ BCA (numerik, maks. 36, unik di hari yang sama), BRI (numerik, 36)                                                                               |
| Service code                           | Token 73, balance inquiry 11, transfer intrabank 17                                     | ✅ Durianpay (73, 11), BRI (17)                                                                                                                     |
| `2007300`, `expiresIn`                 | Token 900 detik                                                                         | ✅ BCA (900), BRI (900)                                                                                                                             |
| `tokenType`                            | Mock mengirim `Bearer`                                                                  | ⚠️ BCA `bearer`, BRI `BearerToken`. 🔧 Schema tes kini hanya mengecek keberadaan field.                                                             |
| 400XX00 / 01 / 02                      | Bad Request / Invalid Field Format {field} / Invalid Mandatory Field {field}            | ✅ BRI, DOKU, Durianpay                                                                                                                             |
| 401XX00 / 01                           | Unauthorized. [reason] / Invalid Token (B2B)                                            | ✅ BRI, DOKU, Durianpay                                                                                                                             |
| 403XX14                                | Insufficient Funds                                                                      | ✅ BRI, DOKU                                                                                                                                        |
| 404XX11                                | Akun tidak dikenal                                                                      | 🔧 Pesan diganti dari "Invalid Account" ke teks resmi "Invalid Card/Account/Customer [info]/Virtual Account".                                       |
| 409XX00                                | Conflict (X-EXTERNAL-ID sama di hari yang sama)                                         | ✅ DOKU, Durianpay, BRI                                                                                                                             |
| 409XX01                                | Duplicate partnerReferenceNo                                                            | ⚠️ DOKU, Durianpay, Midtrans: `01`. **BRI: `00`.**                                                                                                  |
| 500XX00 / 01                           | General Error / Internal Server Error                                                   | 🔧 **Sebelumnya salah:** kode lama memakai 500XX00 untuk "Internal Server Error". Kini 500XX00 = General Error dan 500XX01 = Internal Server Error. |
| amount.value IDR                       | Tepat 2 desimal, maks. 16 digit bulat                                                   | ✅ BRI ("16,2"; IDR wajib 2 desimal)                                                                                                                |
| Panjang field                          | partnerReferenceNo ≤ 64, beneficiaryAccountNo ≤ 34                                      | ✅ BRI                                                                                                                                              |
| sourceAccountNo                        | Sebelumnya ≤ 34                                                                         | 🔧 Diperbaiki menjadi ≤ 19 sesuai nilai SNAP di dokumen BRI.                                                                                        |
| Alasan gagal yang seragam (TOK-003)    | Mock memberi alasan yang sama untuk client tak dikenal dan signature salah              | ⚠️ Bukan aturan standar: BRI justru membedakan alasannya. Dipindah ke `mock-policy`.                                                                |

## 3. Variasi provider

Variasi ini sekarang tercatat sebagai data di `profiles/default.yaml`, `profiles/bri.yaml`, dan `profiles/bca.yaml`. Field yang tidak dikonfirmasi sumber mana pun ditandai `unverified` di file profile-nya.

| Variasi                                    | Nilai yang ditemukan                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Query string di EndpointUrl                | BCA: ikut, diurutkan · BRI, PayerMax: tidak ikut                                               |
| Zona waktu X-TIMESTAMP                     | BCA: `+07:00` · BRI (token): UTC dengan milidetik                                              |
| `tokenType`                                | `Bearer` · `bearer` (BCA) · `BearerToken` (BRI)                                                |
| Duplicate partnerReferenceNo               | 409XX01 (DOKU, Durianpay, Midtrans) · 409XX00 (BRI)                                            |
| Prefix path                                | BRI: `/intrabank/snap/v2.0/transfer-intrabank` · Durianpay: `/v1.0/...`                        |
| Panjang field                              | BRI memakai batas lebih ketat daripada nilai SNAP (mis. partnerReferenceNo 20 vs 64)           |
| Transaksi tidak ditemukan (status inquiry) | 404XX01 (BRI, Paydia) · 200 + `latestTransactionStatus` "07" (Midtrans)                        |
| Path status inquiry                        | `/v1.0/transfer/status` (Durianpay, Midtrans) · `/snap/v1.0/transfer/status` (BRI, Paydia)     |
| Signature notifikasi provider → partner    | Asimetris SHA256withRSA (PayerMax; halaman asimetris DOKU) · simetris (halaman ringkasan DOKU) |

### Tambahan Fase 4 (24 Oktober 2026)

| Aturan                        | Implementasi snapcheck                                                                                                                                     | Sumber                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Service code status inquiry   | 36                                                                                                                                                         | Durianpay, Midtrans, Paydia, tabel response BRI |
| Request status inquiry        | `originalPartnerReferenceNo` dan `serviceCode` wajib; `originalReferenceNo`, `originalExternalId`, `transactionDate` opsional                              | BRI, Midtrans, Paydia                           |
| `latestTransactionStatus`     | 00 Success, 01 Initiated, 02 Paying, 03 Pending, 05 Rejected, 06 Failed, 07 Not found. Kode 04 tidak didokumentasikan sumber mana pun, jadi tidak dipakai. | Midtrans (lengkap); BRI dan Paydia (sebagian)   |
| 202XX00 Request In Progress   | Jawaban untuk transfer yang diterima tapi belum final                                                                                                      | BRI, DOKU, Durianpay                            |
| 404XX01 Transaction Not Found | Status inquiry untuk transaksi yang tidak dikenal (profile `http-404`)                                                                                     | BRI, Paydia, Durianpay                          |
| Cek status sebelum retry      | Status inquiry dipakai "dalam hal gangguan sistem, timeout, dll."                                                                                          | BRI                                             |
| Payload notifikasi transfer   | Memakai field status inquiry. **Buatan snapcheck**: tidak ada sumber yang mendokumentasikan notifikasi untuk transfer intrabank.                           | —                                               |

Sumber tambahan: [BRI – Transaction Status Inquiry](https://developers.bri.co.id/en/snap-bi/api-transaction-status-inquiry), [Midtrans – Transfer Status Inquiry](https://docs.midtrans.com/reference/transfer-status-inquiry), [Paydia – Transfer Status](https://snap-docs.paydia.id/snap-api/transfer-status/v1.0.0), [DOKU – SNAP signature overview](https://developers.doku.com/get-started-with-doku-api/signature-component/snap).

## 4. Yang masih perlu kamu cek sendiri

Buka [apidevportal.aspi-indonesia.or.id](https://apidevportal.aspi-indonesia.or.id) di browser, cari bagian layanan API (di situs lama bernama "API Services"), lalu cocokkan halaman berikut dengan tabel di atas:

1. **Keamanan:** formula signature, format timestamp, aturan X-EXTERNAL-ID.
2. **Informasi Saldo:** field balance inquiry dan service code 11.
3. **Transfer kredit** (bagian transfer intrabank): field body dan service code 17.
4. **Tabel response code umum:** terutama **409XX01** dan **500XX00/01**.

Kalau ada perbedaan, kirimkan tangkapan layar atau teksnya. Katalog requirement tinggal diperbarui di satu tempat (`tests/conformance/requirements.ts`).

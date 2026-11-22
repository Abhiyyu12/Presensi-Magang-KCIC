# PROMPT EKSEKUSI UNTUK CODING AGENT

Baca seluruh dokumen proyek terlebih dahulu, khususnya `AGENT.md`, `PRD.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `SECURITY.md`, `DESIGN.md`, `TESTING.md`, dan `IMPLEMENTATION_PLAN.md`.

Kondisi proyek: benar-benar mulai dari nol. Target saat ini hanya aplikasi lokal dengan Docker Compose. Jangan deploy ke server produksi. Jangan gunakan data pribadi nyata. Jangan menganggap semua kebijakan yang pending sebagai keputusan resmi.

TUGAS:
Bangun aplikasi secara end-to-end, bukan hanya mockup UI. Ikuti fase pada `IMPLEMENTATION_PLAN.md` secara berurutan. Mulai dengan audit repository dan environment. Jangan langsung membuat seluruh fitur sekaligus.

WAJIB:
1. Periksa repository dan jangan menimpa pekerjaan yang sudah ada.
2. Catat semua aktivitas di `BUILD_LOG.md` (root repo, bukan `docs/`). Register keputusan: `DECISIONS.md` di root.
3. Bootstrap monorepo TypeScript strict dengan stack yang ditetapkan di `ARCHITECTURE.md`; pin versi dependency dan container image.
4. Bangun Docker Compose lokal untuk frontend, backend, PostgreSQL, dan MinIO. Tambahkan health checks, named volumes, private buckets, localhost-only ports, dan startup dependency yang benar.
5. Buat migration, constraint, index, dan seed dummy yang idempotent.
6. Implementasikan backend terlebih dahulu: auth/session, authorization RBAC+ABAC+ReBAC, master data, scheduling, attendance, file storage, leave, audit, reports, help center.
7. Setiap API harus punya schema validation, error handling, authorization, scope enforcement, request ID, dan test.
8. Setelah API stabil, implementasikan UI responsive dengan seluruh loading/error/empty/success/permission states.
9. Jangan membuat tombol/halaman palsu. Semua aksi harus terhubung ke API nyata.
10. Jalankan unit, integration, API, E2E, security, lint, typecheck, dan build tests. (Catatan status 2026-11-22: suite E2E terotomasi belum ada di repo — direncanakan; verifikasi browser saat ini = skrip Playwright ad-hoc di luar repo. Jangan mengklaim gate yang belum jalan.)
11. Perbaiki seluruh P0/P1 dan regression. Jangan menghapus atau skip test untuk membuat pipeline hijau.
12. Lakukan clean-room verification dari Docker environment baru dan migration dari database kosong.
13. Jika keputusan bisnis belum tersedia, gunakan konfigurasi yang dapat diubah hanya jika aman; jika mempengaruhi validitas kebijakan, tandai pending dan jangan mengarang nilai.
14. Jangan mengklaim selesai tanpa bukti command dan test result.

Mulai sekarang kerjakan Phase 0. Setelah selesai, lanjutkan fase berikutnya selama tidak ada blocker kebijakan/teknis yang memerlukan keputusan user. Jangan berhenti hanya setelah membuat rencana atau struktur folder. Lanjutkan sampai semua exit criteria terpenuhi. Jika tidak dapat menyelesaikan dalam satu sesi, tinggalkan build log akurat dengan fase terakhir, blocker, file yang sudah dibuat, test yang sudah dijalankan, dan langkah berikutnya.

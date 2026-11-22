-- Alamat terperinci (reverse-geocoding OpenStreetMap/Nominatim) disimpan bersama
-- event sebagai bagian bukti — gaya timestamp: apa yang tercatat saat itu tetap.
-- Best-effort: bila layanan geocoding gagal/dimatikan, kolom tetap NULL.
-- Rollback:
--   ALTER TABLE "attendance_events" DROP COLUMN IF EXISTS "address";
--   ALTER TABLE "leave_events" DROP COLUMN IF EXISTS "address";
ALTER TABLE "attendance_events" ADD COLUMN "address" TEXT;
ALTER TABLE "leave_events" ADD COLUMN "address" TEXT;

-- Lokasi absensi/pergerakan izin menjadi opsional: absen tetap sah tanpa GPS,
-- koordinat dicatat bila tersedia (prinsip "tercatat di mana, bukan dibatasi di mana").
-- Rollback: pastikan tidak ada NULL dulu, lalu
--   ALTER TABLE "attendance_events" ALTER COLUMN "latitude" SET NOT NULL;
--   ALTER TABLE "attendance_events" ALTER COLUMN "longitude" SET NOT NULL;
--   ALTER TABLE "leave_events" ALTER COLUMN "latitude" SET NOT NULL;
--   ALTER TABLE "leave_events" ALTER COLUMN "longitude" SET NOT NULL;
ALTER TABLE "attendance_events" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "attendance_events" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "leave_events" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "leave_events" ALTER COLUMN "longitude" DROP NOT NULL;

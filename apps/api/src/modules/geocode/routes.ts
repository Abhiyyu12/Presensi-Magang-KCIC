import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../../common/http.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { reverseGeocode } from '../../common/geocode.js';

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export async function geocodeRoutes(app: FastifyInstance): Promise<void> {
  // Terjemahan koordinat -> alamat terperinci untuk tampilan panel lokasi.
  // Panggilan ke layanan geocoding bersifat best-effort (address null bila gagal).
  app.get('/geocode/reverse', { schema: { querystring: querySchema }, preHandler: authenticate }, async (req) => {
    requireCtx(req);
    const { latitude, longitude } = querySchema.parse(req.query);
    return ok({ address: await reverseGeocode(latitude, longitude) }, req.id);
  });
}

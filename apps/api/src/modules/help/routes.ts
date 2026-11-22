import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok, paginationQuery, paginationMeta, skipTake } from '../../common/http.js';
import { badRequest, notFound, conflict } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { authenticate, authorize, requireCtx } from '../../app/auth.js';
import { hasPermission, type AccessContext } from '../access/context.js';

const idParams = z.object({ id: z.string().uuid() });
const slugParams = z.object({ slug: z.string().min(1).max(160) });

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === 'P2002';
}

function canManageHelp(ctx: AccessContext): boolean {
  return hasPermission(ctx, 'admin:help:manage');
}

const articleListQuery = paginationQuery.extend({
  categoryId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

const articleCreateBody = z.object({
  categoryId: z.string().uuid(),
  slug: z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug harus berupa huruf kecil, angka, dan tanda hubung.'),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  targetRolesJson: z.array(z.string().max(64)).optional(),
});

const articlePatchBody = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  targetRolesJson: z.array(z.string().max(64)).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export async function helpRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get('/help/categories', { preHandler: authenticate }, async (req) => {
    const items = await db.helpCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return ok({ items }, req.id);
  });

  app.get(
    '/help/articles',
    { schema: { querystring: articleListQuery }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      const query = articleListQuery.parse(req.query);
      const where: Prisma.HelpArticleWhereInput = {
        // Non-managers only ever see PUBLISHED articles (filter applied in the DB query).
        ...(canManageHelp(ctx) ? {} : { status: 'PUBLISHED' }),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { body: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [total, items] = await db.$transaction([
        db.helpArticle.count({ where }),
        db.helpArticle.findMany({
          where,
          select: {
            id: true,
            categoryId: true,
            slug: true,
            title: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            category: { select: { id: true, code: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get('/help/articles/:slug', { schema: { params: slugParams }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const { slug } = slugParams.parse(req.params);
    const article = await db.helpArticle.findUnique({
      where: { slug },
      include: { category: true },
    });
    // 404 (not 403) for non-published articles so existence is never leaked.
    if (!article || (article.status !== 'PUBLISHED' && !canManageHelp(ctx))) throw notFound();
    return ok(article, req.id);
  });

  app.post(
    '/admin/help/articles',
    { schema: { body: articleCreateBody }, preHandler: authorize('admin:help:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = articleCreateBody.parse(req.body);
      const category = await db.helpCategory.findUnique({ where: { id: body.categoryId } });
      if (!category) throw badRequest('Kategori bantuan tidak ditemukan.');
      let article;
      try {
        article = await db.helpArticle.create({
          data: {
            categoryId: body.categoryId,
            slug: body.slug,
            title: body.title,
            body: body.body,
            targetRolesJson: body.targetRolesJson ?? undefined,
            status: 'DRAFT',
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'HELP_ARTICLE_CREATE',
        objectType: 'helpArticle',
        objectId: article.id,
        after: article,
        requestId: req.id,
      });
      return ok(article, req.id);
    },
  );

  app.patch(
    '/admin/help/articles/:id',
    { schema: { params: idParams, body: articlePatchBody }, preHandler: authorize('admin:help:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = articlePatchBody.parse(req.body);
      const before = await db.helpArticle.findUnique({ where: { id } });
      if (!before) throw notFound();
      if (body.categoryId) {
        const category = await db.helpCategory.findUnique({ where: { id: body.categoryId } });
        if (!category) throw badRequest('Kategori bantuan tidak ditemukan.');
      }
      const article = await db.helpArticle.update({
        where: { id },
        data: {
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.targetRolesJson !== undefined
            ? { targetRolesJson: body.targetRolesJson === null ? Prisma.DbNull : body.targetRolesJson }
            : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.status === 'PUBLISHED' && before.publishedAt === null ? { publishedAt: new Date() } : {}),
          updatedById: ctx.user.id,
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'HELP_ARTICLE_UPDATE',
        objectType: 'helpArticle',
        objectId: id,
        before: { title: before.title, status: before.status, categoryId: before.categoryId },
        after: { title: article.title, status: article.status, categoryId: article.categoryId },
        requestId: req.id,
      });
      return ok(article, req.id);
    },
  );

  app.post(
    '/admin/help/articles/:id/publish',
    { schema: { params: idParams }, preHandler: authorize('admin:help:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const before = await db.helpArticle.findUnique({ where: { id } });
      if (!before) throw notFound();
      const article = await db.helpArticle.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), updatedById: ctx.user.id },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'HELP_ARTICLE_PUBLISH',
        objectType: 'helpArticle',
        objectId: id,
        before: { status: before.status },
        after: { status: article.status, publishedAt: article.publishedAt },
        requestId: req.id,
      });
      return ok(article, req.id);
    },
  );

  app.post(
    '/admin/help/articles/:id/archive',
    { schema: { params: idParams }, preHandler: authorize('admin:help:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const before = await db.helpArticle.findUnique({ where: { id } });
      if (!before) throw notFound();
      const article = await db.helpArticle.update({
        where: { id },
        data: { status: 'ARCHIVED', updatedById: ctx.user.id },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'HELP_ARTICLE_ARCHIVE',
        objectType: 'helpArticle',
        objectId: id,
        before: { status: before.status },
        after: { status: article.status },
        requestId: req.id,
      });
      return ok(article, req.id);
    },
  );
}

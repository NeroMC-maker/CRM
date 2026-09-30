import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { sha256, tokenAleatorio } from '../core/auth/password';
import { getDb, type Db } from '../core/db/client';
import { sesiones, usuarios } from '../core/db/schema';
import { exigir, type Accion, type Actor } from '../core/domain/roles';

export type Env = { Variables: { actor: Actor; db: Db } };

const COOKIE = 'tl_sesion';
const DURACION_SESION_MS = 12 * 3_600_000; // una jornada

export const conDb: MiddlewareHandler<Env> = async (c, next) => {
  c.set('db', getDb());
  await next();
};

export async function iniciarSesion(c: Context<Env>, usuarioId: string) {
  const token = tokenAleatorio();
  await c.var.db.insert(sesiones).values({
    id: await sha256(token),
    usuarioId,
    expiraEn: new Date(Date.now() + DURACION_SESION_MS),
  });
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: DURACION_SESION_MS / 1000,
  });
}

export async function cerrarSesion(c: Context<Env>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.var.db.delete(sesiones).where(eq(sesiones.id, await sha256(token)));
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Exige sesión válida y deja el Actor en el contexto. */
export const requiereSesion: MiddlewareHandler<Env> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) throw new HTTPException(401, { message: 'Inicia sesión.' });
  const [fila] = await c.var.db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      centroId: usuarios.centroId,
      instructorId: usuarios.instructorId,
      activo: usuarios.activo,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(and(eq(sesiones.id, await sha256(token)), gt(sesiones.expiraEn, new Date())));
  if (!fila || !fila.activo) throw new HTTPException(401, { message: 'Tu sesión expiró. Vuelve a entrar.' });
  const { activo: _a, ...actor } = fila;
  c.set('actor', actor);
  await next();
};

export function permiso(accion: Accion): MiddlewareHandler<Env> {
  return async (c, next) => {
    exigir(c.var.actor, accion);
    await next();
  };
}

/** Valida el cuerpo JSON con zod; el mensaje de error va en español al usuario. */
export async function cuerpo<T extends z.ZodType>(c: Context, esquema: T): Promise<z.infer<T>> {
  const datos = await c.req.json().catch(() => null);
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const primero = r.error.issues[0];
    throw new HTTPException(400, {
      message: `Dato inválido${primero?.path.length ? ` en «${primero.path.join('.')}»` : ''}: ${primero?.message ?? ''}`,
    });
  }
  return r.data;
}

export const fechaStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD');
export const uuidStr = z.uuid('identificador inválido');

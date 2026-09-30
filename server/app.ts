import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { verificarPassword } from '../core/auth/password';
import { usuarios } from '../core/db/schema';
import { CAPACIDADES, NoAutorizado } from '../core/domain/roles';
import { ErrorNegocio } from '../core/errores';
import { cerrarSesion, conDb, cuerpo, iniciarSesion, requiereSesion, type Env } from './contexto';
import { catalogos } from './rutas/catalogos';
import { operacion } from './rutas/operacion';

/** App de la API. La misma instancia sirve en Node (desarrollo) y en Cloudflare Workers. */
export const app = new Hono<Env>().basePath('/api');

app.onError((err, c) => {
  if (err instanceof ErrorNegocio) return c.json({ error: err.message, detalles: err.detalles }, err.status);
  if (err instanceof NoAutorizado) return c.json({ error: err.message }, 403);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof z.ZodError) return c.json({ error: `Dato inválido: ${err.issues[0]?.message ?? ''}` }, 400);
  console.error(err);
  return c.json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' }, 500);
});

app.use('*', conDb);

app.post('/auth/login', async (c) => {
  const d = await cuerpo(c, z.object({ email: z.string().trim().toLowerCase(), password: z.string() }));
  const [u] = await c.var.db.select().from(usuarios).where(eq(usuarios.email, d.email));
  // Mismo mensaje exista o no el correo, para no revelar cuentas.
  if (!u || !u.activo || !(await verificarPassword(d.password, u.passwordHash))) {
    return c.json({ error: 'Correo o contraseña incorrectos.' }, 401);
  }
  await iniciarSesion(c, u.id);
  await c.var.db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, u.id));
  return c.json({ ok: true });
});

app.post('/auth/logout', async (c) => {
  await cerrarSesion(c);
  return c.json({ ok: true });
});

app.use('*', requiereSesion);

app.get('/auth/yo', (c) => {
  const actor = c.var.actor;
  return c.json({ ...actor, permisos: CAPACIDADES[actor.rol] });
});

app.route('/', catalogos);
app.route('/', operacion);

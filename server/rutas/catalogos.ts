import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { hashPassword } from '../../core/auth/password';
import { centros, instructores, ofertas, productos, puntosRecojo, usuarios, vehiculos } from '../../core/db/schema';
import { ofertaVigente } from '../../core/domain/precios';
import { puedeAsignarRol } from '../../core/domain/roles';
import { hoyLima } from '../../core/domain/tiempo';
import { auditar } from '../../core/services/auditoria';
import { ofertasActivas } from '../../core/services/ventas';
import { cuerpo, fechaStr, permiso, uuidStr, type Env } from '../contexto';

export const catalogos = new Hono<Env>();

// ---- Centros
catalogos.get('/centros', async (c) =>
  c.json(await c.var.db.select().from(centros).where(eq(centros.activo, true)).orderBy(asc(centros.nombre))),
);

const centroSchema = z.object({
  nombre: z.string().min(1),
  direccion: z.string().nullish(),
  telefono: z.string().nullish(),
  horaApertura: z.number().int().min(0).max(23),
  horaCierre: z.number().int().min(1).max(24),
});
catalogos.put('/centros/:id', permiso('centro.editar'), async (c) => {
  const datos = await cuerpo(c, centroSchema);
  if (datos.horaCierre <= datos.horaApertura) throw new HTTPException(400, { message: 'El cierre debe ser después de la apertura.' });
  const [fila] = await c.var.db.update(centros).set(datos).where(eq(centros.id, c.req.param('id'))).returning();
  await auditar(c.var.db, c.var.actor, 'centro.editar', 'centro', c.req.param('id'), datos);
  return c.json(fila);
});

// ---- Puntos de recojo (sedes, puntos de encuentro, domicilio)
catalogos.get('/puntos-recojo', async (c) =>
  c.json(await c.var.db.select().from(puntosRecojo).where(eq(puntosRecojo.activo, true)).orderBy(asc(puntosRecojo.orden))),
);

// ---- Vehículos (flota)
catalogos.get('/vehiculos', async (c) =>
  c.json(await c.var.db.select().from(vehiculos).orderBy(asc(vehiculos.orden), asc(vehiculos.placa))),
);

const vehiculoSchema = z.object({
  placa: z.string().trim().min(5).transform((s) => s.toUpperCase()),
  nombre: z.string().trim().nullish(),
  colorHorario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color inválido').default('#2563eb'),
  orden: z.number().int().default(0),
  marca: z.string().trim().min(1),
  modelo: z.string().trim().min(1),
  anio: z.number().int().min(1990).max(2100).nullish(),
  transmision: z.enum(['mecanica', 'automatica']),
  categoria: z.string().trim().min(1),
  color: z.string().nullish(),
  centroId: uuidStr,
  estado: z.enum(['activo', 'mantenimiento', 'baja']),
  soatVence: fechaStr.nullish(),
  revisionVence: fechaStr.nullish(),
  notas: z.string().nullish(),
});
catalogos.post('/vehiculos', permiso('flota.editar'), async (c) => {
  const datos = await cuerpo(c, vehiculoSchema);
  const [fila] = await c.var.db.insert(vehiculos).values(datos).returning();
  await auditar(c.var.db, c.var.actor, 'vehiculo.crear', 'vehiculo', fila!.id, datos);
  return c.json(fila, 201);
});
catalogos.put('/vehiculos/:id', permiso('flota.editar'), async (c) => {
  const datos = await cuerpo(c, vehiculoSchema);
  const [fila] = await c.var.db
    .update(vehiculos)
    .set({ ...datos, actualizadoEn: new Date() })
    .where(eq(vehiculos.id, c.req.param('id')))
    .returning();
  if (!fila) throw new HTTPException(404, { message: 'Carro no encontrado.' });
  await auditar(c.var.db, c.var.actor, 'vehiculo.editar', 'vehiculo', fila.id, datos);
  return c.json(fila);
});

// ---- Instructores
catalogos.get('/instructores', async (c) =>
  c.json(await c.var.db.select().from(instructores).orderBy(asc(instructores.nombres))),
);
const instructorSchema = z.object({
  nombres: z.string().trim().min(1),
  dni: z.string().nullish(),
  telefono: z.string().nullish(),
  licencia: z.string().nullish(),
  categorias: z.array(z.string()).min(1),
  centroId: uuidStr.nullish(),
  activo: z.boolean(),
});
catalogos.post('/instructores', permiso('instructor.editar'), async (c) => {
  const datos = await cuerpo(c, instructorSchema);
  const [fila] = await c.var.db.insert(instructores).values(datos).returning();
  await auditar(c.var.db, c.var.actor, 'instructor.crear', 'instructor', fila!.id, datos);
  return c.json(fila, 201);
});
catalogos.put('/instructores/:id', permiso('instructor.editar'), async (c) => {
  const datos = await cuerpo(c, instructorSchema);
  const [fila] = await c.var.db.update(instructores).set(datos).where(eq(instructores.id, c.req.param('id'))).returning();
  if (!fila) throw new HTTPException(404, { message: 'Instructor no encontrado.' });
  await auditar(c.var.db, c.var.actor, 'instructor.editar', 'instructor', fila.id, datos);
  return c.json(fila);
});

// ---- Productos y ofertas
catalogos.get('/productos', async (c) => {
  const lista = await c.var.db.select().from(productos).orderBy(asc(productos.orden), asc(productos.nombre));
  const ofs = await ofertasActivas(c.var.db);
  const hoy = hoyLima();
  return c.json(
    lista.map((p) => {
      const o = ofertaVigente(ofs, p.id, hoy);
      return {
        ...p,
        precioRegular: Number(p.precioRegular),
        oferta: o ? { id: o.id, nombre: o.nombre, precio: o.precio, hasta: o.hasta } : null,
      };
    }),
  );
});
const productoSchema = z.object({
  nombre: z.string().trim().min(1),
  tipo: z.enum(['paquete', 'otro']),
  horas: z.number().int().min(0).max(100),
  precioRegular: z.number().min(0),
  orden: z.number().int().default(0),
  activo: z.boolean(),
});
catalogos.post('/productos', permiso('producto.editar'), async (c) => {
  const d = await cuerpo(c, productoSchema);
  const [fila] = await c.var.db
    .insert(productos)
    .values({ ...d, precioRegular: d.precioRegular.toFixed(2) })
    .returning();
  await auditar(c.var.db, c.var.actor, 'producto.crear', 'producto', fila!.id, d);
  return c.json(fila, 201);
});
catalogos.put('/productos/:id', permiso('producto.editar'), async (c) => {
  const d = await cuerpo(c, productoSchema);
  const [antes] = await c.var.db.select().from(productos).where(eq(productos.id, c.req.param('id')));
  if (!antes) throw new HTTPException(404, { message: 'Producto no encontrado.' });
  const [fila] = await c.var.db
    .update(productos)
    .set({ ...d, precioRegular: d.precioRegular.toFixed(2) })
    .where(eq(productos.id, antes.id))
    .returning();
  await auditar(c.var.db, c.var.actor, 'producto.editar', 'producto', antes.id, {
    antes: { precioRegular: antes.precioRegular },
    despues: d,
  });
  return c.json(fila);
});

catalogos.get('/ofertas', async (c) =>
  c.json(
    await c.var.db
      .select({
        id: ofertas.id,
        productoId: ofertas.productoId,
        producto: productos.nombre,
        nombre: ofertas.nombre,
        precio: sql<number>`${ofertas.precio}::float`,
        desde: ofertas.desde,
        hasta: ofertas.hasta,
        activa: ofertas.activa,
      })
      .from(ofertas)
      .innerJoin(productos, eq(productos.id, ofertas.productoId))
      .orderBy(asc(ofertas.hasta)),
  ),
);
const ofertaSchema = z.object({
  productoId: uuidStr,
  nombre: z.string().trim().min(1),
  precio: z.number().min(0),
  desde: fechaStr,
  hasta: fechaStr,
  activa: z.boolean(),
});
catalogos.post('/ofertas', permiso('producto.editar'), async (c) => {
  const d = await cuerpo(c, ofertaSchema);
  if (d.hasta < d.desde) throw new HTTPException(400, { message: 'La oferta termina antes de empezar.' });
  const [fila] = await c.var.db.insert(ofertas).values({ ...d, precio: d.precio.toFixed(2) }).returning();
  await auditar(c.var.db, c.var.actor, 'oferta.crear', 'oferta', fila!.id, d);
  return c.json(fila, 201);
});
catalogos.put('/ofertas/:id', permiso('producto.editar'), async (c) => {
  const d = await cuerpo(c, ofertaSchema);
  if (d.hasta < d.desde) throw new HTTPException(400, { message: 'La oferta termina antes de empezar.' });
  const [fila] = await c.var.db
    .update(ofertas)
    .set({ ...d, precio: d.precio.toFixed(2) })
    .where(eq(ofertas.id, c.req.param('id')))
    .returning();
  await auditar(c.var.db, c.var.actor, 'oferta.editar', 'oferta', c.req.param('id'), d);
  return c.json(fila);
});

// ---- Usuarios
catalogos.get('/usuarios', permiso('usuario.editar'), async (c) =>
  c.json(
    await c.var.db
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rol: usuarios.rol,
        centroId: usuarios.centroId,
        instructorId: usuarios.instructorId,
        activo: usuarios.activo,
        ultimoAcceso: usuarios.ultimoAcceso,
      })
      .from(usuarios)
      .orderBy(asc(usuarios.nombre)),
  ),
);
const usuarioSchema = z.object({
  nombre: z.string().trim().min(1),
  email: z.email('correo inválido').transform((s) => s.toLowerCase()),
  rol: z.enum(['propietario', 'admin', 'vendedor', 'instructor']),
  centroId: uuidStr.nullish(),
  instructorId: uuidStr.nullish(),
  activo: z.boolean(),
  password: z.string().min(8, 'mínimo 8 caracteres').optional(),
});
catalogos.post('/usuarios', permiso('usuario.editar'), async (c) => {
  const d = await cuerpo(c, usuarioSchema);
  if (!puedeAsignarRol(c.var.actor, d.rol)) throw new HTTPException(403, { message: 'No puedes crear ese rol.' });
  if (!d.password) throw new HTTPException(400, { message: 'Indica una contraseña inicial (mínimo 8 caracteres).' });
  const { password, ...resto } = d;
  const [fila] = await c.var.db
    .insert(usuarios)
    .values({ ...resto, passwordHash: await hashPassword(password) })
    .returning({ id: usuarios.id });
  await auditar(c.var.db, c.var.actor, 'usuario.crear', 'usuario', fila!.id, { ...resto });
  return c.json(fila, 201);
});
catalogos.put('/usuarios/:id', permiso('usuario.editar'), async (c) => {
  const d = await cuerpo(c, usuarioSchema);
  const id = c.req.param('id');
  const [antes] = await c.var.db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!antes) throw new HTTPException(404, { message: 'Usuario no encontrado.' });
  const cambiaRol = antes.rol !== d.rol;
  if (antes.rol === 'propietario' && c.var.actor.rol !== 'propietario') {
    throw new HTTPException(403, { message: 'Solo el propietario puede modificar su cuenta.' });
  }
  if (cambiaRol && !puedeAsignarRol(c.var.actor, d.rol, id)) {
    throw new HTTPException(403, { message: 'No puedes asignar ese rol.' });
  }
  const { password, ...resto } = d;
  await c.var.db
    .update(usuarios)
    .set({ ...resto, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
    .where(eq(usuarios.id, id));
  await auditar(c.var.db, c.var.actor, 'usuario.editar', 'usuario', id, { ...resto, cambioClave: !!password });
  return c.json({ id });
});

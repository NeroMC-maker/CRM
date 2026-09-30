import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { alumnos, auditoria, clases, instructores, usuarios, vehiculos } from '../../core/db/schema';
import { puede } from '../../core/domain/roles';
import { hoyLima, instanteLima, sumarDias } from '../../core/domain/tiempo';
import { analisis } from '../../core/services/analisis';
import { auditar } from '../../core/services/auditoria';
import {
  asignarInstructor,
  cambiarEstadoClase,
  clasesSinInstructor,
  instructoresLibres,
  asignarTurno,
  crearBloqueo,
  editarDetallesClase,
  eliminarBloqueo,
  listarBloqueos,
  listarClases,
  listarTurnos,
  reprogramarClase,
  reservarClase,
  versionCalendario,
} from '../../core/services/clases';
import { agregarSeguimiento, cambiarEtapa, completarSeguimiento, historialDe, tablero } from '../../core/services/crm';
import { panelHoy } from '../../core/services/hoy';
import { anularVenta, paquetesDeAlumno, registrarVenta, ventasDeAlumno } from '../../core/services/ventas';
import { cuerpo, fechaStr, permiso, uuidStr, type Env } from '../contexto';

export const operacion = new Hono<Env>();

const metodo = z.enum(['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta']);
const etapa = z.enum(['nuevo', 'contactado', 'interesado', 'matriculado', 'perdido']);
const limpiar = (q: string) => `%${q.replace(/[%_]/g, '')}%`;

// ---- Panel de hoy
operacion.get('/hoy', async (c) => c.json(await panelHoy(c.var.db, c.var.actor, c.req.query('centroId') || undefined)));

// ---- Alumnos / prospectos
operacion.get('/alumnos', permiso('alumno.editar'), async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const patron = limpiar(q);
  const filas = await c.var.db
    .select()
    .from(alumnos)
    .where(
      q
        ? or(
            ilike(sql`${alumnos.nombres} || ' ' || ${alumnos.apellidos}`, patron),
            ilike(alumnos.dni, patron),
            ilike(alumnos.telefono, patron),
          )
        : undefined,
    )
    .orderBy(desc(alumnos.creadoEn))
    .limit(q ? 20 : 200);
  return c.json(filas);
});

const alumnoSchema = z.object({
  nombres: z.string().trim().min(1, 'escribe el nombre'),
  apellidos: z.string().trim().default(''),
  dni: z.string().trim().nullish(),
  telefono: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  categoriaBuscada: z.string().nullish(),
  origen: z.enum(['whatsapp', 'web', 'referido', 'facebook', 'local', 'otro']).default('otro'),
  notas: z.string().nullish(),
});
operacion.post('/alumnos', permiso('alumno.editar'), async (c) => {
  const d = await cuerpo(c, alumnoSchema.extend({ etapa: etapa.exclude(['matriculado', 'perdido']).optional() }));
  const [fila] = await c.var.db.insert(alumnos).values({ ...d, vendedorId: c.var.actor.id }).returning();
  await auditar(c.var.db, c.var.actor, 'alumno.crear', 'alumno', fila!.id);
  return c.json(fila, 201);
});
operacion.put('/alumnos/:id', permiso('alumno.editar'), async (c) => {
  const d = await cuerpo(c, alumnoSchema);
  const [fila] = await c.var.db
    .update(alumnos)
    .set({ ...d, actualizadoEn: new Date() })
    .where(eq(alumnos.id, c.req.param('id')))
    .returning();
  if (!fila) throw new HTTPException(404, { message: 'Alumno no encontrado.' });
  await auditar(c.var.db, c.var.actor, 'alumno.editar', 'alumno', fila.id, d);
  return c.json(fila);
});
operacion.get('/alumnos/:id', permiso('alumno.editar'), async (c) => {
  const id = c.req.param('id');
  const [alumno] = await c.var.db
    .select({ a: alumnos, vendedor: usuarios.nombre })
    .from(alumnos)
    .leftJoin(usuarios, eq(usuarios.id, alumnos.vendedorId))
    .where(eq(alumnos.id, id));
  if (!alumno) throw new HTTPException(404, { message: 'Alumno no encontrado.' });
  const [paquetes, ventas, historial, historialClases] = await Promise.all([
    paquetesDeAlumno(c.var.db, id),
    ventasDeAlumno(c.var.db, id),
    historialDe(c.var.db, id),
    c.var.db
      .select({
        id: clases.id,
        inicio: clases.inicio,
        fin: clases.fin,
        estado: clases.estado,
        notas: clases.notas,
        paqueteId: clases.paqueteId,
        centroId: clases.centroId,
        vehiculoId: clases.vehiculoId,
        placa: vehiculos.placa,
        instructorId: clases.instructorId,
        instructor: instructores.nombres,
        alumnoId: clases.alumnoId,
        alumno: sql<string>`${alumnos.nombres} || ' ' || ${alumnos.apellidos}`,
        telefonoAlumno: alumnos.telefono,
      })
      .from(clases)
      .innerJoin(vehiculos, eq(vehiculos.id, clases.vehiculoId))
      .innerJoin(alumnos, eq(alumnos.id, clases.alumnoId))
      .leftJoin(instructores, eq(instructores.id, clases.instructorId))
      .where(eq(clases.alumnoId, id))
      .orderBy(desc(clases.inicio)),
  ]);
  return c.json({ alumno: { ...alumno.a, vendedor: alumno.vendedor }, paquetes, ventas, historial, clases: historialClases });
});
operacion.get('/alumnos/:id/paquetes', permiso('alumno.editar'), async (c) =>
  c.json(await paquetesDeAlumno(c.var.db, c.req.param('id'))),
);

// ---- CRM
operacion.get('/crm/tablero', permiso('alumno.editar'), async (c) => {
  const soloMios = c.req.query('mios') === '1';
  return c.json(
    await tablero(c.var.db, { vendedorId: soloMios ? c.var.actor.id : undefined, q: c.req.query('q') || undefined }),
  );
});
operacion.patch('/alumnos/:id/etapa', async (c) => {
  const d = await cuerpo(c, z.object({ etapa, motivo: z.string().nullish() }));
  return c.json(await cambiarEtapa(c.var.db, c.var.actor, c.req.param('id'), d.etapa, d.motivo));
});
operacion.post('/alumnos/:id/seguimientos', async (c) => {
  const d = await cuerpo(
    c,
    z.object({
      tipo: z.enum(['nota', 'llamada', 'whatsapp', 'visita', 'tarea']),
      texto: z.string(),
      fecha: fechaStr.nullish(),
      hora: z.number().int().min(0).max(23).nullish(),
    }),
  );
  const venceEn = d.fecha ? instanteLima(d.fecha, d.hora ?? 9) : null;
  return c.json(await agregarSeguimiento(c.var.db, c.var.actor, c.req.param('id'), { tipo: d.tipo, texto: d.texto, venceEn }), 201);
});
operacion.patch('/seguimientos/:id/completar', async (c) =>
  c.json(await completarSeguimiento(c.var.db, c.var.actor, c.req.param('id'))),
);

/** Paquetes con horas por agendar (para el calendario). */
operacion.get('/paquetes/por-agendar', permiso('clase.agendar'), async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const patron = limpiar(q);
  const paqueteId = c.req.query('paqueteId') ? uuidStr.parse(c.req.query('paqueteId')) : null;
  const res = await c.var.db.execute(sql`
    select p.id as paquete_id, a.id as alumno_id, a.nombres || ' ' || a.apellidos as alumno, a.dni, a.telefono, a.direccion,
           p.nombre as producto, p.horas_compradas,
           p.horas_compradas - coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                                         where c.paquete_id = p.id and c.estado <> 'cancelada'), 0) as horas_disponibles
    from paquetes p join alumnos a on a.id = p.alumno_id
    where p.estado = 'activo'
      ${paqueteId ? sql`and p.id = ${paqueteId}` : sql``}
      ${q ? sql`and (a.nombres || ' ' || a.apellidos ilike ${patron} or a.dni ilike ${patron} or a.telefono ilike ${patron})` : sql``}
    order by p.creado_en desc limit 30`);
  return c.json(
    (res.rows as { horas_disponibles: string }[])
      .map((r) => ({ ...r, horas_disponibles: Number(r.horas_disponibles) }))
      .filter((r) => r.horas_disponibles > 0),
  );
});

// ---- Ventas (carrito)
const ventaSchema = z.object({
  alumnoId: uuidStr,
  centroId: uuidStr,
  items: z
    .array(z.object({ productoId: uuidStr, recargaPaqueteId: uuidStr.nullish(), precioManual: z.number().nullish() }))
    .min(1, 'agrega al menos un producto'),
  motivoDescuento: z.string().nullish(),
  /** Siempre se cobra completo: solo el método de pago. */
  metodo,
});
operacion.post('/ventas', async (c) => {
  const venta = await registrarVenta(c.var.db, c.var.actor, await cuerpo(c, ventaSchema));
  return c.json(venta, 201);
});
operacion.post('/ventas/:id/anular', async (c) => {
  const d = await cuerpo(c, z.object({ motivo: z.string() }));
  await anularVenta(c.var.db, c.var.actor, c.req.param('id'), d.motivo);
  return c.json({ ok: true });
});

// ---- Clases
operacion.get('/clases', async (c) => {
  const desde = fechaStr.parse(c.req.query('desde') ?? hoyLima());
  const hasta = fechaStr.parse(c.req.query('hasta') ?? desde);
  const centroId = c.req.query('centroId') || undefined;
  return c.json(
    await listarClases(c.var.db, c.var.actor, {
      centroId,
      desde: instanteLima(desde, 0),
      hasta: instanteLima(sumarDias(hasta, 1), 0),
    }),
  );
});
operacion.get('/clases/version', async (c) => {
  const centroId = c.req.query('centroId') ? uuidStr.parse(c.req.query('centroId')) : undefined;
  return c.json({ version: await versionCalendario(c.var.db, centroId) });
});
operacion.get('/clases/sin-instructor', permiso('clase.agendar'), async (c) =>
  c.json(await clasesSinInstructor(c.var.db, c.req.query('centroId') || undefined)),
);
operacion.get('/clases/:id/instructores-libres', permiso('clase.agendar'), async (c) =>
  c.json(await instructoresLibres(c.var.db, c.req.param('id'))),
);

/** 'YYYY-MM-DD' + hora con media hora (7.5 = 7:30) → instante en Lima. */
const enLima = (fecha: string, hora: number) => instanteLima(fecha, Math.floor(hora), Math.round((hora % 1) * 60));
const horaTramo = z.number().min(0).max(24).refine((h) => Number.isInteger(h * 2), 'usa horas en punto o y media');
const duracionH = z.number().min(0.5).max(12).refine((h) => Number.isInteger(h * 2), 'la duración va en tramos de 30 min');

const reservaSchema = z.object({
  tipo: z.enum(['clase', 'acompanamiento']).default('clase'),
  paqueteId: uuidStr.nullish(),
  alumnoId: uuidStr.nullish(),
  vehiculoId: uuidStr,
  fecha: fechaStr,
  hora: horaTramo,
  duracion: duracionH.default(2),
  instructorId: uuidStr.nullish(),
  puntoRecojoId: uuidStr.nullish(),
  direccionRecojo: z.string().nullish(),
  notas: z.string().nullish(),
});
operacion.post('/clases', async (c) => {
  const d = await cuerpo(c, reservaSchema);
  const inicio = enLima(d.fecha, d.hora);
  const clase = await reservarClase(c.var.db, c.var.actor, {
    tipo: d.tipo,
    paqueteId: d.paqueteId,
    alumnoId: d.alumnoId,
    vehiculoId: d.vehiculoId,
    inicio,
    fin: new Date(inicio.getTime() + d.duracion * 3_600_000),
    instructorId: d.instructorId,
    puntoRecojoId: d.puntoRecojoId,
    direccionRecojo: d.direccionRecojo,
    notas: d.notas,
  });
  return c.json(clase, 201);
});
operacion.patch('/clases/:id/reprogramar', async (c) => {
  const d = await cuerpo(c, z.object({ vehiculoId: uuidStr, fecha: fechaStr, hora: horaTramo, duracion: duracionH }));
  const inicio = enLima(d.fecha, d.hora);
  return c.json(
    await reprogramarClase(c.var.db, c.var.actor, c.req.param('id'), {
      vehiculoId: d.vehiculoId,
      inicio,
      fin: new Date(inicio.getTime() + d.duracion * 3_600_000),
    }),
  );
});
operacion.patch('/clases/:id/detalles', async (c) => {
  const d = await cuerpo(c, z.object({ puntoRecojoId: uuidStr.nullable(), direccionRecojo: z.string().nullable(), notas: z.string().nullable() }));
  return c.json(await editarDetallesClase(c.var.db, c.var.actor, c.req.param('id'), d));
});

// ---- Horario completo (clases + breaks + turnos) de un rango de fechas
operacion.get('/horario', async (c) => {
  const desde = fechaStr.parse(c.req.query('desde') ?? hoyLima());
  const hasta = fechaStr.parse(c.req.query('hasta') ?? desde);
  const ini = instanteLima(desde, 0);
  const fin = instanteLima(sumarDias(hasta, 1), 0);
  const [cls, bls, tns] = await Promise.all([
    listarClases(c.var.db, c.var.actor, { desde: ini, hasta: fin }),
    listarBloqueos(c.var.db, ini, fin),
    listarTurnos(c.var.db, ini, fin),
  ]);
  return c.json({ clases: cls, bloqueos: bls, turnos: tns });
});
operacion.post('/bloqueos', async (c) => {
  const d = await cuerpo(
    c,
    z.object({ vehiculoId: uuidStr, fecha: fechaStr, hora: horaTramo, duracion: duracionH, motivo: z.enum(['break', 'mantenimiento', 'otro']), nota: z.string().nullish() }),
  );
  const inicio = enLima(d.fecha, d.hora);
  return c.json(
    await crearBloqueo(c.var.db, c.var.actor, { vehiculoId: d.vehiculoId, inicio, fin: new Date(inicio.getTime() + d.duracion * 3_600_000), motivo: d.motivo, nota: d.nota }),
    201,
  );
});
operacion.delete('/bloqueos/:id', async (c) => {
  await eliminarBloqueo(c.var.db, c.var.actor, c.req.param('id'));
  return c.json({ ok: true });
});
operacion.put('/turnos', async (c) => {
  const d = await cuerpo(
    c,
    z.object({ vehiculoId: uuidStr, fecha: fechaStr, instructorId: uuidStr.nullable(), desde: horaTramo.optional(), hasta: horaTramo.optional() }),
  );
  return c.json(await asignarTurno(c.var.db, c.var.actor, d));
});
operacion.patch('/clases/:id/instructor', async (c) => {
  const d = await cuerpo(c, z.object({ instructorId: uuidStr.nullable() }));
  return c.json(await asignarInstructor(c.var.db, c.var.actor, c.req.param('id'), d.instructorId));
});
operacion.patch('/clases/:id/estado', async (c) => {
  const d = await cuerpo(c, z.object({ estado: z.enum(['programada', 'realizada', 'cancelada', 'no_asistio']) }));
  return c.json(await cambiarEstadoClase(c.var.db, c.var.actor, c.req.param('id'), d.estado));
});

// ---- Análisis
operacion.get('/analisis', async (c) => {
  const actor = c.var.actor;
  const verTodo = puede(actor, 'analisis.ver_todo');
  if (!verTodo && !puede(actor, 'analisis.ver_propio')) {
    throw new HTTPException(403, { message: 'No tienes acceso al análisis.' });
  }
  const hoy = hoyLima();
  const desde = fechaStr.parse(c.req.query('desde') ?? sumarDias(hoy, -29));
  const hasta = fechaStr.parse(c.req.query('hasta') ?? hoy);
  if (desde > hasta) throw new HTTPException(400, { message: 'La fecha inicial es posterior a la final.' });
  return c.json({
    alcance: verTodo ? 'todo' : 'propio',
    desde,
    hasta,
    ...(await analisis(c.var.db, {
      desde,
      hasta,
      centroId: c.req.query('centroId') || undefined,
      vendedorId: verTodo ? undefined : actor.id,
    })),
  });
});

// ---- Auditoría
operacion.get('/auditoria', permiso('auditoria.ver'), async (c) =>
  c.json(
    await c.var.db
      .select({
        id: auditoria.id,
        fecha: auditoria.fecha,
        usuario: usuarios.nombre,
        accion: auditoria.accion,
        entidad: auditoria.entidad,
        entidadId: auditoria.entidadId,
        datos: auditoria.datos,
      })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(c.req.query('entidadId') ? and(eq(auditoria.entidadId, c.req.query('entidadId')!)) : undefined)
      .orderBy(desc(auditoria.fecha))
      .limit(200),
  ),
);

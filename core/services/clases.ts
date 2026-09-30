import { and, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { alumnos, bloqueos, centros, clases, instructores, paquetes, puntosRecojo, turnos, vehiculos } from '../db/schema';
import { mensajeCruce, validarReserva, type TipoClase } from '../domain/agenda';
import { exigir, puede, type Actor } from '../domain/roles';
import { instanteLima } from '../domain/tiempo';
import { ErrorNegocio } from '../errores';
import { auditar } from './auditoria';

type EstadoClase = 'programada' | 'realizada' | 'cancelada' | 'no_asistio';

/** Error de Postgres por violar una restricción EXCLUDE (cruce de horario). */
function cruceDe(e: unknown): string | null {
  for (let err = e as { code?: string; constraint?: string; cause?: unknown } | undefined; err; err = err.cause as typeof err) {
    if (err.code === '23P01') return err.constraint ?? '';
  }
  return null;
}

async function conCruceAmigable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const c = cruceDe(e);
    if (c !== null) throw new ErrorNegocio(mensajeCruce(c), 409);
    throw e;
  }
}

/**
 * Bloquea la fila del carro hasta el fin de la transacción. Así, reservas y breaks del mismo
 * carro se procesan de a uno y no puede colarse una clase encima de un break (o al revés).
 */
async function bloquearCarro(tx: DbOrTx, vehiculoId: string) {
  const [v] = await tx.select().from(vehiculos).where(eq(vehiculos.id, vehiculoId)).for('update');
  if (!v) throw new ErrorNegocio('Carro no encontrado.', 404);
  return v;
}

const solapa = (inicio: Date, fin: Date) =>
  sql`tstzrange(${inicio.toISOString()}::timestamptz, ${fin.toISOString()}::timestamptz)`;

async function bloqueoEncima(tx: DbOrTx, vehiculoId: string, inicio: Date, fin: Date) {
  const [b] = await tx
    .select()
    .from(bloqueos)
    .where(and(eq(bloqueos.vehiculoId, vehiculoId), sql`tstzrange(${bloqueos.inicio}, ${bloqueos.fin}) && ${solapa(inicio, fin)}`))
    .limit(1);
  return b ?? null;
}

/** Instructor del turno que cubre ese momento en ese carro (o null). */
async function instructorDeTurno(tx: DbOrTx, vehiculoId: string, inicio: Date): Promise<string | null> {
  const [t] = await tx
    .select({ instructorId: turnos.instructorId })
    .from(turnos)
    .where(and(eq(turnos.vehiculoId, vehiculoId), sql`${turnos.inicio} <= ${inicio.toISOString()}::timestamptz`, gt(turnos.fin, inicio)))
    .limit(1);
  return t?.instructorId ?? null;
}

async function horasAgendadas(db: DbOrTx, paqueteId: string, excluirClaseId?: string): Promise<number> {
  const [r] = await db
    .select({ h: sql<string>`coalesce(sum(extract(epoch from (${clases.fin} - ${clases.inicio})) / 3600), 0)` })
    .from(clases)
    .where(and(eq(clases.paqueteId, paqueteId), ne(clases.estado, 'cancelada'), excluirClaseId ? ne(clases.id, excluirClaseId) : undefined));
  return Number(r?.h ?? 0);
}

interface DatosReserva {
  tipo: TipoClase;
  paqueteId: string | null;
  vehiculoId: string;
  instructorId: string | null;
  inicio: Date;
  fin: Date;
  excluirClaseId?: string;
}

async function validar(tx: DbOrTx, d: DatosReserva) {
  let paquete = null;
  if (d.paqueteId) {
    [paquete] = await tx.select().from(paquetes).where(eq(paquetes.id, d.paqueteId));
    if (!paquete) throw new ErrorNegocio('Paquete no encontrado.', 404);
    if (paquete.estado !== 'activo') throw new ErrorNegocio('El paquete está anulado.');
  }
  const vehiculo = await bloquearCarro(tx, d.vehiculoId);
  const [centro] = await tx.select().from(centros).where(eq(centros.id, vehiculo.centroId));
  if (!centro) throw new ErrorNegocio('Centro no encontrado.', 404);
  let instructor = null;
  if (d.instructorId) {
    [instructor] = await tx.select().from(instructores).where(eq(instructores.id, d.instructorId));
    if (!instructor) throw new ErrorNegocio('Instructor no encontrado.', 404);
  }
  const errores = validarReserva({
    tipo: d.tipo,
    inicio: d.inicio,
    fin: d.fin,
    centro,
    vehiculo,
    horasDisponibles: paquete ? paquete.horasCompradas - (await horasAgendadas(tx, paquete.id, d.excluirClaseId)) : null,
    instructor,
  });
  if (errores.length) throw new ErrorNegocio(errores[0]!, 400, errores);
  const b = await bloqueoEncima(tx, vehiculo.id, d.inicio, d.fin);
  if (b) throw new ErrorNegocio(`El carro ${vehiculo.nombre ?? vehiculo.placa} tiene ${b.motivo === 'break' ? 'un break' : 'un bloqueo'} en ese horario.`, 409);
  return { paquete, vehiculo, centro };
}

export interface NuevaReserva {
  tipo?: TipoClase;
  paqueteId?: string | null;
  /** Obligatorio si no hay paquete (acompañamiento). */
  alumnoId?: string | null;
  vehiculoId: string;
  inicio: Date;
  fin: Date;
  /** Si no se indica, se usa el instructor del turno de ese carro. */
  instructorId?: string | null;
  puntoRecojoId?: string | null;
  direccionRecojo?: string | null;
  notas?: string | null;
}

export async function reservarClase(db: Db, actor: Actor, input: NuevaReserva) {
  exigir(actor, 'clase.agendar');
  const tipo = input.tipo ?? 'clase';
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      if (input.paqueteId) {
        // Bloquea el paquete: dos reservas simultáneas no pueden pasarse de las horas compradas.
        await tx.select({ id: paquetes.id }).from(paquetes).where(eq(paquetes.id, input.paqueteId)).for('update');
      }
      const instructorId = input.instructorId ?? (await instructorDeTurno(tx, input.vehiculoId, input.inicio));
      const { paquete, vehiculo, centro } = await validar(tx, {
        tipo,
        paqueteId: input.paqueteId ?? null,
        vehiculoId: input.vehiculoId,
        instructorId,
        inicio: input.inicio,
        fin: input.fin,
      });
      const alumnoId = paquete?.alumnoId ?? input.alumnoId;
      if (!alumnoId) throw new ErrorNegocio('Elige al alumno.');
      if (paquete && input.alumnoId && input.alumnoId !== paquete.alumnoId) throw new ErrorNegocio('El paquete es de otro alumno.');
      const [clase] = await tx
        .insert(clases)
        .values({
          tipo,
          paqueteId: paquete?.id ?? null,
          alumnoId,
          vehiculoId: vehiculo.id,
          instructorId,
          centroId: centro.id,
          inicio: input.inicio,
          fin: input.fin,
          puntoRecojoId: input.puntoRecojoId ?? null,
          direccionRecojo: input.direccionRecojo?.trim() || null,
          notas: input.notas?.trim() || null,
          creadaPor: actor.id,
        })
        .returning();
      // Recuerda la dirección de domicilio para la próxima reserva.
      if (input.direccionRecojo?.trim()) {
        await tx.update(alumnos).set({ direccion: input.direccionRecojo.trim() }).where(eq(alumnos.id, alumnoId));
      }
      await auditar(tx, actor, 'clase.reservar', 'clase', clase!.id, {
        tipo,
        carro: vehiculo.nombre ?? vehiculo.placa,
        inicio: input.inicio.toISOString(),
        fin: input.fin.toISOString(),
      });
      return clase!;
    }),
  );
}

async function cargarClase(db: DbOrTx, claseId: string) {
  const [clase] = await db.select().from(clases).where(eq(clases.id, claseId));
  if (!clase) throw new ErrorNegocio('Clase no encontrada.', 404);
  return clase;
}

/** Cambiar horario, duración y/o carro de una clase programada. */
export async function reprogramarClase(db: Db, actor: Actor, claseId: string, input: { inicio: Date; fin: Date; vehiculoId: string }) {
  exigir(actor, 'clase.agendar');
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      const clase = await cargarClase(tx, claseId);
      if (clase.estado !== 'programada') throw new ErrorNegocio('Solo se reprograman clases programadas.');
      // Si el nuevo carro/horario tiene turno, la clase toma ese instructor; si no, conserva el suyo.
      const instructorId = (await instructorDeTurno(tx, input.vehiculoId, input.inicio)) ?? clase.instructorId;
      const { vehiculo, centro } = await validar(tx, {
        tipo: clase.tipo,
        paqueteId: clase.paqueteId,
        vehiculoId: input.vehiculoId,
        instructorId,
        inicio: input.inicio,
        fin: input.fin,
        excluirClaseId: clase.id,
      });
      const [act] = await tx
        .update(clases)
        .set({ inicio: input.inicio, fin: input.fin, vehiculoId: vehiculo.id, centroId: centro.id, instructorId, actualizadoEn: new Date() })
        .where(eq(clases.id, claseId))
        .returning();
      await auditar(tx, actor, 'clase.reprogramar', 'clase', claseId, {
        antes: { inicio: clase.inicio, fin: clase.fin, vehiculoId: clase.vehiculoId },
        despues: { inicio: input.inicio, fin: input.fin, vehiculoId: vehiculo.id },
      });
      return act!;
    }),
  );
}

/** Recojo y notas de una clase. */
export async function editarDetallesClase(
  db: Db,
  actor: Actor,
  claseId: string,
  input: { puntoRecojoId: string | null; direccionRecojo: string | null; notas: string | null },
) {
  exigir(actor, 'clase.agendar');
  const clase = await cargarClase(db, claseId);
  const [act] = await db
    .update(clases)
    .set({ puntoRecojoId: input.puntoRecojoId, direccionRecojo: input.direccionRecojo?.trim() || null, notas: input.notas?.trim() || null, actualizadoEn: new Date() })
    .where(eq(clases.id, claseId))
    .returning();
  if (input.direccionRecojo?.trim()) await db.update(alumnos).set({ direccion: input.direccionRecojo.trim() }).where(eq(alumnos.id, clase.alumnoId));
  await auditar(db, actor, 'clase.detalles', 'clase', claseId, input);
  return act!;
}

export async function asignarInstructor(db: Db, actor: Actor, claseId: string, instructorId: string | null) {
  exigir(actor, 'clase.agendar');
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      const clase = await cargarClase(tx, claseId);
      if (clase.estado !== 'programada') throw new ErrorNegocio('Solo se asigna instructor a clases programadas.');
      if (instructorId) {
        const [ins] = await tx.select().from(instructores).where(eq(instructores.id, instructorId));
        if (!ins || !ins.activo) throw new ErrorNegocio('Instructor no disponible.');
      }
      const [act] = await tx.update(clases).set({ instructorId, actualizadoEn: new Date() }).where(eq(clases.id, claseId)).returning();
      await auditar(tx, actor, 'clase.asignar_instructor', 'clase', claseId, { instructorId });
      return act!;
    }),
  );
}

export async function cambiarEstadoClase(db: Db, actor: Actor, claseId: string, estado: EstadoClase) {
  if (estado === 'cancelada' || estado === 'programada') exigir(actor, 'clase.agendar');
  else exigir(actor, 'clase.marcar');
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      const clase = await cargarClase(tx, claseId);
      if (actor.rol === 'instructor' && clase.instructorId !== actor.instructorId) {
        throw new ErrorNegocio('Solo puedes marcar tus propias clases.', 403);
      }
      if ((estado === 'realizada' || estado === 'no_asistio') && !clase.instructorId) {
        throw new ErrorNegocio('Asigna un instructor antes de marcar la clase.');
      }
      if (estado === 'programada' && clase.estado === 'cancelada') {
        throw new ErrorNegocio('Una clase cancelada no se reactiva; resérvala de nuevo.');
      }
      const [act] = await tx.update(clases).set({ estado, actualizadoEn: new Date() }).where(eq(clases.id, claseId)).returning();
      await auditar(tx, actor, `clase.${estado}`, 'clase', claseId, { antes: clase.estado });
      return act!;
    }),
  );
}

/** Clases entre dos instantes, con nombres para mostrar. centroId opcional (horario único de todos los carros). */
export async function listarClases(db: DbOrTx, actor: Actor, filtro: { centroId?: string; desde: Date; hasta: Date }) {
  const soloPropias = !puede(actor, 'clase.ver_todas');
  if (soloPropias && !actor.instructorId) return [];
  return db
    .select({
      id: clases.id,
      tipo: clases.tipo,
      inicio: clases.inicio,
      fin: clases.fin,
      estado: clases.estado,
      notas: clases.notas,
      paqueteId: clases.paqueteId,
      centroId: clases.centroId,
      vehiculoId: clases.vehiculoId,
      placa: vehiculos.placa,
      carro: sql<string>`coalesce(${vehiculos.nombre}, ${vehiculos.placa})`,
      instructorId: clases.instructorId,
      instructor: instructores.nombres,
      alumnoId: clases.alumnoId,
      alumno: sql<string>`${alumnos.nombres} || ' ' || ${alumnos.apellidos}`,
      telefonoAlumno: alumnos.telefono,
      puntoRecojoId: clases.puntoRecojoId,
      puntoRecojo: puntosRecojo.nombre,
      direccionRecojo: clases.direccionRecojo,
    })
    .from(clases)
    .innerJoin(alumnos, eq(alumnos.id, clases.alumnoId))
    .innerJoin(vehiculos, eq(vehiculos.id, clases.vehiculoId))
    .leftJoin(instructores, eq(instructores.id, clases.instructorId))
    .leftJoin(puntosRecojo, eq(puntosRecojo.id, clases.puntoRecojoId))
    .where(
      and(
        filtro.centroId ? eq(clases.centroId, filtro.centroId) : undefined,
        lt(clases.inicio, filtro.hasta),
        gt(clases.fin, filtro.desde),
        ne(clases.estado, 'cancelada'),
        soloPropias ? eq(clases.instructorId, actor.instructorId!) : undefined,
      ),
    )
    .orderBy(clases.inicio);
}

export async function clasesSinInstructor(db: DbOrTx, centroId?: string) {
  return db
    .select({
      id: clases.id,
      inicio: clases.inicio,
      fin: clases.fin,
      centroId: clases.centroId,
      centro: centros.nombre,
      placa: sql<string>`coalesce(${vehiculos.nombre}, ${vehiculos.placa})`,
      alumno: sql<string>`${alumnos.nombres} || ' ' || ${alumnos.apellidos}`,
    })
    .from(clases)
    .innerJoin(alumnos, eq(alumnos.id, clases.alumnoId))
    .innerJoin(vehiculos, eq(vehiculos.id, clases.vehiculoId))
    .innerJoin(centros, eq(centros.id, clases.centroId))
    .where(and(isNull(clases.instructorId), eq(clases.estado, 'programada'), centroId ? eq(clases.centroId, centroId) : undefined))
    .orderBy(clases.inicio);
}

/** Instructores activos sin otra clase en ese horario. */
export async function instructoresLibres(db: DbOrTx, claseId: string) {
  const clase = await cargarClase(db, claseId);
  const res = await db.execute<{ id: string; nombres: string }>(sql`
    select i.id, i.nombres from instructores i
    where i.activo
      and not exists (
        select 1 from clases c
        where c.instructor_id = i.id and c.estado <> 'cancelada' and c.id <> ${clase.id}
          and tstzrange(c.inicio, c.fin) && tstzrange(${clase.inicio.toISOString()}::timestamptz, ${clase.fin.toISOString()}::timestamptz)
      )
    order by i.nombres`);
  return res.rows;
}

// ------------------------------------------------------------------ Breaks y bloqueos

export async function crearBloqueo(
  db: Db,
  actor: Actor,
  input: { vehiculoId: string; inicio: Date; fin: Date; motivo: 'break' | 'mantenimiento' | 'otro'; nota?: string | null },
) {
  exigir(actor, 'clase.agendar');
  if (input.fin <= input.inicio) throw new ErrorNegocio('El fin debe ser después del inicio.');
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      const v = await bloquearCarro(tx, input.vehiculoId);
      const [c] = await tx
        .select({ alumno: sql<string>`${alumnos.nombres} || ' ' || ${alumnos.apellidos}` })
        .from(clases)
        .innerJoin(alumnos, eq(alumnos.id, clases.alumnoId))
        .where(
          and(
            eq(clases.vehiculoId, v.id),
            ne(clases.estado, 'cancelada'),
            sql`tstzrange(${clases.inicio}, ${clases.fin}) && ${solapa(input.inicio, input.fin)}`,
          ),
        )
        .limit(1);
      if (c) throw new ErrorNegocio(`Hay una clase de ${c.alumno} en ese horario. Muévela primero.`, 409);
      const [b] = await tx
        .insert(bloqueos)
        .values({ vehiculoId: v.id, inicio: input.inicio, fin: input.fin, motivo: input.motivo, nota: input.nota?.trim() || null, creadoPor: actor.id })
        .returning();
      await auditar(tx, actor, 'bloqueo.crear', 'bloqueo', b!.id, { carro: v.nombre ?? v.placa, motivo: input.motivo });
      return b!;
    }),
  );
}

export async function eliminarBloqueo(db: Db, actor: Actor, bloqueoId: string) {
  exigir(actor, 'clase.agendar');
  const [b] = await db.delete(bloqueos).where(eq(bloqueos.id, bloqueoId)).returning();
  if (!b) throw new ErrorNegocio('Bloqueo no encontrado.', 404);
  await auditar(db, actor, 'bloqueo.eliminar', 'bloqueo', bloqueoId, { motivo: b.motivo, inicio: b.inicio });
}

export async function listarBloqueos(db: DbOrTx, desde: Date, hasta: Date) {
  return db
    .select()
    .from(bloqueos)
    .where(and(lt(bloqueos.inicio, hasta), gt(bloqueos.fin, desde)))
    .orderBy(bloqueos.inicio);
}

// ------------------------------------------------------------------ Turnos (instructor por carro y día)

/**
 * Asigna (o quita, con instructorId null) el instructor de un carro en una fecha, desde/hasta una hora.
 * Reemplaza los turnos de ese carro en ese tramo y actualiza las clases programadas del tramo.
 */
export async function asignarTurno(
  db: Db,
  actor: Actor,
  input: { vehiculoId: string; fecha: string; instructorId: string | null; desde?: number; hasta?: number },
) {
  exigir(actor, 'clase.agendar');
  return conCruceAmigable(() =>
    db.transaction(async (tx) => {
      const v = await bloquearCarro(tx, input.vehiculoId);
      const [centro] = await tx.select().from(centros).where(eq(centros.id, v.centroId));
      const desde = input.desde ?? centro?.horaApertura ?? 7;
      const hasta = input.hasta ?? centro?.horaCierre ?? 22;
      if (hasta <= desde) throw new ErrorNegocio('El turno debe terminar después de empezar.');
      const inicio = instanteLima(input.fecha, Math.floor(desde), Math.round((desde % 1) * 60));
      const fin = instanteLima(input.fecha, Math.floor(hasta), Math.round((hasta % 1) * 60));
      // Recorta los turnos del carro que se cruzan con el nuevo tramo (p. ej. cambio de instructor a medio día):
      // se conserva la parte de antes y la de después.
      const previos = await tx
        .delete(turnos)
        .where(and(eq(turnos.vehiculoId, v.id), sql`tstzrange(${turnos.inicio}, ${turnos.fin}) && ${solapa(inicio, fin)}`))
        .returning();
      for (const t of previos) {
        if (t.inicio < inicio) await tx.insert(turnos).values({ vehiculoId: v.id, instructorId: t.instructorId, inicio: t.inicio, fin: inicio, creadoPor: actor.id });
        if (t.fin > fin) await tx.insert(turnos).values({ vehiculoId: v.id, instructorId: t.instructorId, inicio: fin, fin: t.fin, creadoPor: actor.id });
      }
      if (input.instructorId) {
        const [ins] = await tx.select().from(instructores).where(eq(instructores.id, input.instructorId));
        if (!ins || !ins.activo) throw new ErrorNegocio('Instructor no disponible.');
        await tx.insert(turnos).values({ vehiculoId: v.id, instructorId: ins.id, inicio, fin, creadoPor: actor.id });
      }
      // Las clases programadas de ese carro en ese tramo toman el instructor del turno.
      const actualizadas = await tx
        .update(clases)
        .set({ instructorId: input.instructorId, actualizadoEn: new Date() })
        .where(
          and(
            eq(clases.vehiculoId, v.id),
            eq(clases.estado, 'programada'),
            sql`${clases.inicio} >= ${inicio.toISOString()}::timestamptz`,
            sql`${clases.inicio} < ${fin.toISOString()}::timestamptz`,
          ),
        )
        .returning({ id: clases.id });
      await auditar(tx, actor, 'turno.asignar', 'vehiculo', v.id, { fecha: input.fecha, desde, hasta, instructorId: input.instructorId, clases: actualizadas.length });
      return { clasesActualizadas: actualizadas.length };
    }),
  );
}

export async function listarTurnos(db: DbOrTx, desde: Date, hasta: Date) {
  return db
    .select({ id: turnos.id, vehiculoId: turnos.vehiculoId, instructorId: turnos.instructorId, instructor: instructores.nombres, inicio: turnos.inicio, fin: turnos.fin })
    .from(turnos)
    .innerJoin(instructores, eq(instructores.id, turnos.instructorId))
    .where(and(lt(turnos.inicio, hasta), gt(turnos.fin, desde)))
    .orderBy(turnos.inicio);
}

/**
 * Huella de los cambios del horario (clases, breaks y turnos). Las pantallas la consultan cada
 * pocos segundos y solo recargan cuando cambia: así todos ven las reservas de los demás.
 */
export async function versionCalendario(db: DbOrTx, centroId?: string): Promise<string> {
  const res = await db.execute<{ v: string }>(sql`
    select concat_ws('#',
      (select max(actualizado_en)::text || count(*) from clases ${centroId ? sql`where centro_id = ${centroId}` : sql``}),
      (select max(creado_en)::text || count(*) from bloqueos),
      (select max(creado_en)::text || count(*) from turnos)) as v`);
  return res.rows[0]?.v ?? '';
}

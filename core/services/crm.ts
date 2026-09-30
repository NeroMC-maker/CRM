import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { alumnos, cambiosEtapa, seguimientos, usuarios } from '../db/schema';
import { exigir, type Actor } from '../domain/roles';
import { ErrorNegocio } from '../errores';
import { auditar } from './auditoria';

export type Etapa = 'nuevo' | 'contactado' | 'interesado' | 'matriculado' | 'perdido';
export const ETAPAS: Etapa[] = ['nuevo', 'contactado', 'interesado', 'matriculado', 'perdido'];
export type TipoSeguimiento = 'nota' | 'llamada' | 'whatsapp' | 'visita' | 'tarea';

/** Mueve a una persona de etapa y lo deja en el historial del embudo. */
export async function moverEtapa(db: DbOrTx, actor: Actor, alumnoId: string, etapa: Etapa, motivoPerdida?: string | null) {
  const [a] = await db.select().from(alumnos).where(eq(alumnos.id, alumnoId));
  if (!a) throw new ErrorNegocio('Persona no encontrada.', 404);
  if (a.etapa === etapa) return a;
  if (etapa === 'perdido' && !motivoPerdida?.trim()) throw new ErrorNegocio('Indica por qué se perdió.');
  const [act] = await db
    .update(alumnos)
    .set({
      etapa,
      motivoPerdida: etapa === 'perdido' ? motivoPerdida!.trim() : null,
      convertidoEn: etapa === 'matriculado' ? (a.convertidoEn ?? new Date()) : a.convertidoEn,
      proximoSeguimiento: etapa === 'perdido' || etapa === 'matriculado' ? null : a.proximoSeguimiento,
      actualizadoEn: new Date(),
    })
    .where(eq(alumnos.id, alumnoId))
    .returning();
  await db.insert(cambiosEtapa).values({ alumnoId, de: a.etapa, a: etapa, usuarioId: actor.id });
  await auditar(db, actor, 'crm.etapa', 'alumno', alumnoId, { de: a.etapa, a: etapa, motivoPerdida });
  return act!;
}

export async function cambiarEtapa(db: Db, actor: Actor, alumnoId: string, etapa: Etapa, motivo?: string | null) {
  exigir(actor, 'alumno.editar');
  if (etapa === 'matriculado') throw new ErrorNegocio('Se matricula al registrar una venta.');
  return db.transaction((tx) => moverEtapa(tx, actor, alumnoId, etapa, motivo));
}

/** Registra una actividad. Si trae fecha, es una tarea pendiente y pasa a ser el próximo seguimiento. */
export async function agregarSeguimiento(
  db: Db,
  actor: Actor,
  alumnoId: string,
  input: { tipo: TipoSeguimiento; texto: string; venceEn?: Date | null },
) {
  exigir(actor, 'alumno.editar');
  if (!input.texto.trim()) throw new ErrorNegocio('Escribe el detalle.');
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(alumnos).where(eq(alumnos.id, alumnoId));
    if (!a) throw new ErrorNegocio('Persona no encontrada.', 404);
    const [s] = await tx
      .insert(seguimientos)
      .values({ alumnoId, usuarioId: actor.id, tipo: input.tipo, texto: input.texto.trim(), venceEn: input.venceEn ?? null })
      .returning();
    // Contactar a alguien "nuevo" lo avanza a "contactado".
    if (a.etapa === 'nuevo' && ['llamada', 'whatsapp', 'visita'].includes(input.tipo)) {
      await moverEtapa(tx, actor, alumnoId, 'contactado');
    }
    await recalcularProximo(tx, alumnoId);
    return s!;
  });
}

export async function completarSeguimiento(db: Db, actor: Actor, seguimientoId: string) {
  exigir(actor, 'alumno.editar');
  return db.transaction(async (tx) => {
    const [s] = await tx
      .update(seguimientos)
      .set({ completadoEn: new Date() })
      .where(and(eq(seguimientos.id, seguimientoId), isNull(seguimientos.completadoEn)))
      .returning();
    if (!s) throw new ErrorNegocio('La tarea no existe o ya estaba hecha.');
    await recalcularProximo(tx, s.alumnoId);
    return s;
  });
}

/** Próximo seguimiento = la tarea pendiente más cercana. */
async function recalcularProximo(db: DbOrTx, alumnoId: string) {
  await db.execute(sql`
    update alumnos set proximo_seguimiento = (
      select min(vence_en) from seguimientos where alumno_id = ${alumnoId} and vence_en is not null and completado_en is null
    ), actualizado_en = now()
    where id = ${alumnoId}`);
}

export async function historialDe(db: DbOrTx, alumnoId: string) {
  const acts = await db
    .select({
      id: seguimientos.id,
      tipo: seguimientos.tipo,
      texto: seguimientos.texto,
      venceEn: seguimientos.venceEn,
      completadoEn: seguimientos.completadoEn,
      fecha: seguimientos.creadoEn,
      usuario: usuarios.nombre,
    })
    .from(seguimientos)
    .innerJoin(usuarios, eq(usuarios.id, seguimientos.usuarioId))
    .where(eq(seguimientos.alumnoId, alumnoId))
    .orderBy(desc(seguimientos.creadoEn));
  const etapas = await db
    .select({ id: cambiosEtapa.id, de: cambiosEtapa.de, a: cambiosEtapa.a, fecha: cambiosEtapa.fecha, usuario: usuarios.nombre })
    .from(cambiosEtapa)
    .leftJoin(usuarios, eq(usuarios.id, cambiosEtapa.usuarioId))
    .where(eq(cambiosEtapa.alumnoId, alumnoId))
    .orderBy(desc(cambiosEtapa.fecha));
  return { actividades: acts, etapas };
}

/** Tablero del embudo: prospectos abiertos + matriculados/perdidos recientes (30 días). */
export async function tablero(db: DbOrTx, filtro: { vendedorId?: string; q?: string }) {
  const patron = filtro.q ? `%${filtro.q.replace(/[%_]/g, '')}%` : null;
  const res = await db.execute(sql`
    select a.id, a.nombres, a.apellidos, a.telefono, a.origen, a.etapa, a.proximo_seguimiento,
           a.motivo_perdida, a.creado_en, a.actualizado_en, u.nombre as vendedor,
           (select s.texto from seguimientos s where s.alumno_id = a.id order by s.creado_en desc limit 1) as ultima_actividad
    from alumnos a left join usuarios u on u.id = a.vendedor_id
    where (a.etapa in ('nuevo', 'contactado', 'interesado') or a.actualizado_en > now() - interval '30 days')
      ${filtro.vendedorId ? sql`and a.vendedor_id = ${filtro.vendedorId}` : sql``}
      ${patron ? sql`and (a.nombres || ' ' || a.apellidos ilike ${patron} or a.telefono ilike ${patron})` : sql``}
    order by a.proximo_seguimiento asc nulls last, a.creado_en desc
    limit 400`);
  return res.rows;
}

/** Tareas pendientes (vencidas o de hoy) del usuario. */
export async function tareasPendientes(db: DbOrTx, actor: Actor, hasta: Date) {
  return db
    .select({
      id: seguimientos.id,
      texto: seguimientos.texto,
      tipo: seguimientos.tipo,
      venceEn: seguimientos.venceEn,
      alumnoId: alumnos.id,
      alumno: sql<string>`${alumnos.nombres} || ' ' || ${alumnos.apellidos}`,
      telefono: alumnos.telefono,
    })
    .from(seguimientos)
    .innerJoin(alumnos, eq(alumnos.id, seguimientos.alumnoId))
    .where(
      and(
        isNull(seguimientos.completadoEn),
        lte(seguimientos.venceEn, hasta),
        actor.rol === 'vendedor' ? eq(seguimientos.usuarioId, actor.id) : undefined,
      ),
    )
    .orderBy(seguimientos.venceEn)
    .limit(50);
}

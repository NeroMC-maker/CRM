import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { puede, type Actor } from '../domain/roles';
import { hoyLima, instanteLima, sumarDias } from '../domain/tiempo';
import { tareasPendientes } from './crm';

/** Lo que el equipo necesita ver al empezar el día. */
export async function panelHoy(db: DbOrTx, actor: Actor, centroId?: string) {
  const hoy = hoyLima();
  const ini = instanteLima(hoy, 0);
  const fin = instanteLima(sumarDias(hoy, 1), 0);
  const en7 = instanteLima(sumarDias(hoy, 8), 0);
  const filtroCentro = centroId ? sql`and c.centro_id = ${centroId}` : sql``;
  const soloMias = actor.rol === 'vendedor';

  const [clasesHoy, sinInstructor, porAgendar, documentos, embudo, ventasHoy] = await Promise.all([
    db.execute(sql`
      select c.id, c.inicio, c.fin, c.estado, v.placa, i.nombres as instructor, ce.nombre as centro,
             a.id as alumno_id, a.nombres || ' ' || a.apellidos as alumno, a.telefono
      from clases c join vehiculos v on v.id = c.vehiculo_id join alumnos a on a.id = c.alumno_id
      join centros ce on ce.id = c.centro_id left join instructores i on i.id = c.instructor_id
      where c.estado <> 'cancelada' and c.inicio >= ${ini.toISOString()}::timestamptz and c.inicio < ${fin.toISOString()}::timestamptz ${filtroCentro}
        ${actor.rol === 'instructor' ? sql`and c.instructor_id = ${actor.instructorId}` : sql``}
      order by c.inicio`),
    db.execute(sql`
      select count(*)::int as n from clases c
      where c.estado = 'programada' and c.instructor_id is null
        and c.inicio >= ${ini.toISOString()}::timestamptz and c.inicio < ${en7.toISOString()}::timestamptz ${filtroCentro}`),
    // Alumnos con horas compradas sin agendar: hay que llamarlos para programar sus clases.
    puede(actor, 'clase.agendar')
      ? db.execute(sql`
          select p.id as paquete_id, a.id as alumno_id, a.nombres || ' ' || a.apellidos as alumno, a.telefono,
                 (p.horas_compradas - coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                                                where c.paquete_id = p.id and c.estado <> 'cancelada'), 0))::float as horas
          from paquetes p join alumnos a on a.id = p.alumno_id
          where p.estado = 'activo' ${soloMias ? sql`and a.vendedor_id = ${actor.id}` : sql``}
            and p.horas_compradas > coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                                              where c.paquete_id = p.id and c.estado <> 'cancelada'), 0)
          order by p.creado_en limit 8`)
      : Promise.resolve({ rows: [] }),
    db.execute(sql`
      select placa, soat_vence, revision_vence from vehiculos
      where estado = 'activo' and (soat_vence is null or revision_vence is null
        or soat_vence < (${hoy}::date + 30) or revision_vence < (${hoy}::date + 30))`),
    db.execute(sql`
      select etapa, count(*)::int as n from alumnos
      where etapa in ('nuevo', 'contactado', 'interesado') ${soloMias ? sql`and vendedor_id = ${actor.id}` : sql``}
      group by etapa`),
    db.execute(sql`
      select count(*)::int as ventas, coalesce(sum(total_cobrado), 0)::float as monto from ventas
      where estado = 'activa' and fecha >= ${ini.toISOString()}::timestamptz ${soloMias ? sql`and vendedor_id = ${actor.id}` : sql``}`),
  ]);

  return {
    fecha: hoy,
    clasesHoy: clasesHoy.rows,
    sinInstructor7d: (sinInstructor.rows[0] as { n: number } | undefined)?.n ?? 0,
    porAgendar: porAgendar.rows,
    documentos: documentos.rows,
    embudo: embudo.rows,
    ventasHoy: ventasHoy.rows[0],
    tareas: puede(actor, 'alumno.editar') ? await tareasPendientes(db, actor, fin) : [],
  };
}

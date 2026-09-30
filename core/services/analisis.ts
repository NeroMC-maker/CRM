import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { diasEntre, instanteLima, sumarDias } from '../domain/tiempo';

export interface FiltroAnalisis {
  desde: string; // 'YYYY-MM-DD' inclusive (Lima)
  hasta: string; // inclusive
  centroId?: string;
  vendedorId?: string;
}

type Filas = Record<string, unknown>[];

/**
 * Todo el cálculo pesado va en SQL: la API solo reenvía el resultado.
 * Así se mantiene dentro del límite de CPU del plan gratuito de Cloudflare.
 */
export async function analisis(db: DbOrTx, f: FiltroAnalisis) {
  const ini = instanteLima(f.desde, 0).toISOString();
  const fin = instanteLima(sumarDias(f.hasta, 1), 0).toISOString();
  const dias = diasEntre(f.desde, f.hasta) + 1;
  const condVenta: SQL = sql`v.estado = 'activa' and v.fecha >= ${ini}::timestamptz and v.fecha < ${fin}::timestamptz
    ${f.centroId ? sql`and v.centro_id = ${f.centroId}` : sql``}
    ${f.vendedorId ? sql`and v.vendedor_id = ${f.vendedorId}` : sql``}`;
  const condClase: SQL = sql`c.estado <> 'cancelada' and c.inicio >= ${ini}::timestamptz and c.inicio < ${fin}::timestamptz
    ${f.centroId ? sql`and c.centro_id = ${f.centroId}` : sql``}`;
  const condProspecto: SQL = sql`a.creado_en >= ${ini}::timestamptz and a.creado_en < ${fin}::timestamptz
    ${f.vendedorId ? sql`and a.vendedor_id = ${f.vendedorId}` : sql``}`;
  const q = async (s: SQL) => (await db.execute(s)).rows as Filas;

  const [
    resumen, serie, porProducto, porTipoPrecio, porVendedor, porCentro, cobros, ocupacion, demanda, origen,
    embudo, conversionOrigen, semanas, perdidas, conversionVendedor,
  ] = await Promise.all([
    q(sql`
      select count(*)::int as ventas,
             coalesce(sum(v.total_cobrado), 0)::float as vendido,
             coalesce(sum(v.total_regular - v.total_cobrado), 0)::float as descuento_total,
             coalesce(avg(v.total_cobrado), 0)::float as ticket_promedio,
             coalesce((select sum(vi.horas) from venta_items vi join ventas v on v.id = vi.venta_id where ${condVenta}), 0)::int as horas_vendidas,
             count(distinct v.alumno_id)::int as alumnos
      from ventas v where ${condVenta}`),
    // Serie diaria continua (días sin ventas = 0).
    q(sql`
      with d as (select generate_series(${f.desde}::date, ${f.hasta}::date, '1 day')::date as dia)
      select to_char(d.dia, 'YYYY-MM-DD') as dia,
             coalesce((select sum(v.total_cobrado) from ventas v
                       where ${condVenta} and (v.fecha at time zone 'America/Lima')::date = d.dia), 0)::float as vendido,
             coalesce((select sum(p.monto) from pagos p join ventas v on v.id = p.venta_id
                       where v.estado = 'activa' and (p.fecha at time zone 'America/Lima')::date = d.dia
                       ${f.centroId ? sql`and v.centro_id = ${f.centroId}` : sql``}
                       ${f.vendedorId ? sql`and v.vendedor_id = ${f.vendedorId}` : sql``}), 0)::float as cobrado
      from d order by d.dia`),
    q(sql`
      select p.nombre as producto, count(*)::int as unidades, sum(vi.precio_cobrado)::float as ingresos,
             count(*) filter (where vi.es_recarga)::int as recargas
      from venta_items vi join ventas v on v.id = vi.venta_id join productos p on p.id = vi.producto_id
      where ${condVenta} group by p.nombre, p.orden order by unidades desc, p.orden`),
    q(sql`
      select vi.tipo_precio, count(*)::int as items, sum(vi.precio_cobrado)::float as ingresos,
             sum(vi.precio_regular - vi.precio_cobrado)::float as dejado_de_cobrar
      from venta_items vi join ventas v on v.id = vi.venta_id
      where ${condVenta} group by vi.tipo_precio`),
    q(sql`
      select u.nombre as vendedor, count(*)::int as ventas, sum(v.total_cobrado)::float as ingresos,
             avg(v.total_cobrado)::float as ticket_promedio,
             (100.0 * count(*) filter (where v.total_cobrado < v.total_regular) / count(*))::float as pct_con_descuento
      from ventas v join usuarios u on u.id = v.vendedor_id
      where ${condVenta} group by u.nombre order by ingresos desc`),
    q(sql`
      select ce.nombre as centro, count(*)::int as ventas, sum(v.total_cobrado)::float as ingresos
      from ventas v join centros ce on ce.id = v.centro_id
      where ${condVenta} group by ce.nombre order by ingresos desc`),
    q(sql`
      select pg.metodo, sum(pg.monto)::float as monto, count(*)::int as pagos
      from pagos pg join ventas v on v.id = pg.venta_id
      where v.estado = 'activa' and pg.fecha >= ${ini}::timestamptz and pg.fecha < ${fin}::timestamptz
        ${f.centroId ? sql`and v.centro_id = ${f.centroId}` : sql``}
        ${f.vendedorId ? sql`and v.vendedor_id = ${f.vendedorId}` : sql``}
      group by pg.metodo order by monto desc`),
    // Ocupación = horas con clase / horas que el centro atiende en el periodo, por carro.
    q(sql`
      select ve.placa, ve.marca || ' ' || ve.modelo as carro, ve.transmision, ce.nombre as centro,
             coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                       where c.vehiculo_id = ve.id and ${condClase}), 0)::float as horas_uso,
             ((ce.hora_cierre - ce.hora_apertura) * ${dias})::float as horas_disponibles
      from vehiculos ve join centros ce on ce.id = ve.centro_id
      where ve.estado <> 'baja' ${f.centroId ? sql`and ve.centro_id = ${f.centroId}` : sql``}
      order by ce.nombre, ve.placa`),
    // Demanda: día de la semana (1 = lunes) × hora de inicio.
    q(sql`
      select extract(isodow from c.inicio at time zone 'America/Lima')::int as dow,
             extract(hour from c.inicio at time zone 'America/Lima')::int as hora, count(*)::int as clases
      from clases c where ${condClase} group by 1, 2`),
    q(sql`
      select a.origen, count(distinct v.alumno_id)::int as alumnos
      from ventas v join alumnos a on a.id = v.alumno_id
      where ${condVenta} group by a.origen order by alumnos desc`),
    // Embudo: de los prospectos creados en el periodo, cuántos llegaron a cada etapa (o más allá).
    q(sql`
      select count(*)::int as nuevo,
             count(*) filter (where a.etapa in ('contactado', 'interesado', 'matriculado')
               or exists (select 1 from cambios_etapa ce where ce.alumno_id = a.id and ce.a in ('contactado', 'interesado', 'matriculado')))::int as contactado,
             count(*) filter (where a.etapa in ('interesado', 'matriculado')
               or exists (select 1 from cambios_etapa ce where ce.alumno_id = a.id and ce.a in ('interesado', 'matriculado')))::int as interesado,
             count(*) filter (where a.etapa = 'matriculado')::int as matriculado,
             count(*) filter (where a.etapa = 'perdido')::int as perdido,
             coalesce(avg(extract(epoch from (a.convertido_en - a.creado_en)) / 86400) filter (where a.convertido_en is not null), 0)::float as dias_a_matricula
      from alumnos a where ${condProspecto}`),
    q(sql`
      select a.origen, count(*)::int as prospectos, count(*) filter (where a.etapa = 'matriculado')::int as matriculados
      from alumnos a where ${condProspecto} group by a.origen order by prospectos desc`),
    q(sql`
      with s as (select generate_series(date_trunc('week', ${f.desde}::date), ${f.hasta}::date, '1 week')::date as semana)
      select to_char(s.semana, 'YYYY-MM-DD') as semana,
             (select count(*) from alumnos a where date_trunc('week', a.creado_en at time zone 'America/Lima')::date = s.semana
               ${f.vendedorId ? sql`and a.vendedor_id = ${f.vendedorId}` : sql``})::int as prospectos,
             (select count(*) from alumnos a where a.convertido_en is not null
               and date_trunc('week', a.convertido_en at time zone 'America/Lima')::date = s.semana
               ${f.vendedorId ? sql`and a.vendedor_id = ${f.vendedorId}` : sql``})::int as matriculados
      from s order by s.semana`),
    q(sql`
      select coalesce(nullif(trim(a.motivo_perdida), ''), 'Sin motivo') as motivo, count(*)::int as n
      from alumnos a where a.etapa = 'perdido' and a.actualizado_en >= ${ini}::timestamptz and a.actualizado_en < ${fin}::timestamptz
        ${f.vendedorId ? sql`and a.vendedor_id = ${f.vendedorId}` : sql``}
      group by 1 order by n desc limit 8`),
    q(sql`
      select u.nombre as vendedor, count(*)::int as prospectos, count(*) filter (where a.etapa = 'matriculado')::int as matriculados,
             count(*) filter (where a.etapa in ('nuevo', 'contactado', 'interesado') and (a.proximo_seguimiento is null or a.proximo_seguimiento < now()))::int as sin_seguimiento
      from alumnos a join usuarios u on u.id = a.vendedor_id
      where ${condProspecto} group by u.nombre order by matriculados desc`),
  ]);

  const cobrado = (cobros as { monto: number }[]).reduce((s, r) => s + r.monto, 0);
  return {
    resumen: { ...(resumen[0] as Record<string, number>), cobrado },
    serie,
    porProducto,
    porTipoPrecio,
    porVendedor,
    porCentro,
    cobros,
    ocupacion: (ocupacion as { horas_uso: number; horas_disponibles: number }[]).map((r) => ({
      ...r,
      pct: r.horas_disponibles > 0 ? Math.round((1000 * r.horas_uso) / r.horas_disponibles) / 10 : 0,
    })),
    demanda,
    origen,
    crm: { embudo: embudo[0], conversionOrigen, semanas, perdidas, conversionVendedor },
  };
}

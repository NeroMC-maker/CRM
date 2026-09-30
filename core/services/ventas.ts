import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/client';
import { alumnos, centros, clases, ofertas, pagos, paquetes, productos, ventaItems, ventas } from '../db/schema';
import { calcularPrecio, ofertaVigente, PrecioInvalido, type PrecioCalculado } from '../domain/precios';
import { exigir, type Actor } from '../domain/roles';
import { hoyLima } from '../domain/tiempo';
import { ErrorNegocio } from '../errores';
import { auditar } from './auditoria';
import { moverEtapa } from './crm';

export type MetodoPago = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'tarjeta';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function ofertasActivas(db: DbOrTx) {
  const filas = await db.select().from(ofertas).where(eq(ofertas.activa, true));
  return filas.map((o) => ({ ...o, precio: Number(o.precio) }));
}

export interface ItemVenta {
  productoId: string;
  /** Si se indica, las horas se suman a este paquete del alumno en vez de crear uno nuevo. */
  recargaPaqueteId?: string | null;
  precioManual?: number | null;
}

export interface NuevaVenta {
  alumnoId: string;
  centroId: string;
  items: ItemVenta[];
  motivoDescuento?: string | null;
  /** Siempre se paga completo al vender: solo se indica el método. */
  metodo: MetodoPago;
}

/**
 * Venta rápida con carrito: venta + ítems + paquetes (nuevos o recargados) + pago por el TOTAL,
 * todo en UNA transacción. No hay adelantos ni saldos: la escuela cobra siempre completo.
 */
export async function registrarVenta(db: Db, actor: Actor, input: NuevaVenta) {
  exigir(actor, 'venta.crear');
  if (input.items.length === 0) throw new ErrorNegocio('El carrito está vacío.');
  if (input.items.length > 20) throw new ErrorNegocio('Demasiados ítems en una venta.');
  return db.transaction(async (tx) => {
    const [alumno] = await tx.select().from(alumnos).where(eq(alumnos.id, input.alumnoId));
    if (!alumno) throw new ErrorNegocio('Alumno no encontrado.', 404);
    const [centro] = await tx.select({ id: centros.id }).from(centros).where(eq(centros.id, input.centroId));
    if (!centro) throw new ErrorNegocio('Centro no encontrado.', 404);

    const ids = [...new Set(input.items.map((i) => i.productoId))];
    const prods = await tx.select().from(productos).where(inArray(productos.id, ids));
    const ofs = await ofertasActivas(tx);
    const hoy = hoyLima();

    const lineas: { item: ItemVenta; producto: (typeof prods)[number]; precio: PrecioCalculado }[] = [];
    for (const item of input.items) {
      const producto = prods.find((p) => p.id === item.productoId);
      if (!producto) throw new ErrorNegocio('Producto no encontrado.', 404);
      if (!producto.activo) throw new ErrorNegocio(`«${producto.nombre}» ya no se vende.`);
      if (item.recargaPaqueteId && producto.horas === 0) {
        throw new ErrorNegocio(`«${producto.nombre}» no tiene horas para recargar.`);
      }
      const oferta = ofertaVigente(ofs, producto.id, hoy);
      try {
        lineas.push({
          item,
          producto,
          precio: calcularPrecio({
            precioRegular: Number(producto.precioRegular),
            oferta: oferta ? { id: oferta.id, precio: oferta.precio } : null,
            precioManual: item.precioManual,
            motivo: input.motivoDescuento,
            actor,
          }),
        });
      } catch (e) {
        if (e instanceof PrecioInvalido) throw new ErrorNegocio(e.message);
        throw e;
      }
    }

    const totalRegular = r2(lineas.reduce((s, l) => s + l.precio.precioRegular, 0));
    const totalCobrado = r2(lineas.reduce((s, l) => s + l.precio.precioCobrado, 0));
    const hayManual = lineas.some((l) => l.precio.tipoPrecio === 'descuento_manual');

    const [venta] = await tx
      .insert(ventas)
      .values({
        alumnoId: alumno.id,
        vendedorId: actor.id,
        centroId: input.centroId,
        totalRegular: totalRegular.toFixed(2),
        totalCobrado: totalCobrado.toFixed(2),
        motivoDescuento: hayManual ? input.motivoDescuento?.trim() : null,
        autorizadoPor: hayManual ? actor.id : null,
      })
      .returning();
    if (!venta) throw new Error('No se pudo crear la venta');

    const paquetesTocados: string[] = [];
    for (const { item, producto, precio } of lineas) {
      let paqueteId: string | null = null;
      if (producto.horas > 0) {
        if (item.recargaPaqueteId) {
          const [p] = await tx
            .select()
            .from(paquetes)
            .where(eq(paquetes.id, item.recargaPaqueteId))
            .for('update');
          if (!p || p.alumnoId !== alumno.id) throw new ErrorNegocio('El paquete a recargar no es de este alumno.');
          if (p.estado !== 'activo') throw new ErrorNegocio('No se puede recargar un paquete anulado.');
          await tx
            .update(paquetes)
            .set({ horasCompradas: p.horasCompradas + producto.horas })
            .where(eq(paquetes.id, p.id));
          paqueteId = p.id;
        } else {
          const [p] = await tx
            .insert(paquetes)
            .values({ alumnoId: alumno.id, nombre: producto.nombre, horasCompradas: producto.horas, centroId: input.centroId })
            .returning();
          paqueteId = p!.id;
        }
      }
      if (paqueteId && !paquetesTocados.includes(paqueteId)) paquetesTocados.push(paqueteId);
      await tx.insert(ventaItems).values({
        ventaId: venta.id,
        productoId: producto.id,
        descripcion: item.recargaPaqueteId ? `Recarga ${producto.horas} h` : producto.nombre,
        precioRegular: precio.precioRegular.toFixed(2),
        precioCobrado: precio.precioCobrado.toFixed(2),
        ofertaId: precio.ofertaId,
        tipoPrecio: precio.tipoPrecio,
        horas: producto.horas,
        paqueteId,
        esRecarga: !!item.recargaPaqueteId,
      });
    }

    // Pago completo en el mismo momento (solo se omite si el total es S/ 0, p. ej. una cortesía).
    if (totalCobrado > 0) {
      await tx.insert(pagos).values({
        ventaId: venta.id,
        monto: totalCobrado.toFixed(2),
        metodo: input.metodo,
        registradoPor: actor.id,
      });
    }
    // Vender = matricular: el prospecto pasa a "matriculado" en el embudo.
    if (alumno.etapa !== 'matriculado') await moverEtapa(tx, actor, alumno.id, 'matriculado');

    await auditar(tx, actor, 'venta.crear', 'venta', venta.id, {
      items: lineas.map((l) => ({ producto: l.producto.nombre, recarga: !!l.item.recargaPaqueteId, ...l.precio })),
      totalCobrado,
      metodo: input.metodo,
    });
    return { ...venta, totalCobrado, paquetes: paquetesTocados };
  });
}

async function horasUsadas(db: DbOrTx, paqueteId: string, soloDictadas: boolean): Promise<number> {
  const [r] = await db
    .select({ h: sql<string>`coalesce(sum(extract(epoch from (${clases.fin} - ${clases.inicio})) / 3600), 0)` })
    .from(clases)
    .where(
      and(
        eq(clases.paqueteId, paqueteId),
        soloDictadas ? inArray(clases.estado, ['realizada', 'no_asistio']) : ne(clases.estado, 'cancelada'),
      ),
    );
  return Number(r?.h ?? 0);
}

/**
 * Anula una venta. Paquetes nuevos de la venta: se anulan y se cancelan sus clases (si ninguna se dictó).
 * Recargas: se descuentan las horas, siempre que no estén ya agendadas.
 */
export async function anularVenta(db: Db, actor: Actor, ventaId: string, motivo: string) {
  exigir(actor, 'venta.anular');
  if (!motivo.trim()) throw new ErrorNegocio('Indica el motivo de la anulación.');
  return db.transaction(async (tx) => {
    const [venta] = await tx.select().from(ventas).where(eq(ventas.id, ventaId)).for('update');
    if (!venta) throw new ErrorNegocio('Venta no encontrada.', 404);
    if (venta.estado === 'anulada') throw new ErrorNegocio('La venta ya está anulada.');
    const items = await tx.select().from(ventaItems).where(eq(ventaItems.ventaId, ventaId));
    for (const it of items) {
      if (!it.paqueteId) continue;
      const [p] = await tx.select().from(paquetes).where(eq(paquetes.id, it.paqueteId)).for('update');
      if (!p) continue;
      if (it.esRecarga) {
        const agendadas = await horasUsadas(tx, p.id, false);
        if (p.horasCompradas - it.horas < agendadas) {
          throw new ErrorNegocio('Las horas de la recarga ya están agendadas. Cancela esas clases primero.');
        }
        await tx.update(paquetes).set({ horasCompradas: p.horasCompradas - it.horas }).where(eq(paquetes.id, p.id));
      } else {
        if ((await horasUsadas(tx, p.id, true)) > 0) {
          throw new ErrorNegocio('El paquete ya tiene clases dictadas; no se puede anular la venta.');
        }
        await tx
          .update(clases)
          .set({ estado: 'cancelada', actualizadoEn: new Date() })
          .where(and(eq(clases.paqueteId, p.id), ne(clases.estado, 'cancelada')));
        await tx.update(paquetes).set({ estado: 'anulado' }).where(eq(paquetes.id, p.id));
      }
    }
    await tx.update(ventas).set({ estado: 'anulada' }).where(eq(ventas.id, ventaId));
    await auditar(tx, actor, 'venta.anular', 'venta', ventaId, { motivo });
  });
}

/** Paquetes (bolsas de horas) de un alumno. */
export async function paquetesDeAlumno(db: DbOrTx, alumnoId: string) {
  const res = await db.execute<{
    id: string;
    nombre: string;
    estado: string;
    creado_en: string;
    horas_compradas: number;
    horas_agendadas: string;
    horas_dictadas: string;
    recargas: number;
  }>(sql`
    select p.id, p.nombre, p.estado, p.creado_en, p.horas_compradas,
           coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                     where c.paquete_id = p.id and c.estado <> 'cancelada'), 0) as horas_agendadas,
           coalesce((select sum(extract(epoch from (c.fin - c.inicio)) / 3600) from clases c
                     where c.paquete_id = p.id and c.estado in ('realizada', 'no_asistio')), 0) as horas_dictadas,
           (select count(*)::int from venta_items vi join ventas v on v.id = vi.venta_id
             where vi.paquete_id = p.id and vi.es_recarga and v.estado = 'activa') as recargas
    from paquetes p where p.alumno_id = ${alumnoId}
    order by p.estado, p.creado_en desc`);
  return res.rows.map((r) => {
    const agendadas = Number(r.horas_agendadas);
    return {
      id: r.id,
      nombre: r.nombre,
      estado: r.estado,
      creadoEn: r.creado_en,
      recargas: r.recargas,
      horasCompradas: r.horas_compradas,
      horasAgendadas: agendadas,
      horasDictadas: Number(r.horas_dictadas),
      horasDisponibles: r.estado === 'activo' ? r.horas_compradas - agendadas : 0,
    };
  });
}

/** Ventas de un alumno con sus ítems y el método con que pagó. */
export async function ventasDeAlumno(db: DbOrTx, alumnoId: string) {
  const res = await db.execute<{
    id: string;
    fecha: string;
    estado: string;
    total_regular: string;
    total_cobrado: string;
    vendedor: string;
    metodo: string | null;
    items: { descripcion: string; precio_cobrado: number; precio_regular: number; tipo_precio: string; es_recarga: boolean }[];
  }>(sql`
    select v.id, v.fecha, v.estado, v.total_regular, v.total_cobrado, u.nombre as vendedor,
           (select string_agg(distinct pg.metodo::text, ', ') from pagos pg where pg.venta_id = v.id) as metodo,
           (select json_agg(json_build_object('descripcion', vi.descripcion, 'precio_cobrado', vi.precio_cobrado,
                    'precio_regular', vi.precio_regular, 'tipo_precio', vi.tipo_precio, 'es_recarga', vi.es_recarga))
              from venta_items vi where vi.venta_id = v.id) as items
    from ventas v join usuarios u on u.id = v.vendedor_id
    where v.alumno_id = ${alumnoId} order by v.fecha desc`);
  return res.rows.map((r) => {
    return {
      id: r.id,
      fecha: r.fecha,
      estado: r.estado,
      vendedor: r.vendedor,
      totalRegular: Number(r.total_regular),
      total: Number(r.total_cobrado),
      metodo: r.metodo,
      items: (r.items ?? []).map((i) => ({ ...i, precio_cobrado: Number(i.precio_cobrado), precio_regular: Number(i.precio_regular) })),
    };
  });
}

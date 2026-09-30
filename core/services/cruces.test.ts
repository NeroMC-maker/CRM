/**
 * Pruebas de integración contra el Postgres de desarrollo (`pnpm db` + `pnpm seed`).
 * Se saltan si no hay DATABASE_URL. Usan una fecha lejana y limpian todo lo que crean.
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client';
import {
  alumnos,
  auditoria,
  bloqueos,
  cambiosEtapa,
  centros,
  clases,
  pagos,
  paquetes,
  productos,
  instructores,
  turnos,
  usuarios,
  vehiculos,
  ventaItems,
  ventas,
} from '../db/schema';
import type { Actor } from '../domain/roles';
import { instanteLima } from '../domain/tiempo';
import { ErrorNegocio } from '../errores';
import { asignarTurno, crearBloqueo, reservarClase } from './clases';
import { anularVenta, paquetesDeAlumno, registrarVenta } from './ventas';

const url = process.env.DATABASE_URL;
const conn = url ? createDb(url) : null;

describe.skipIf(!conn)('integración (base de datos)', () => {
  const creados: string[] = [];
  const creadosBloqueos: string[] = [];
  let restaurar: (() => Promise<unknown>) | null = null;

  afterAll(async () => {
    if (!conn) return;
    const { db, pool } = conn;
    await restaurar?.();
    if (creadosBloqueos.length) await db.delete(bloqueos).where(inArray(bloqueos.id, creadosBloqueos));
    if (creados.length) {
      const vs = (await db.select({ id: ventas.id }).from(ventas).where(inArray(ventas.alumnoId, creados))).map((v) => v.id);
      await db.delete(clases).where(inArray(clases.alumnoId, creados));
      if (vs.length) {
        await db.delete(pagos).where(inArray(pagos.ventaId, vs));
        await db.delete(ventaItems).where(inArray(ventaItems.ventaId, vs));
        await db.delete(auditoria).where(inArray(auditoria.entidadId, vs));
        await db.delete(ventas).where(inArray(ventas.id, vs));
      }
      await db.delete(paquetes).where(inArray(paquetes.alumnoId, creados));
      await db.delete(cambiosEtapa).where(inArray(cambiosEtapa.alumnoId, creados));
      await db.delete(auditoria).where(inArray(auditoria.entidadId, creados));
      await db.delete(alumnos).where(inArray(alumnos.id, creados));
    }
    await pool.end();
  });

  async function contexto() {
    const { db } = conn!;
    const [u] = await db.select().from(usuarios).where(eq(usuarios.rol, 'propietario'));
    const [centro] = await db.select().from(centros).limit(1);
    if (!u || !centro) return null; // base sin seed
    const [carro] = await db.select().from(vehiculos).where(eq(vehiculos.centroId, centro.id)).limit(1);
    const prods = await db.select().from(productos);
    const actor: Actor = { id: u.id, nombre: u.nombre, rol: u.rol, centroId: null, instructorId: null };
    return { db, actor, centro, carro: carro!, p4: prods.find((p) => p.horas === 4)!, p2: prods.find((p) => p.horas === 2)!, examen: prods.find((p) => p.horas === 0)! };
  }

  async function nuevoAlumno(apellido: string) {
    const [a] = await conn!.db.insert(alumnos).values({ nombres: 'Prueba', apellidos: apellido }).returning();
    creados.push(a!.id);
    return a!;
  }

  it('carrito: paquete + examen en una venta; la recarga suma horas al mismo paquete', async () => {
    const ctx = await contexto();
    if (!ctx) return;
    const a = await nuevoAlumno('Carrito');
    const v1 = await registrarVenta(ctx.db, ctx.actor, {
      alumnoId: a.id,
      centroId: ctx.centro.id,
      metodo: 'yape',
      items: [{ productoId: ctx.p4.id }, { productoId: ctx.examen.id }],
    });
    const esperado = Number(ctx.p4.precioRegular) + Number(ctx.examen.precioRegular);
    expect(v1.totalCobrado).toBeCloseTo(esperado, 2);
    // Siempre se paga completo: un solo pago por el total, en la misma transacción.
    const pagosV1 = await ctx.db.select().from(pagos).where(eq(pagos.ventaId, v1.id));
    expect(pagosV1).toHaveLength(1);
    expect(Number(pagosV1[0]!.monto)).toBeCloseTo(esperado, 2);
    let [paq] = await paquetesDeAlumno(ctx.db, a.id);
    expect(paq?.horasCompradas).toBe(4);

    await registrarVenta(ctx.db, ctx.actor, {
      alumnoId: a.id,
      centroId: ctx.centro.id,
      metodo: 'yape',
      items: [{ productoId: ctx.p2.id, recargaPaqueteId: paq!.id }],
    });
    const lista = await paquetesDeAlumno(ctx.db, a.id);
    expect(lista).toHaveLength(1);
    [paq] = lista;
    expect(paq?.horasCompradas).toBe(6);

    const [alumno] = await ctx.db.select().from(alumnos).where(eq(alumnos.id, a.id));
    expect(alumno?.etapa).toBe('matriculado');
  });

  it('dos personas reservan el mismo carro a la vez: una entra, la otra recibe un aviso claro', async () => {
    const ctx = await contexto();
    if (!ctx) return;
    const [a, b] = [await nuevoAlumno('Cruce A'), await nuevoAlumno('Cruce B')];
    for (const al of [a, b]) {
      await registrarVenta(ctx.db, ctx.actor, { alumnoId: al.id, centroId: ctx.centro.id, metodo: 'efectivo', items: [{ productoId: ctx.p4.id }] });
    }
    const paqs = [(await paquetesDeAlumno(ctx.db, a.id))[0]!, (await paquetesDeAlumno(ctx.db, b.id))[0]!];

    const carro = ctx.carro;
    restaurar = () =>
      ctx.db.update(vehiculos).set({ soatVence: carro.soatVence, revisionVence: carro.revisionVence }).where(eq(vehiculos.id, carro.id));
    await ctx.db.update(vehiculos).set({ soatVence: '2099-12-31', revisionVence: '2099-12-31' }).where(eq(vehiculos.id, carro.id));
    const inicio = instanteLima('2099-06-01', 9);
    const resultados = await Promise.allSettled(
      paqs.map((p) => reservarClase(ctx.db, ctx.actor, { paqueteId: p.id, vehiculoId: carro.id, inicio, fin: new Date(inicio.getTime() + 2 * 3_600_000) })),
    );
    const fallos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]!.reason).toBeInstanceOf(ErrorNegocio);
    expect((fallos[0]!.reason as ErrorNegocio).status).toBe(409);
    expect((fallos[0]!.reason as ErrorNegocio).message).toMatch(/carro ya tiene una clase/);
  });

  it('no se reserva encima de un break, y el turno asigna el instructor (con cambio a medio día)', async () => {
    const ctx = await contexto();
    if (!ctx) return;
    const { db, actor, carro } = ctx;
    const [ins1, ins2] = await db.select().from(instructores).limit(2);
    if (!ins1 || !ins2) return;
    const a = await nuevoAlumno('Turno');
    await registrarVenta(db, actor, { alumnoId: a.id, centroId: ctx.centro.id, metodo: 'yape', items: [{ productoId: ctx.p4.id }] });
    const paq = (await paquetesDeAlumno(db, a.id))[0]!;
    await db.update(vehiculos).set({ soatVence: '2099-12-31', revisionVence: '2099-12-31' }).where(eq(vehiculos.id, carro.id));
    restaurar ??= () => db.update(vehiculos).set({ soatVence: carro.soatVence, revisionVence: carro.revisionVence }).where(eq(vehiculos.id, carro.id));
    const dia = '2099-08-03';
    try {
      const br = await crearBloqueo(db, actor, { vehiculoId: carro.id, inicio: instanteLima(dia, 12), fin: instanteLima(dia, 13), motivo: 'break' });
      creadosBloqueos.push(br.id);
      await expect(
        reservarClase(db, actor, { paqueteId: paq.id, vehiculoId: carro.id, inicio: instanteLima(dia, 11, 30), fin: instanteLima(dia, 12, 30) }),
      ).rejects.toThrow(/break/);

      await asignarTurno(db, actor, { vehiculoId: carro.id, fecha: dia, instructorId: ins1.id });
      const c1 = await reservarClase(db, actor, { paqueteId: paq.id, vehiculoId: carro.id, inicio: instanteLima(dia, 15, 30), fin: instanteLima(dia, 17) });
      expect(c1.instructorId).toBe(ins1.id); // toma el instructor del turno
      // Cambio de instructor desde las 14:00: la clase de las 15:30 pasa al nuevo; la mañana sigue con el primero.
      await asignarTurno(db, actor, { vehiculoId: carro.id, fecha: dia, instructorId: ins2.id, desde: 14, hasta: 22 });
      const [act] = await db.select().from(clases).where(eq(clases.id, c1.id));
      expect(act?.instructorId).toBe(ins2.id);
      const ts = await db.select().from(turnos).where(eq(turnos.vehiculoId, carro.id));
      const delDia = ts.filter((t) => t.inicio.toISOString().startsWith('2099-08-03'));
      expect(delDia.map((t) => t.instructorId).sort()).toEqual([ins1.id, ins2.id].sort());
    } finally {
      await db.delete(turnos).where(eq(turnos.vehiculoId, carro.id));
    }
  });

  it('no se puede anular una recarga cuyas horas ya están agendadas', async () => {
    const ctx = await contexto();
    if (!ctx) return;
    const a = await nuevoAlumno('Anular');
    await registrarVenta(ctx.db, ctx.actor, { alumnoId: a.id, centroId: ctx.centro.id, metodo: 'efectivo', items: [{ productoId: ctx.p2.id }] });
    const paq = (await paquetesDeAlumno(ctx.db, a.id))[0]!;
    const recarga = await registrarVenta(ctx.db, ctx.actor, {
      alumnoId: a.id,
      centroId: ctx.centro.id,
      metodo: 'yape',
      items: [{ productoId: ctx.p2.id, recargaPaqueteId: paq.id }],
    });
    await ctx.db.update(vehiculos).set({ soatVence: '2099-12-31', revisionVence: '2099-12-31' }).where(eq(vehiculos.id, ctx.carro.id));
    restaurar ??= () =>
      ctx.db.update(vehiculos).set({ soatVence: ctx.carro.soatVence, revisionVence: ctx.carro.revisionVence }).where(eq(vehiculos.id, ctx.carro.id));
    // Agenda las 4 horas (2 clases) → la recarga ya está en uso.
    await reservarClase(ctx.db, ctx.actor, { paqueteId: paq.id, vehiculoId: ctx.carro.id, inicio: instanteLima('2099-07-01', 9), fin: instanteLima('2099-07-01', 11) });
    await reservarClase(ctx.db, ctx.actor, { paqueteId: paq.id, vehiculoId: ctx.carro.id, inicio: instanteLima('2099-07-01', 13), fin: instanteLima('2099-07-01', 15) });
    await expect(anularVenta(ctx.db, ctx.actor, recarga.id, 'prueba')).rejects.toThrow(/ya están agendadas/);
  });
});

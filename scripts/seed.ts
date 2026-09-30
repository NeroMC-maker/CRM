/**
 * Datos iniciales. Idempotente: si ya hay centros, no hace nada.
 *   pnpm seed          → centros, carros, instructores, productos y usuarios
 *   pnpm seed --demo   → además 60 días de prospectos, ventas, pagos y clases de ejemplo
 *
 * Placas, instructores, personas y varios precios son DE EJEMPLO: cámbialos desde la app.
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../core/auth/password';
import { createDb } from '../core/db/client';
import { alumnos, bloqueos, centros, instructores, ofertas, productos, puntosRecojo, turnos, usuarios, vehiculos, ventas } from '../core/db/schema';
import type { Actor } from '../core/domain/roles';
import { hoyLima, instanteLima, sumarDias } from '../core/domain/tiempo';
import { cambiarEstadoClase, reservarClase } from '../core/services/clases';
import { agregarSeguimiento, cambiarEtapa } from '../core/services/crm';
import { registrarVenta } from '../core/services/ventas';

const url = process.env.DATABASE_URL;
const email = process.env.SEED_OWNER_EMAIL;
const password = process.env.SEED_OWNER_PASSWORD;
if (!url || !email || !password) throw new Error('Faltan DATABASE_URL, SEED_OWNER_EMAIL o SEED_OWNER_PASSWORD en .env');

const { db, pool } = createDb(url);
const demo = process.argv.includes('--demo');

const existentes = await db.select({ id: centros.id }).from(centros).limit(1);
if (existentes.length > 0) {
  console.log('La base ya tiene datos; no se cargó nada.');
  await pool.end();
  process.exit(0);
}

const [sanBorja, cercado] = await db
  .insert(centros)
  .values([
    { nombre: 'San Borja', direccion: 'Av. Aviación 2695, Of. 204', telefono: '934 128 785', horaApertura: 7, horaCierre: 22 },
    { nombre: 'Cercado de Lima', direccion: 'Jr. Coronel Miguel Baquero 169', telefono: '947 536 849', horaApertura: 7, horaCierre: 22 },
  ])
  .returning();
if (!sanBorja || !cercado) throw new Error('No se crearon los centros');

const hoy = hoyLima();
const unAnio = sumarDias(hoy, 365);
const carros = await db
  .insert(vehiculos)
  .values([
    // Nombres y colores como en el Excel de la escuela. Las placas son de EJEMPLO.
    { placa: 'EJM-101', nombre: 'KIA BLANCO', colorHorario: '#64748b', orden: 1, marca: 'Kia', modelo: 'Rio', anio: 2022, transmision: 'automatica', centroId: sanBorja.id, soatVence: unAnio, revisionVence: unAnio, notas: 'Placa de ejemplo' },
    { placa: 'EJM-102', nombre: 'KIA NEGRO', colorHorario: '#111827', orden: 2, marca: 'Kia', modelo: 'Rio', anio: 2023, transmision: 'automatica', centroId: sanBorja.id, soatVence: unAnio, revisionVence: unAnio, notas: 'Placa de ejemplo' },
    { placa: 'EJM-201', nombre: 'KIA AZUL', colorHorario: '#1d4ed8', orden: 3, marca: 'Kia', modelo: 'Picanto', anio: 2021, transmision: 'automatica', centroId: sanBorja.id, soatVence: unAnio, revisionVence: sumarDias(hoy, 20), notas: 'Placa de ejemplo' },
    { placa: 'EJM-202', nombre: 'MECÁNICO ROJO', colorHorario: '#dc2626', orden: 4, marca: 'Hyundai', modelo: 'Accent', anio: 2022, transmision: 'mecanica', centroId: sanBorja.id, soatVence: unAnio, revisionVence: unAnio, notas: 'Placa de ejemplo' },
  ])
  .returning();

// Instructores de ejemplo solo en la demo (con el Excel se importan los reales).
const inst = !demo ? [] : await db
  .insert(instructores)
  .values([
    { nombres: 'Instructor Ejemplo 1', categorias: ['A-I'] },
    { nombres: 'Instructor Ejemplo 2', categorias: ['A-I'] },
    { nombres: 'Instructor Ejemplo 3', categorias: ['A-I'] },
    { nombres: 'Instructor Ejemplo 4', categorias: ['A-I'] },
    { nombres: 'Instructor Ejemplo 5', categorias: ['A-I'] },
  ])
  .returning();

// Puntos de recojo publicados en tulicencia.com.pe
const puntos = await db
  .insert(puntosRecojo)
  .values([
    { nombre: 'Oficina San Borja', direccion: 'Av. Aviación 2695, Of. 204', tipo: 'sede', orden: 1 },
    { nombre: 'Oficina Cercado de Lima', direccion: 'Jr. Cnel. Miguel Baquero 169', tipo: 'sede', orden: 2 },
    { nombre: 'San Isidro – Parque de la Pera', tipo: 'punto', orden: 3 },
    { nombre: 'Surco – Parque de la Amistad', tipo: 'punto', orden: 4 },
    { nombre: 'Pueblo Libre – Parque de la Bandera', tipo: 'punto', orden: 5 },
    { nombre: 'Domicilio', tipo: 'domicilio', orden: 6 },
  ])
  .returning();

// 4 h y 10 h: precios publicados en tulicencia.com.pe. El resto: EJEMPLO, confirmar.
const paquetes = [
  { horas: 2, precio: 120 },
  { horas: 4, precio: 212 },
  { horas: 6, precio: 330 },
  { horas: 8, precio: 440 },
  { horas: 10, precio: 599 },
  { horas: 12, precio: 699 },
];
const prods = await db
  .insert(productos)
  .values([
    ...paquetes.map((p, i) => ({
      nombre: `Paquete ${p.horas} horas`,
      tipo: 'paquete' as const,
      horas: p.horas,
      precioRegular: p.precio.toFixed(2),
      orden: i + 1,
    })),
    { nombre: 'Examen médico', tipo: 'otro' as const, horas: 0, precioRegular: '129.00', orden: 10 },
  ])
  .returning();

const [owner] = await db
  .insert(usuarios)
  .values({ nombre: 'Propietario', email: email.toLowerCase(), passwordHash: await hashPassword(password), rol: 'propietario' })
  .returning();
const [vendedor] = await db
  .insert(usuarios)
  .values({ nombre: 'Vendedor Demo', email: 'vendedor@tulicencia.com.pe', passwordHash: await hashPassword(password), rol: 'vendedor', centroId: sanBorja.id })
  .returning();

console.log(`Datos iniciales cargados: 2 centros, 4 carros, ${inst.length} instructores, 6 puntos de recojo, 7 productos, 2 usuarios.`);
console.log(`Entra con ${email} o vendedor@tulicencia.com.pe (contraseña: SEED_OWNER_PASSWORD de .env).`);

if (demo && owner && vendedor) {
  // Generador pseudoaleatorio fijo: los datos de demo salen iguales cada vez.
  let semilla = 42;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const elegir = <T>(xs: readonly T[]) => xs[Math.floor(azar() * xs.length)]!;
  const actor = (u: typeof owner): Actor => ({ id: u.id, nombre: u.nombre, rol: u.rol, centroId: u.centroId, instructorId: null });
  const aOwner = actor(owner);

  const oferta10 = prods.find((p) => p.horas === 10)!;
  await db.insert(ofertas).values({ productoId: oferta10.id, nombre: 'Primavera', precio: '549.00', desde: sumarDias(hoy, -20), hasta: sumarDias(hoy, 10) });

  const NOMBRES = ['Lucía', 'Carlos', 'Valeria', 'Diego', 'Andrea', 'Jorge', 'Camila', 'Luis', 'Sofía', 'Mateo', 'Daniela', 'Renzo', 'Fiorella', 'Bruno', 'Ximena', 'Piero', 'Alessandra', 'Gonzalo', 'Mariana', 'Kevin'];
  const APELLIDOS = ['Quispe', 'Mendoza', 'Rojas', 'Huamán', 'Torres', 'Castillo', 'Flores', 'Ramírez', 'Vargas', 'Chávez', 'Salazar', 'Paredes'];
  const ORIGENES = ['whatsapp', 'whatsapp', 'whatsapp', 'facebook', 'facebook', 'referido', 'web', 'local'] as const;
  const MOTIVOS = ['Precio', 'Eligió otra escuela', 'No respondió', 'Horarios no le acomodan'];

  // Turnos (instructor por carro y día) y breaks, como la fila de abajo y los bloques amarillos del Excel.
  // Los turnos llegan hasta dentro de 3 días: más adelante hay clases "sin instructor" por asignar.
  for (let d = -60; d <= 12; d++) {
    const f = sumarDias(hoy, d);
    for (const [i, v] of carros.entries()) {
      if (d <= 3) {
        const ins = inst[(i + (Math.abs(d) % 2)) % inst.length]!;
        await db.insert(turnos).values({ vehiculoId: v.id, instructorId: ins.id, inicio: instanteLima(f, 7), fin: instanteLima(f, 22) });
      }
      const hb = [12, 12.5, 13, 13.5][i]!;
      await db.insert(bloqueos).values({ vehiculoId: v.id, inicio: instanteLima(f, Math.floor(hb), (hb % 1) * 60), fin: instanteLima(f, Math.floor(hb) + 1, (hb % 1) * 60), motivo: 'break' });
    }
  }
  const sb = puntos[0]!;
  const DOMICILIOS = ['Jr. Hermano Lobo 230, San Borja', 'Av. Buenavista 196, San Borja', 'Calle Cavallini 481, San Borja', 'Jr. Capac Yupanqui 2652, Lince'];

  let alumnosCreados = 0;
  let ventasCreadas = 0;
  let clasesCreadas = 0;

  for (let d = 60; d >= 0; d--) {
    const fecha = sumarDias(hoy, -d);
    const nuevosHoy = 1 + Math.floor(azar() * 2);
    for (let k = 0; k < nuevosHoy; k++) {
      const vend: typeof owner = azar() < 0.55 ? vendedor : owner;
      const aVend = actor(vend);
      const [al] = await db
        .insert(alumnos)
        .values({
          nombres: elegir(NOMBRES),
          apellidos: `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`,
          dni: String(40000000 + Math.floor(azar() * 39999999)),
          telefono: `9${String(Math.floor(azar() * 99999999)).padStart(8, '0')}`,
          origen: elegir(ORIGENES),
          vendedorId: vend.id,
        })
        .returning();
      if (!al) continue;
      alumnosCreados++;
      const creado = instanteLima(fecha, 9 + Math.floor(azar() * 9));
      await db.update(alumnos).set({ creadoEn: creado }).where(eq(alumnos.id, al.id));

      const destino = azar();
      if (destino < 0.15) continue; // sigue "nuevo"
      await agregarSeguimiento(db, aVend, al.id, { tipo: 'whatsapp', texto: 'Se le envió información de paquetes y horarios.' });
      if (destino < 0.3) {
        // contactado con tarea pendiente
        await agregarSeguimiento(db, aVend, al.id, {
          tipo: 'tarea',
          texto: 'Llamar para confirmar horario',
          venceEn: instanteLima(sumarDias(hoy, Math.floor(azar() * 5) - 2), 10 + Math.floor(azar() * 6)),
        });
        continue;
      }
      await cambiarEtapa(db, aVend, al.id, 'interesado');
      if (destino < 0.45) {
        await agregarSeguimiento(db, aVend, al.id, { tipo: 'tarea', texto: 'Enviar oferta vigente', venceEn: instanteLima(sumarDias(hoy, Math.floor(azar() * 4) - 1), 11) });
        continue;
      }
      if (destino < 0.58) {
        await cambiarEtapa(db, aVend, al.id, 'perdido', elegir(MOTIVOS));
        continue;
      }

      // Matriculado: venta (a veces carrito con examen médico), pago y clases.
      const prod = prods[[1, 2, 4, 4, 3, 5, 0, 4][Math.floor(azar() * 8)]!]!;
      const items: { productoId: string; precioManual?: number }[] = [{ productoId: prod.id }];
      if (azar() < 0.3) items.push({ productoId: prods.find((p) => p.tipo === 'otro')!.id });
      const conDescuento = vend === owner && azar() < 0.15;
      if (conDescuento) items[0]!.precioManual = Math.round(Number(prod.precioRegular) * 0.9);
      const centro = azar() < 0.55 ? sanBorja : cercado;
      const venta = await registrarVenta(db, aVend, {
        alumnoId: al.id,
        centroId: centro.id,
        items,
        motivoDescuento: conDescuento ? 'Convenio empresa (demo)' : null,
        metodo: elegir(['yape', 'yape', 'efectivo', 'plin', 'transferencia', 'tarjeta'] as const),
      });
      ventasCreadas++;
      // Se matricula entre 0 y 6 días después de llegar (nunca en el futuro).
      const diaVenta = [sumarDias(fecha, Math.floor(azar() * 7)), hoy].sort()[0]!;
      const fechaVenta = instanteLima(diaVenta, 10 + Math.floor(azar() * 8));
      await db.update(ventas).set({ fecha: fechaVenta }).where(eq(ventas.id, venta.id));
      await db.execute(sql`update pagos set fecha = ${fechaVenta.toISOString()}::timestamptz where venta_id = ${venta.id}`);
      await db.execute(sql`update alumnos set convertido_en = ${fechaVenta.toISOString()}::timestamptz where id = ${al.id}`);
      await db.execute(sql`update cambios_etapa set fecha = ${fechaVenta.toISOString()}::timestamptz where alumno_id = ${al.id}`);

      // Clases del paquete: cada 2–3 días desde la venta, de 1 h 30 o 2 h, a veces a la media hora.
      const [paq] = (await db.execute<{ id: string; horas_compradas: number }>(sql`
        select p.id, p.horas_compradas from paquetes p join venta_items vi on vi.paquete_id = p.id where vi.venta_id = ${venta.id} limit 1`)).rows;
      if (!paq) continue;
      const r = azar();
      const recojo = r < 0.5 ? sb : r < 0.8 ? elegir(puntos.slice(1, 5)) : puntos[5]!;
      const direccion = recojo.tipo === 'domicilio' ? elegir(DOMICILIOS) : null;
      let restantes = paq.horas_compradas;
      let dia = sumarDias(diaVenta, 1 + Math.floor(azar() * 2));
      while (restantes > 0 && dia <= sumarDias(hoy, 12)) {
        for (let intento = 0; intento < 10; intento++) {
          const dur = Math.min(restantes, azar() < 0.2 ? 1.5 : 2);
          const hora = 7 + 0.5 * Math.floor(azar() * 26);
          const inicio = instanteLima(dia, Math.floor(hora), (hora % 1) * 60);
          try {
            const clase = await reservarClase(db, aOwner, {
              paqueteId: paq.id,
              vehiculoId: elegir(carros).id,
              inicio,
              fin: new Date(inicio.getTime() + dur * 3_600_000),
              puntoRecojoId: recojo.id,
              direccionRecojo: direccion,
              notas: azar() < 0.08 ? 'Es menor de edad' : null,
            });
            clasesCreadas++;
            restantes -= dur;
            if (dia < hoy && clase.instructorId) await cambiarEstadoClase(db, aOwner, clase.id, azar() < 0.92 ? 'realizada' : 'no_asistio');
            break;
          } catch {
            /* cruce, break o fuera de horario: probar otra hora */
          }
        }
        dia = sumarDias(dia, 2 + Math.floor(azar() * 2));
      }
      // Algunos contratan acompañamiento al examen (bloque largo, sin descontar horas).
      if (azar() < 0.12) {
        const f = sumarDias(dia, 1);
        await reservarClase(db, aOwner, {
          tipo: 'acompanamiento',
          alumnoId: al.id,
          vehiculoId: elegir(carros).id,
          inicio: instanteLima(f, 7),
          fin: instanteLima(f, 11, 30),
          puntoRecojoId: sb.id,
          notas: 'Servicio de acompañamiento al examen (Callao)',
        }).catch(() => undefined);
      }
    }
  }
  console.log(`Demo: ${alumnosCreados} personas en el embudo, ${ventasCreadas} ventas, ${clasesCreadas} clases (60 días).`);
}

await pool.end();

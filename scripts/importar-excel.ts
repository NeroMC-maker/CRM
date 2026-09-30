/**
 * Importa el horario de la escuela exportado del Excel/Google Sheets (CSV) como datos de prueba.
 *
 *   pnpm importar:excel "C:\ruta\Horarios Tulicencia.com 2026 - Septiembre 2026.csv"            (simulación)
 *   pnpm importar:excel "C:\ruta\...csv" --guardar                                              (guarda)
 *
 * Estructura esperada (una hoja por mes, bloques por semana):
 *   Fecha, 1/9/2026, , , , 2/9/2026, ...     ← fila de fechas (cada fecha abarca sus columnas de carro)
 *   Día y Hora, Martes, ...
 *   , KIA BLANCO, KIA NEGRO, KIA AZUL, MECÁNICO ROJO, ...   ← cabecera de carros
 *   07:00 - 07:30, <celda>, ...               ← una fila por tramo de 30 min
 *   ...
 *   , Oscar, Javier y el nuevo, ...           ← instructor del turno por carro
 *
 * Cada celda es texto libre ("Nombre - teléfono - lugar - 7:30AM A 9:30AM"). Se extrae lo que se
 * puede; lo que no se entiende queda en un reporte (importacion-reporte.txt) para revisarlo.
 * Los alumnos importados reciben un paquete "Importado del Excel" con las horas de sus clases.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createDb } from '../core/db/client';
import { alumnos, bloqueos, centros, clases, instructores, paquetes, puntosRecojo, turnos, usuarios, vehiculos } from '../core/db/schema';
import type { Actor } from '../core/domain/roles';
import { hoyLima, instanteLima } from '../core/domain/tiempo';
import { crearBloqueo, reservarClase } from '../core/services/clases';

const ruta = process.argv[2];
const guardarDatos = process.argv.includes('--guardar');
if (!ruta || !fs.existsSync(ruta)) throw new Error('Indica la ruta del CSV exportado del Excel.');

// ------------------------------------------------------------------ CSV (con celdas multilínea entre comillas)
function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

const limpio = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ------------------------------------------------------------------ Interpretación de celdas
type Carro = 'KIA BLANCO' | 'KIA NEGRO' | 'KIA AZUL' | 'MECÁNICO ROJO';
function carroDeCabecera(txt: string, posicion: number): Carro | null {
  const t = sinTildes(txt).toUpperCase();
  if (t.includes('BLANCO')) return 'KIA BLANCO';
  if (t.includes('NEGRO') || /KYA N|KIA N\b/.test(t)) return 'KIA NEGRO';
  if (t.includes('ROJO') || t.startsWith('MEC')) return 'MECÁNICO ROJO';
  if (t.includes('AZUL') || t.startsWith('HYU')) return 'KIA AZUL';
  if (/^KYA A|^KIA A\b/.test(t)) return 'KIA BLANCO'; // primera columna de la hoja antigua
  const orden: Carro[] = ['KIA BLANCO', 'KIA NEGRO', 'KIA AZUL', 'MECÁNICO ROJO'];
  return t ? (orden[posicion] ?? null) : null;
}

/** Duración a partir de "7:30AM A 9:30AM", "8-10am", "12:30pm a 2:30pm", "3-5pm". */
function duracionDe(txt: string): number | null {
  const m = sinTildes(txt).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?\s*(?:a|-|–|al|hasta)\s*(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|m)?\b/);
  if (!m) return null;
  const ini = Number(m[1]) + Number(m[2] ?? 0) / 60;
  const fin = Number(m[3]) + Number(m[4] ?? 0) / 60;
  if (ini > 12 || fin > 12 && fin < 13) return null;
  let d = (fin - ini + 12) % 12; // aritmética de reloj de 12 h
  if (fin > 12) d = fin - ini;
  d = Math.round(d * 2) / 2;
  return d >= 0.5 && d <= 8 ? d : null;
}

const TELEFONO = /(?:\+?51\s*)?(9\d{2}[\s-]?\d{3}[\s-]?\d{3})/;

function recojoDe(txt: string): { punto: string; direccion?: string } {
  const t = sinTildes(txt).toLowerCase();
  if (/parque de la amistad|surco/.test(t)) return { punto: 'Surco – Parque de la Amistad' };
  if (/pueblo libre|bandera|colegio peruano chino/.test(t)) return { punto: 'Pueblo Libre – Parque de la Bandera' };
  if (/parque de la pera/.test(t)) return { punto: 'San Isidro – Parque de la Pera' };
  if (/\bmb\b|baquero|cercado/.test(t)) return { punto: 'Oficina Cercado de Lima' };
  if (/oficina|ofcna|\bof\b|\bsb\b|aviacion 2695|san borja oficina/.test(t)) return { punto: 'Oficina San Borja' };
  const dir = txt.split(/\s+-\s+|\/\//).map(limpio).find((p) => /^(av\.?|jr\.?|calle|ca\.|psje|pasaje|urb|mz|dalias|entre)/i.test(sinTildes(p)));
  if (dir) return { punto: 'Domicilio', direccion: dir };
  return { punto: 'Oficina San Borja' };
}

const NOTAS = [/menor de edad/i, /no mover ni re ?programar/i, /es profesor[^-]*/i, /especial con su horario/i, /le falta estacionamiento/i, /indica que[^-]*/i, /tener paciencia[^-]*/i, /es nerviosa/i, /chica pesada/i, /promo \d+ ?h/i];
/** Trozos que son comentarios, no nombres. */
const NO_ES_NOMBRE = /paciencia|nervios|pesad|^promo\b|hueco|ocupad/i;
/** Tareas del carro: se importan como bloqueo de mantenimiento, no como clase. */
const MANTENIMIENTO = /lavar|frenos|revisi[oó]n t[eé]cnica|revisi[oó]n de|purgar|socate|aceite|llanta|taller|mantenimiento|mec[aá]nico (lo|se)/i;

interface Celda {
  fecha: string;
  hora: number;
  carro: Carro;
  texto: string;
}
interface Interpretada {
  tipo: 'clase' | 'acompanamiento' | 'break' | 'mantenimiento' | 'ocupado' | 'nota';
  nombre: string;
  telefono: string | null;
  recojo: { punto: string; direccion?: string };
  duracion: number;
  notas: string | null;
}

function interpretar(c: Celda): Interpretada {
  const t = limpio(c.texto);
  const tl = sinTildes(t).toLowerCase();
  if (/^break\b/.test(tl)) return { tipo: 'break', nombre: '', telefono: null, recojo: { punto: '' }, duracion: 1, notas: null };
  if (/hueco|cita de kia/.test(tl)) return { tipo: 'nota', nombre: '', telefono: null, recojo: { punto: '' }, duracion: 1, notas: t };
  if (MANTENIMIENTO.test(tl)) return { tipo: 'mantenimiento', nombre: '', telefono: null, recojo: { punto: '' }, duracion: Math.min(duracionDe(t) ?? 1, 4), notas: t.slice(0, 120) };
  if (/\bocupad[oa]\b/.test(tl)) return { tipo: 'ocupado', nombre: '', telefono: null, recojo: { punto: '' }, duracion: Math.min(duracionDe(t) ?? 2, 4), notas: t.slice(0, 120) };
  const acomp = /acompa(n|ñ)amiento/.test(tl);
  const tel = t.match(TELEFONO)?.[1]?.replace(/\D/g, '') ?? null;
  const notas = NOTAS.map((r) => t.match(r)?.[0]).filter(Boolean).join(' · ') || null;
  // El nombre es el primer trozo que no es instrucción, teléfono, lugar ni horario.
  const partes = t.split(/\s*-+\s*|\/\/|#|\s\d[).]\s|^\d[).]\s|\s(?=\+?51\s?9)/).map(limpio).filter(Boolean);
  const nombre =
    partes
      .map((p) => p.replace(/^(con|no)\s+(oscar|javier|javicho|juan carlos|juan|gian carlos)\s*-?\s*/i, '').replace(/^\d\)\s*/, ''))
      .find(
        (p) =>
          p.length > 3 &&
          !TELEFONO.test(p) &&
          !/^(es |son |no |con |servicio|especial|oficina|ofcna|of\.|sb$|mb$|av\.|jr\.|calle|\*|surco|pueblo|miraflores|san |parque|\d)/i.test(sinTildes(p)) &&
          !NO_ES_NOMBRE.test(p) &&
          !/\d{1,2}(:\d{2})?\s*(am|pm)/i.test(p),
      )
      ?.replace(/\s+de\s+\d.*$/i, '')
      .replace(/\s+en\s+.*$/i, '') ?? '';
  return {
    tipo: acomp ? 'acompanamiento' : 'clase',
    nombre: nombre.slice(0, 80),
    telefono: tel,
    recojo: recojoDe(t),
    // Una clase dura como máximo 4 h: si la lectura da más, es un error de formato y se usa 2 h.
    duracion: ((d) => (d === null || (!acomp && d > 4) ? (acomp ? 4 : 2) : d))(duracionDe(t)),
    notas: acomp ? (notas ? `${notas} · ` : '') + t.slice(0, 180) : notas,
  };
}

/** "7/9/2026" → "2026-09-07" */
const isoDe = (s: string) => {
  const m = limpio(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
};
/** "07:30 - 08:00" → 7.5 */
const horaDe = (s: string) => {
  const m = limpio(s).match(/^(\d{2}):(\d{2})\s*-/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};
const nombreInstructor = (s: string) => {
  const p = limpio(s.split('\n')[0]).split(/\s+y\s+|,/i)[0]!.replace(/apoyar[aá]|puede.*$/i, '').trim();
  if (!p || p.length < 3) return null;
  const n = sinTildes(p).toLowerCase().replace(/^gean/, 'gian');
  return n.replace(/\b\w/g, (x) => x.toUpperCase());
};

// ------------------------------------------------------------------ Recorrido de la hoja
const filas = leerCsv(fs.readFileSync(ruta, 'utf8'));
const celdas: Celda[] = [];
const turnosLeidos: { fecha: string; carro: Carro; instructor: string }[] = [];
const reporte: string[] = [];

for (let r = 0; r < filas.length; r++) {
  if (limpio(filas[r]![0]) !== 'Fecha') continue;
  const fFechas = filas[r]!;
  // Columnas de cada fecha: desde su columna hasta la siguiente fecha.
  const inicios = fFechas.map((v, i) => (isoDe(v) ? i : -1)).filter((i) => i > 0);
  const cabecera = filas[r + 2] ?? [];
  const colCarro = new Map<number, { fecha: string; carro: Carro }>();
  inicios.forEach((ini, k) => {
    const fin = inicios[k + 1] ?? fFechas.length;
    const fecha = isoDe(fFechas[ini]!)!;
    for (let col = ini, pos = 0; col < fin; col++, pos++) {
      const carro = carroDeCabecera(cabecera[col] ?? '', pos);
      if (carro) colCarro.set(col, { fecha, carro });
      else if (limpio(cabecera[col])) reporte.push(`Columna sin carro reconocido: "${limpio(cabecera[col])}" (${fecha})`);
    }
  });
  let rr = r + 3;
  for (; rr < filas.length && horaDe(filas[rr]![0] ?? '') !== null; rr++) {
    const hora = horaDe(filas[rr]![0]!)!;
    filas[rr]!.forEach((v, col) => {
      const cc = colCarro.get(col);
      if (cc && limpio(v)) celdas.push({ ...cc, hora, texto: v });
    });
  }
  // Fila de instructores: la primera fila no vacía después de los horarios.
  for (; rr < filas.length && limpio(filas[rr]![0]) !== 'Fecha'; rr++) {
    const fila = filas[rr]!;
    if (!fila.some((v) => limpio(v))) continue;
    fila.forEach((v, col) => {
      const cc = colCarro.get(col);
      const ins = cc ? nombreInstructor(v) : null;
      if (cc && ins) turnosLeidos.push({ ...cc, instructor: ins });
    });
    break;
  }
}

const interpretadas = celdas.map((c) => ({ c, i: interpretar(c) }));
const cuenta = (t: string) => interpretadas.filter((x) => x.i.tipo === t).length;
console.log(`Leídas ${celdas.length} celdas: ${cuenta('clase')} clases, ${cuenta('acompanamiento')} acompañamientos, ${cuenta('break')} breaks, ${cuenta('mantenimiento')} mantenimientos, ${cuenta('ocupado')} carro ocupado, ${cuenta('nota')} notas sueltas.`);
console.log(`Turnos de instructor: ${turnosLeidos.length} (${[...new Set(turnosLeidos.map((t) => t.instructor))].join(', ')})`);
const sinNombre = interpretadas.filter((x) => (x.i.tipo === 'clase' || x.i.tipo === 'acompanamiento') && !x.i.nombre && !x.i.telefono);
sinNombre.forEach((x) => reporte.push(`Sin nombre reconocible (${x.c.fecha} ${x.c.hora} ${x.c.carro}): ${limpio(x.c.texto).slice(0, 120)}`));

if (!guardarDatos) {
  console.log('\nEjemplos de lo interpretado:');
  for (const x of interpretadas.filter((x) => x.i.tipo !== 'break').slice(0, 12)) {
    console.log(`  ${x.c.fecha} ${String(x.c.hora).padEnd(4)} ${x.c.carro.padEnd(13)} ${x.i.tipo.padEnd(14)} ${x.i.duracion}h  ${x.i.nombre} | ${x.i.telefono ?? '—'} | ${x.i.recojo.punto}${x.i.recojo.direccion ? ` (${x.i.recojo.direccion})` : ''}${x.i.notas && x.i.tipo === 'clase' ? ` | nota: ${x.i.notas}` : ''}`);
  }
  console.log(`\nSimulación: no se guardó nada. ${sinNombre.length} celdas sin nombre reconocible. Agrega --guardar para importar.`);
  process.exit(0);
}

// ------------------------------------------------------------------ Guardado
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const { db, pool } = createDb(url);
const [owner] = await db.select().from(usuarios).where(eq(usuarios.rol, 'propietario'));
const [centro] = await db.select().from(centros).limit(1);
if (!owner || !centro) throw new Error('Primero ejecuta `pnpm seed` (centros, carros, usuarios).');
const actor: Actor = { id: owner.id, nombre: owner.nombre, rol: owner.rol, centroId: null, instructorId: null };
const carros = await db.select().from(vehiculos);
const carroId = (c: Carro) => carros.find((v) => v.nombre === c)?.id;
for (const c of ['KIA BLANCO', 'KIA NEGRO', 'KIA AZUL', 'MECÁNICO ROJO'] as Carro[]) {
  if (!carroId(c)) throw new Error(`No existe el carro "${c}" en Flota.`);
}
// Para importar datos históricos, los documentos de los carros deben cubrir las fechas del Excel.
const primeraFecha = [...celdas.map((c) => c.fecha)].sort()[0] ?? hoyLima();
for (const v of carros) {
  if (!v.soatVence || !v.revisionVence) await db.update(vehiculos).set({ soatVence: v.soatVence ?? '2027-12-31', revisionVence: v.revisionVence ?? '2027-12-31' }).where(eq(vehiculos.id, v.id));
}
const puntos = await db.select().from(puntosRecojo);
const puntoId = (n: string) => puntos.find((p) => p.nombre === n)?.id ?? null;

// Instructores
const insIds = new Map<string, string>();
for (const n of new Set(turnosLeidos.map((t) => t.instructor))) {
  const [ex] = await db.select().from(instructores).where(eq(instructores.nombres, n));
  insIds.set(n, ex?.id ?? (await db.insert(instructores).values({ nombres: n, categorias: ['A-I'] }).returning())[0]!.id);
}
let turnosOk = 0;
for (const t of turnosLeidos) {
  try {
    await db.insert(turnos).values({ vehiculoId: carroId(t.carro)!, instructorId: insIds.get(t.instructor)!, inicio: instanteLima(t.fecha, 7), fin: instanteLima(t.fecha, 22), creadoPor: owner.id });
    turnosOk++;
  } catch {
    reporte.push(`Turno omitido (el instructor ya maneja otro carro ese día): ${t.fecha} ${t.carro} ${t.instructor}`);
  }
}

// Alumnos (se agrupan por teléfono o por nombre)
const claveAlumno = (i: Interpretada) => i.telefono ?? sinTildes(i.nombre).toLowerCase();
const porAlumno = new Map<string, { i: Interpretada; c: Celda }[]>();
for (const x of interpretadas) {
  if ((x.i.tipo !== 'clase' && x.i.tipo !== 'acompanamiento') || (!x.i.nombre && !x.i.telefono)) continue;
  if (!x.i.nombre) x.i.nombre = `Alumno ${x.i.telefono}`;
  const k = claveAlumno(x.i);
  porAlumno.set(k, [...(porAlumno.get(k) ?? []), x]);
}
let clasesOk = 0;
let acompOk = 0;
const hoy = hoyLima();
for (const lista of porAlumno.values()) {
  const primero = lista[0]!.i;
  const partes = primero.nombre.split(' ');
  const dom = lista.find((x) => x.i.recojo.direccion)?.i.recojo.direccion ?? null;
  const [al] = await db
    .insert(alumnos)
    .values({
      nombres: partes.slice(0, Math.ceil(partes.length / 2)).join(' ').replace(/\b\w/g, (x) => x.toUpperCase()),
      apellidos: partes.slice(Math.ceil(partes.length / 2)).join(' '),
      telefono: primero.telefono,
      direccion: dom,
      origen: 'otro',
      etapa: 'matriculado',
      vendedorId: owner.id,
      notas: 'Importado del Excel de horarios',
    })
    .returning();
  const horasClase = lista.filter((x) => x.i.tipo === 'clase').reduce((s, x) => s + x.i.duracion, 0);
  const [paq] = horasClase
    ? await db.insert(paquetes).values({ alumnoId: al!.id, nombre: 'Importado del Excel', horasCompradas: Math.ceil(horasClase / 2) * 2, centroId: centro.id }).returning()
    : [];
  for (const { i, c } of lista) {
    const inicio = instanteLima(c.fecha, Math.floor(c.hora), (c.hora % 1) * 60);
    try {
      const cl = await reservarClase(db, actor, {
        tipo: i.tipo === 'acompanamiento' ? 'acompanamiento' : 'clase',
        paqueteId: i.tipo === 'clase' ? paq?.id : null,
        alumnoId: al!.id,
        vehiculoId: carroId(c.carro)!,
        inicio,
        fin: new Date(inicio.getTime() + i.duracion * 3_600_000),
        puntoRecojoId: puntoId(i.recojo.punto),
        direccionRecojo: i.recojo.direccion ?? null,
        notas: i.notas,
      });
      if (i.tipo === 'clase') clasesOk++;
      else acompOk++;
      // Lo pasado con instructor se da por dictado.
      if (c.fecha < hoy && cl.instructorId) await db.update(clases).set({ estado: 'realizada' }).where(eq(clases.id, cl.id));
    } catch (e) {
      reporte.push(`Reserva omitida ${c.fecha} ${c.hora} ${c.carro} "${i.nombre}": ${(e as Error).message}`);
    }
  }
}
// Breaks al final: solo donde no pisan una clase.
let breaksOk = 0;
for (const { c } of interpretadas.filter((x) => x.i.tipo === 'break')) {
  const inicio = instanteLima(c.fecha, Math.floor(c.hora), (c.hora % 1) * 60);
  try {
    await crearBloqueo(db, actor, { vehiculoId: carroId(c.carro)!, inicio, fin: new Date(inicio.getTime() + 3_600_000), motivo: 'break' });
    breaksOk++;
  } catch (e) {
    reporte.push(`Break omitido ${c.fecha} ${c.hora} ${c.carro}: ${(e as Error).message}`);
  }
}
for (const { c, i } of interpretadas.filter((x) => x.i.tipo === 'mantenimiento' || x.i.tipo === 'ocupado')) {
  const inicio = instanteLima(c.fecha, Math.floor(c.hora), (c.hora % 1) * 60);
  try {
    await crearBloqueo(db, actor, { vehiculoId: carroId(c.carro)!, inicio, fin: new Date(inicio.getTime() + i.duracion * 3_600_000), motivo: i.tipo === 'mantenimiento' ? 'mantenimiento' : 'otro', nota: i.notas });
    breaksOk++;
  } catch (e) {
    reporte.push(`Bloqueo omitido ${c.fecha} ${c.hora} ${c.carro} (${i.notas}): ${(e as Error).message}`);
  }
}
for (const { c, i } of interpretadas.filter((x) => x.i.tipo === 'nota')) reporte.push(`Nota no importada ${c.fecha} ${c.hora} ${c.carro}: ${i.notas}`);

const archivo = path.join(process.cwd(), '.data', 'importacion-reporte.txt');
fs.mkdirSync(path.dirname(archivo), { recursive: true });
fs.writeFileSync(archivo, reporte.join('\n'), 'utf8');
console.log(`Importado: ${porAlumno.size} alumnos, ${clasesOk} clases, ${acompOk} acompañamientos, ${breaksOk} breaks y bloqueos, ${turnosOk} turnos.`);
console.log(`${reporte.length} avisos para revisar en ${archivo} (primera fecha: ${primeraFecha}).`);
await pool.end();

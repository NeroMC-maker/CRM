import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const creado = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();
const actualizado = () => timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow();
/** Montos en soles, 2 decimales. Drizzle los devuelve como string: convertir con Number(). */
const soles = (name: string) => numeric(name, { precision: 10, scale: 2 });

export const rolEnum = pgEnum('rol', ['propietario', 'admin', 'vendedor', 'instructor']);
export const transmisionEnum = pgEnum('transmision', ['mecanica', 'automatica']);
export const estadoVehiculoEnum = pgEnum('estado_vehiculo', ['activo', 'mantenimiento', 'baja']);
export const origenEnum = pgEnum('origen_alumno', ['whatsapp', 'web', 'referido', 'facebook', 'local', 'otro']);
/** Etapas del embudo comercial (CRM). */
export const etapaEnum = pgEnum('etapa', ['nuevo', 'contactado', 'interesado', 'matriculado', 'perdido']);
export const tipoSeguimientoEnum = pgEnum('tipo_seguimiento', ['nota', 'llamada', 'whatsapp', 'visita', 'tarea']);
export const tipoProductoEnum = pgEnum('tipo_producto', ['paquete', 'otro']);
export const tipoPrecioEnum = pgEnum('tipo_precio', ['regular', 'oferta', 'descuento_manual']);
export const estadoVentaEnum = pgEnum('estado_venta', ['activa', 'anulada']);
export const estadoPaqueteEnum = pgEnum('estado_paquete', ['activo', 'anulado']);
export const metodoPagoEnum = pgEnum('metodo_pago', ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta']);
export const estadoClaseEnum = pgEnum('estado_clase', ['programada', 'realizada', 'cancelada', 'no_asistio']);
/** Clase de manejo o servicio de acompañamiento al examen. */
export const tipoClaseEnum = pgEnum('tipo_clase', ['clase', 'acompanamiento']);
export const tipoPuntoEnum = pgEnum('tipo_punto', ['sede', 'punto', 'domicilio']);
export const motivoBloqueoEnum = pgEnum('motivo_bloqueo', ['break', 'mantenimiento', 'otro']);

export const centros = pgTable('centros', {
  id: id(),
  nombre: text('nombre').notNull(),
  direccion: text('direccion'),
  telefono: text('telefono'),
  /** Hora local de Lima (0–23) en que empieza la primera clase posible. */
  horaApertura: integer('hora_apertura').notNull().default(7),
  /** Hora local de Lima en que debe terminar la última clase. */
  horaCierre: integer('hora_cierre').notNull().default(21),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creado(),
});

export const usuarios = pgTable('usuarios', {
  id: id(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  rol: rolEnum('rol').notNull(),
  centroId: uuid('centro_id').references(() => centros.id),
  /** Si el usuario es un instructor, su ficha. */
  instructorId: uuid('instructor_id'),
  activo: boolean('activo').notNull().default(true),
  ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true }),
  creadoEn: creado(),
});

export const sesiones = pgTable('sesiones', {
  /** SHA-256 del token de la cookie; el token en claro nunca se guarda. */
  id: text('id').primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  creadoEn: creado(),
});

export const vehiculos = pgTable('vehiculos', {
  id: id(),
  placa: text('placa').notNull().unique(),
  /** Cómo lo llama el equipo: "KIA BLANCO", "MECÁNICO ROJO". */
  nombre: text('nombre'),
  /** Color de la columna en el horario (hex). */
  colorHorario: text('color_horario').notNull().default('#2563eb'),
  orden: integer('orden').notNull().default(0),
  marca: text('marca').notNull(),
  modelo: text('modelo').notNull(),
  anio: integer('anio'),
  transmision: transmisionEnum('transmision').notNull(),
  categoria: text('categoria').notNull().default('A-I'),
  color: text('color'),
  centroId: uuid('centro_id').notNull().references(() => centros.id),
  estado: estadoVehiculoEnum('estado').notNull().default('activo'),
  soatVence: date('soat_vence'),
  revisionVence: date('revision_vence'),
  notas: text('notas'),
  creadoEn: creado(),
  actualizadoEn: actualizado(),
});

export const instructores = pgTable('instructores', {
  id: id(),
  nombres: text('nombres').notNull(),
  dni: text('dni'),
  telefono: text('telefono'),
  licencia: text('licencia'),
  categorias: text('categorias').array().notNull().default(sql`'{A-I}'::text[]`),
  /** Centro habitual; null = puede trabajar en ambos. */
  centroId: uuid('centro_id').references(() => centros.id),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creado(),
});

/**
 * Personas: prospectos y alumnos en la misma tabla. La etapa indica dónde están en el embudo;
 * una venta los pasa a "matriculado".
 */
export const alumnos = pgTable(
  'alumnos',
  {
    id: id(),
    nombres: text('nombres').notNull(),
    apellidos: text('apellidos').notNull().default(''),
    dni: text('dni'),
    telefono: text('telefono'),
    email: text('email'),
    categoriaBuscada: text('categoria_buscada').default('A-I'),
    origen: origenEnum('origen').notNull().default('otro'),
    vendedorId: uuid('vendedor_id').references(() => usuarios.id),
    /** Dirección de recojo a domicilio (se recuerda para la próxima clase). */
    direccion: text('direccion'),
    etapa: etapaEnum('etapa').notNull().default('nuevo'),
    motivoPerdida: text('motivo_perdida'),
    /** Próximo paso comercial: todo prospecto abierto debería tener uno. */
    proximoSeguimiento: timestamp('proximo_seguimiento', { withTimezone: true }),
    convertidoEn: timestamp('convertido_en', { withTimezone: true }),
    notas: text('notas'),
    creadoEn: creado(),
    actualizadoEn: actualizado(),
  },
  (t) => [
    index('alumnos_dni_idx').on(t.dni),
    index('alumnos_telefono_idx').on(t.telefono),
    index('alumnos_etapa_idx').on(t.etapa),
  ],
);

/** Historial del embudo: cada cambio de etapa (para medir conversión y tiempos). */
export const cambiosEtapa = pgTable(
  'cambios_etapa',
  {
    id: id(),
    alumnoId: uuid('alumno_id').notNull().references(() => alumnos.id),
    de: etapaEnum('de'),
    a: etapaEnum('a').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cambios_etapa_alumno_idx').on(t.alumnoId), index('cambios_etapa_fecha_idx').on(t.fecha)],
);

/** Actividades comerciales: notas, llamadas, WhatsApp, visitas y tareas con fecha. */
export const seguimientos = pgTable(
  'seguimientos',
  {
    id: id(),
    alumnoId: uuid('alumno_id').notNull().references(() => alumnos.id),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
    tipo: tipoSeguimientoEnum('tipo').notNull(),
    texto: text('texto').notNull(),
    /** Solo tareas: cuándo hay que hacerla. */
    venceEn: timestamp('vence_en', { withTimezone: true }),
    completadoEn: timestamp('completado_en', { withTimezone: true }),
    creadoEn: creado(),
  },
  (t) => [index('seguimientos_alumno_idx').on(t.alumnoId), index('seguimientos_vence_idx').on(t.venceEn)],
);

export const productos = pgTable('productos', {
  id: id(),
  nombre: text('nombre').notNull(),
  tipo: tipoProductoEnum('tipo').notNull().default('paquete'),
  /** Horas de manejo que incluye (0 si no es un paquete de clases). */
  horas: integer('horas').notNull().default(0),
  precioRegular: soles('precio_regular').notNull(),
  orden: integer('orden').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creado(),
});

export const ofertas = pgTable('ofertas', {
  id: id(),
  productoId: uuid('producto_id').notNull().references(() => productos.id),
  nombre: text('nombre').notNull(),
  precio: soles('precio').notNull(),
  desde: date('desde').notNull(),
  hasta: date('hasta').notNull(),
  activa: boolean('activa').notNull().default(true),
  creadoEn: creado(),
});

/** Bolsa de horas de manejo de un alumno. Se crea al vender un paquete y se puede recargar. */
export const paquetes = pgTable(
  'paquetes',
  {
    id: id(),
    alumnoId: uuid('alumno_id').notNull().references(() => alumnos.id),
    nombre: text('nombre').notNull(),
    horasCompradas: integer('horas_compradas').notNull(),
    centroId: uuid('centro_id').notNull().references(() => centros.id),
    estado: estadoPaqueteEnum('estado').notNull().default('activo'),
    creadoEn: creado(),
  },
  (t) => [index('paquetes_alumno_idx').on(t.alumnoId), check('paquetes_horas_no_negativas', sql`${t.horasCompradas} >= 0`)],
);

/** Cabecera de la venta (carrito). El detalle va en venta_items. */
export const ventas = pgTable(
  'ventas',
  {
    id: id(),
    alumnoId: uuid('alumno_id').notNull().references(() => alumnos.id),
    vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
    centroId: uuid('centro_id').notNull().references(() => centros.id),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    totalRegular: soles('total_regular').notNull(),
    totalCobrado: soles('total_cobrado').notNull(),
    motivoDescuento: text('motivo_descuento'),
    autorizadoPor: uuid('autorizado_por').references(() => usuarios.id),
    estado: estadoVentaEnum('estado').notNull().default('activa'),
    creadoEn: creado(),
  },
  (t) => [
    index('ventas_fecha_idx').on(t.fecha),
    index('ventas_alumno_idx').on(t.alumnoId),
    check('ventas_total_no_negativo', sql`${t.totalCobrado} >= 0`),
  ],
);

export const ventaItems = pgTable(
  'venta_items',
  {
    id: id(),
    ventaId: uuid('venta_id').notNull().references(() => ventas.id),
    productoId: uuid('producto_id').notNull().references(() => productos.id),
    descripcion: text('descripcion').notNull(),
    /** Copiado al vender: el análisis no cambia si luego sube el precio. */
    precioRegular: soles('precio_regular').notNull(),
    precioCobrado: soles('precio_cobrado').notNull(),
    ofertaId: uuid('oferta_id').references(() => ofertas.id),
    tipoPrecio: tipoPrecioEnum('tipo_precio').notNull(),
    horas: integer('horas').notNull().default(0),
    /** Paquete creado o recargado por este ítem. */
    paqueteId: uuid('paquete_id').references(() => paquetes.id),
    esRecarga: boolean('es_recarga').notNull().default(false),
  },
  (t) => [index('venta_items_venta_idx').on(t.ventaId)],
);

export const pagos = pgTable(
  'pagos',
  {
    id: id(),
    ventaId: uuid('venta_id').notNull().references(() => ventas.id),
    monto: soles('monto').notNull(),
    metodo: metodoPagoEnum('metodo').notNull(),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    registradoPor: uuid('registrado_por').notNull().references(() => usuarios.id),
    creadoEn: creado(),
  },
  (t) => [index('pagos_venta_idx').on(t.ventaId), check('pagos_monto_positivo', sql`${t.monto} > 0`)],
);

/**
 * Clases de manejo. Los cruces (mismo carro, instructor o alumno a la vez) los impiden
 * restricciones EXCLUDE creadas en la migración 0001_sin_cruces.sql, no solo la interfaz.
 */
/** Dónde se recoge al alumno: sedes, puntos de encuentro de la web o domicilio. */
export const puntosRecojo = pgTable('puntos_recojo', {
  id: id(),
  nombre: text('nombre').notNull(),
  direccion: text('direccion'),
  tipo: tipoPuntoEnum('tipo').notNull(),
  orden: integer('orden').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
});

/**
 * Turno: qué instructor maneja un carro en un tramo del día (normalmente el día completo).
 * Las clases de ese carro en ese tramo toman este instructor.
 * Sin cruces (mismo carro o mismo instructor) — restricciones en 0003_turnos_bloqueos.sql.
 */
export const turnos = pgTable(
  'turnos',
  {
    id: id(),
    vehiculoId: uuid('vehiculo_id').notNull().references(() => vehiculos.id),
    instructorId: uuid('instructor_id').notNull().references(() => instructores.id),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    creadoPor: uuid('creado_por').references(() => usuarios.id),
    creadoEn: creado(),
  },
  (t) => [index('turnos_inicio_idx').on(t.inicio), check('turnos_fin_despues', sql`${t.fin} > ${t.inicio}`)],
);

/** Bloqueos del carro: break/refrigerio, mantenimiento u otro. No se puede reservar encima. */
export const bloqueos = pgTable(
  'bloqueos',
  {
    id: id(),
    vehiculoId: uuid('vehiculo_id').notNull().references(() => vehiculos.id),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    motivo: motivoBloqueoEnum('motivo').notNull().default('break'),
    nota: text('nota'),
    creadoPor: uuid('creado_por').references(() => usuarios.id),
    creadoEn: creado(),
  },
  (t) => [index('bloqueos_inicio_idx').on(t.inicio), check('bloqueos_fin_despues', sql`${t.fin} > ${t.inicio}`)],
);

export const clases = pgTable(
  'clases',
  {
    id: id(),
    tipo: tipoClaseEnum('tipo').notNull().default('clase'),
    /** Obligatorio para clases (descuenta horas); el acompañamiento puede ir sin paquete. */
    paqueteId: uuid('paquete_id').references(() => paquetes.id),
    puntoRecojoId: uuid('punto_recojo_id').references(() => puntosRecojo.id),
    /** Dirección exacta si el recojo es a domicilio. */
    direccionRecojo: text('direccion_recojo'),
    alumnoId: uuid('alumno_id').notNull().references(() => alumnos.id),
    vehiculoId: uuid('vehiculo_id').notNull().references(() => vehiculos.id),
    /** Puede asignarse después de reservar el horario. */
    instructorId: uuid('instructor_id').references(() => instructores.id),
    centroId: uuid('centro_id').notNull().references(() => centros.id),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    estado: estadoClaseEnum('estado').notNull().default('programada'),
    notas: text('notas'),
    creadaPor: uuid('creada_por').notNull().references(() => usuarios.id),
    creadoEn: creado(),
    actualizadoEn: actualizado(),
  },
  (t) => [
    index('clases_inicio_idx').on(t.inicio),
    index('clases_paquete_idx').on(t.paqueteId),
    check('clases_fin_despues_de_inicio', sql`${t.fin} > ${t.inicio}`),
  ],
);

export const auditoria = pgTable(
  'auditoria',
  {
    id: id(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: text('entidad_id'),
    datos: jsonb('datos'),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auditoria_fecha_idx').on(t.fecha)],
);

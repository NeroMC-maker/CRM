/** Cliente de la API. Todas las rutas van a /api (Vite las reenvía en desarrollo). */
export class ErrorApi extends Error {
  constructor(
    message: string,
    public status: number,
    public detalles?: string[],
  ) {
    super(message);
  }
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    method: metodo,
    credentials: 'same-origin',
    headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !ruta.startsWith('/auth/')) window.dispatchEvent(new Event('sesion-expirada'));
    throw new ErrorApi(datos.error ?? `Error ${res.status}`, res.status, datos.detalles);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('POST', ruta, cuerpo ?? {}),
  put: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PATCH', ruta, cuerpo),
  del: <T>(ruta: string) => pedir<T>('DELETE', ruta),
};

// ---- Tipos que devuelve la API
export type Rol = 'propietario' | 'admin' | 'vendedor' | 'instructor';
export interface Yo {
  id: string;
  nombre: string;
  rol: Rol;
  centroId: string | null;
  instructorId: string | null;
  permisos: string[];
}
export interface Centro {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  horaApertura: number;
  horaCierre: number;
}
export interface Vehiculo {
  id: string;
  placa: string;
  /** "KIA BLANCO", "MECÁNICO ROJO"… */
  nombre: string | null;
  colorHorario: string;
  orden: number;
  marca: string;
  modelo: string;
  anio: number | null;
  transmision: 'mecanica' | 'automatica';
  categoria: string;
  color: string | null;
  centroId: string;
  estado: 'activo' | 'mantenimiento' | 'baja';
  soatVence: string | null;
  revisionVence: string | null;
  notas: string | null;
}
export interface Instructor {
  id: string;
  nombres: string;
  dni: string | null;
  telefono: string | null;
  licencia: string | null;
  categorias: string[];
  centroId: string | null;
  activo: boolean;
}
export interface Producto {
  id: string;
  nombre: string;
  tipo: 'paquete' | 'otro';
  horas: number;
  precioRegular: number;
  orden: number;
  activo: boolean;
  oferta: { id: string; nombre: string; precio: number; hasta: string } | null;
}
export interface Oferta {
  id: string;
  productoId: string;
  producto: string;
  nombre: string;
  precio: number;
  desde: string;
  hasta: string;
  activa: boolean;
}
export type Etapa = 'nuevo' | 'contactado' | 'interesado' | 'matriculado' | 'perdido';
export interface Alumno {
  id: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  categoriaBuscada: string | null;
  origen: string;
  /** Dirección de recojo a domicilio. */
  direccion: string | null;
  etapa: Etapa;
  motivoPerdida: string | null;
  proximoSeguimiento: string | null;
  convertidoEn: string | null;
  notas: string | null;
  creadoEn: string;
}
export type TipoClase = 'clase' | 'acompanamiento';
export interface Clase {
  id: string;
  tipo: TipoClase;
  inicio: string;
  fin: string;
  estado: 'programada' | 'realizada' | 'cancelada' | 'no_asistio';
  notas: string | null;
  paqueteId: string | null;
  centroId: string;
  vehiculoId: string;
  placa: string;
  /** Nombre del carro (o placa si no tiene nombre). */
  carro: string;
  instructorId: string | null;
  instructor: string | null;
  alumnoId: string;
  alumno: string;
  telefonoAlumno: string | null;
  puntoRecojoId: string | null;
  puntoRecojo: string | null;
  direccionRecojo: string | null;
}
export interface PuntoRecojo {
  id: string;
  nombre: string;
  direccion: string | null;
  tipo: 'sede' | 'punto' | 'domicilio';
}
export interface Bloqueo {
  id: string;
  vehiculoId: string;
  inicio: string;
  fin: string;
  motivo: 'break' | 'mantenimiento' | 'otro';
  nota: string | null;
}
export interface Turno {
  id: string;
  vehiculoId: string;
  instructorId: string;
  instructor: string;
  inicio: string;
  fin: string;
}
export interface Horario {
  clases: Clase[];
  bloqueos: Bloqueo[];
  turnos: Turno[];
}
export interface PaquetePorAgendar {
  paquete_id: string;
  alumno_id: string;
  alumno: string;
  dni: string | null;
  telefono: string | null;
  producto: string;
  horas_compradas: number;
  horas_disponibles: number;
}
export interface Paquete {
  id: string;
  nombre: string;
  estado: 'activo' | 'anulado';
  creadoEn: string;
  recargas: number;
  horasCompradas: number;
  horasAgendadas: number;
  horasDictadas: number;
  horasDisponibles: number;
}
export interface VentaResumen {
  id: string;
  fecha: string;
  estado: 'activa' | 'anulada';
  vendedor: string;
  totalRegular: number;
  total: number;
  /** Método con que se pagó (siempre se paga completo). */
  metodo: string | null;
  items: { descripcion: string; precio_cobrado: number; precio_regular: number; tipo_precio: string; es_recarga: boolean }[];
}
export interface Seguimiento {
  id: string;
  tipo: 'nota' | 'llamada' | 'whatsapp' | 'visita' | 'tarea';
  texto: string;
  venceEn: string | null;
  completadoEn: string | null;
  fecha: string;
  usuario: string;
}
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  centroId: string | null;
  instructorId: string | null;
  activo: boolean;
  ultimoAcceso: string | null;
}

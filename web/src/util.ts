import { fechaLima, horaLima, hoyLima, instanteLima, sumarDias } from '../../core/domain/tiempo';

export { fechaLima, horaLima, hoyLima, instanteLima, sumarDias };

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
export const S = (n: number | string | null | undefined) => soles.format(Number(n ?? 0));

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'lunes 28 de septiembre' */
export function fechaLarga(fecha: string): string {
  const d = instanteLima(fecha, 12);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
/** '28/09/2026' */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
/** Fecha y hora en Lima de un instante ISO. */
export function fechaHora(iso: string): string {
  const t = new Date(iso);
  return `${fechaCorta(fechaLima(t))} ${hhmm(horaLima(t))}`;
}
export function hhmm(hora: number): string {
  const h = Math.floor(hora);
  const m = Math.round((hora - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** Lunes de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const dow = instanteLima(fecha, 12).getUTCDay();
  return sumarDias(fecha, -((dow + 6) % 7));
}

export const TRANSMISION = { mecanica: 'Mecánico', automatica: 'Automático' } as const;
export const ESTADO_CLASE = {
  programada: 'Programada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
} as const;
export const TIPO_PRECIO = { regular: 'Precio regular', oferta: 'Oferta', descuento_manual: 'Descuento manual' } as const;
export const METODOS = [
  { id: 'efectivo', t: 'Efectivo' },
  { id: 'yape', t: 'Yape' },
  { id: 'plin', t: 'Plin' },
  { id: 'transferencia', t: 'Transf.' },
  { id: 'tarjeta', t: 'Tarjeta' },
] as const;
export const ROLES = { propietario: 'Propietario', admin: 'Administrador', vendedor: 'Vendedor', instructor: 'Instructor' } as const;
export const ORIGENES = { whatsapp: 'WhatsApp', web: 'Web', referido: 'Referido', facebook: 'Facebook', local: 'Local', otro: 'Otro' } as const;

export const ETAPAS = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  matriculado: 'Matriculado',
  perdido: 'Perdido',
} as const;
export const TIPOS_SEGUIMIENTO = {
  nota: 'Nota',
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  visita: 'Visita',
  tarea: 'Tarea',
} as const;

/** 'hace 3 días', 'hoy', 'en 2 días' (fechas en Lima). */
export function relativo(iso: string | null | undefined): string {
  if (!iso) return '';
  const dias = Math.round((instanteLima(fechaLima(new Date(iso)), 12).getTime() - instanteLima(hoyLima(), 12).getTime()) / 86_400_000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}
/** Estado de una fecha de seguimiento: vencido, hoy o futuro. */
export function urgencia(iso: string | null | undefined): 'vencido' | 'hoy' | 'futuro' | null {
  if (!iso) return null;
  const f = fechaLima(new Date(iso));
  const h = hoyLima();
  return f < h ? 'vencido' : f === h ? 'hoy' : 'futuro';
}
/** Enlace de WhatsApp para un teléfono peruano. */
export function waLink(telefono: string | null | undefined): string | null {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (d.length < 9) return null;
  return `https://wa.me/${d.length === 9 ? '51' + d : d}`;
}
/**
 * Perú no tiene horario de verano: Lima es siempre UTC-5.
 * Todas las fechas se guardan como timestamptz y se muestran en hora de Lima.
 */
export const LIMA_OFFSET_H = -5;

/** 'YYYY-MM-DD' + hora local de Lima → instante. */
export function instanteLima(fecha: string, hora: number, minuto = 0): Date {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hora - LIMA_OFFSET_H, minuto));
}

function enLima(instante: Date): Date {
  return new Date(instante.getTime() + LIMA_OFFSET_H * 3_600_000);
}

/** Fecha local de Lima 'YYYY-MM-DD'. */
export function fechaLima(instante: Date): string {
  return enLima(instante).toISOString().slice(0, 10);
}

/** Hora local de Lima con fracción (9.5 = 9:30). */
export function horaLima(instante: Date): number {
  const l = enLima(instante);
  return l.getUTCHours() + l.getUTCMinutes() / 60;
}

export function hoyLima(): string {
  return fechaLima(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const t = instanteLima(fecha, 12);
  return fechaLima(new Date(t.getTime() + dias * 86_400_000));
}

/** Días entre dos fechas 'YYYY-MM-DD' (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((instanteLima(b, 12).getTime() - instanteLima(a, 12).getTime()) / 86_400_000);
}

export function horasEntre(inicio: Date, fin: Date): number {
  return (fin.getTime() - inicio.getTime()) / 3_600_000;
}

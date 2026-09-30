import { fechaLima, horaLima, horasEntre } from './tiempo';

/** Duración por defecto de una clase. Es flexible: se puede reservar en tramos de 30 min. */
export const DURACION_CLASE_H = 2;
/** El horario se maneja en tramos de 30 minutos (como el Excel de la escuela). */
export const TRAMO_H = 0.5;
export const DURACION_MAX_H = { clase: 4, acompanamiento: 12 } as const;

export type TipoClase = 'clase' | 'acompanamiento';

export interface ReservaInput {
  tipo: TipoClase;
  inicio: Date;
  fin: Date;
  centro: { id: string; horaApertura: number; horaCierre: number };
  vehiculo: {
    estado: 'activo' | 'mantenimiento' | 'baja';
    placa: string;
    soatVence: string | null;
    revisionVence: string | null;
  };
  /** Horas del paquete aún sin agendar (sin contar la clase que se está moviendo). null = sin paquete. */
  horasDisponibles: number | null;
  instructor?: { activo: boolean } | null;
}

const esTramo = (h: number) => Math.abs(h / TRAMO_H - Math.round(h / TRAMO_H)) < 1e-9;

/** Problemas que impiden la reserva. Vacío = se puede reservar (los cruces los valida la base de datos). */
export function validarReserva(r: ReservaInput): string[] {
  const errores: string[] = [];
  const duracion = horasEntre(r.inicio, r.fin);
  const fecha = fechaLima(r.inicio);
  const hIni = horaLima(r.inicio);
  const hFin = hIni + duracion;

  if (duracion < TRAMO_H) errores.push('La reserva debe durar al menos 30 minutos.');
  if (!esTramo(duracion)) errores.push('La duración va en tramos de 30 minutos.');
  if (duracion > DURACION_MAX_H[r.tipo]) {
    errores.push(`${r.tipo === 'clase' ? 'Una clase' : 'Un acompañamiento'} puede durar hasta ${DURACION_MAX_H[r.tipo]} h.`);
  }
  if (!esTramo(hIni)) errores.push('La reserva debe empezar en punto o a la media hora (por ejemplo 9:00 o 9:30).');
  if (hIni < r.centro.horaApertura || hFin > r.centro.horaCierre) {
    errores.push(`El horario de clases es de ${r.centro.horaApertura}:00 a ${r.centro.horaCierre}:00.`);
  }
  if (r.vehiculo.estado !== 'activo') {
    errores.push(`El carro ${r.vehiculo.placa} está en ${r.vehiculo.estado === 'baja' ? 'baja' : 'mantenimiento'}.`);
  }
  if (!r.vehiculo.soatVence) errores.push(`Falta registrar el SOAT del carro ${r.vehiculo.placa}.`);
  else if (r.vehiculo.soatVence < fecha) errores.push(`El SOAT del carro ${r.vehiculo.placa} vence antes de la clase.`);
  if (!r.vehiculo.revisionVence) errores.push(`Falta registrar la revisión técnica del carro ${r.vehiculo.placa}.`);
  else if (r.vehiculo.revisionVence < fecha) {
    errores.push(`La revisión técnica del carro ${r.vehiculo.placa} vence antes de la clase.`);
  }
  if (r.tipo === 'clase') {
    if (r.horasDisponibles === null) errores.push('Una clase de manejo necesita un paquete con horas.');
    else if (r.horasDisponibles < duracion - 1e-9) {
      errores.push(`Al paquete le quedan ${r.horasDisponibles} h sin agendar; la reserva necesita ${duracion} h.`);
    }
  }
  if (r.instructor && !r.instructor.activo) errores.push('El instructor no está activo.');
  return errores;
}

/** Traduce la restricción de Postgres que se violó a un mensaje para el usuario. */
export function mensajeCruce(constraint: string | undefined): string {
  switch (constraint) {
    case 'clases_sin_cruce_vehiculo':
      return 'Ese carro ya tiene una clase en ese horario. Otra persona pudo haberlo reservado hace un momento.';
    case 'clases_sin_cruce_instructor':
      return 'Ese instructor ya tiene una clase en ese horario.';
    case 'clases_sin_cruce_alumno':
      return 'El alumno ya tiene otra clase en ese horario.';
    case 'turnos_sin_cruce_vehiculo':
      return 'Ese carro ya tiene un instructor asignado en ese tramo.';
    case 'turnos_sin_cruce_instructor':
      return 'Ese instructor ya tiene turno en otro carro en ese horario.';
    case 'bloqueos_sin_cruce_vehiculo':
      return 'Ese carro ya tiene un break o bloqueo en ese horario.';
    default:
      return 'El horario se cruza con otra reserva.';
  }
}

/** Días que faltan para que venza un documento (negativo = vencido). null si no está registrado. */
export function alertaVencimiento(vence: string | null, hoy: string): 'vencido' | 'por_vencer' | 'ok' | 'sin_dato' {
  if (!vence) return 'sin_dato';
  if (vence < hoy) return 'vencido';
  const dias = (Date.parse(vence) - Date.parse(hoy)) / 86_400_000;
  return dias <= 30 ? 'por_vencer' : 'ok';
}

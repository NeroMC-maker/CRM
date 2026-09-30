/**
 * Qué puede hacer cada rol. Se valida SIEMPRE en el servidor: ocultar un botón no es autorizar.
 * Ver docs/permisos.md.
 */
export type Rol = 'propietario' | 'admin' | 'vendedor' | 'instructor';

export type Accion =
  | 'venta.crear'
  | 'venta.descuento_manual'
  | 'venta.anular'
  | 'clase.agendar'
  | 'clase.marcar'
  | 'clase.ver_todas'
  | 'alumno.editar'
  | 'flota.editar'
  | 'instructor.editar'
  | 'producto.editar'
  | 'centro.editar'
  | 'usuario.editar'
  | 'analisis.ver_todo'
  | 'analisis.ver_propio'
  | 'auditoria.ver';

const TODO: readonly Accion[] = [
  'venta.crear',
  'venta.descuento_manual',
  'venta.anular',
  'clase.agendar',
  'clase.marcar',
  'clase.ver_todas',
  'alumno.editar',
  'flota.editar',
  'instructor.editar',
  'producto.editar',
  'centro.editar',
  'usuario.editar',
  'analisis.ver_todo',
  'analisis.ver_propio',
  'auditoria.ver',
];

export const CAPACIDADES: Record<Rol, readonly Accion[]> = {
  propietario: TODO,
  admin: TODO,
  vendedor: [
    'venta.crear',
    'clase.agendar',
    'clase.marcar',
    'clase.ver_todas',
    'alumno.editar',
    'analisis.ver_propio',
  ],
  // El instructor solo ve y marca SUS clases (el filtro por instructor lo aplica el servicio).
  instructor: ['clase.marcar'],
};

export interface Actor {
  id: string;
  nombre: string;
  rol: Rol;
  centroId: string | null;
  instructorId: string | null;
}

export function puede(actor: Pick<Actor, 'rol'>, accion: Accion): boolean {
  return CAPACIDADES[actor.rol].includes(accion);
}

export class NoAutorizado extends Error {
  constructor(accion: Accion) {
    super(`No tienes permiso para esta acción (${accion}).`);
    this.name = 'NoAutorizado';
  }
}

export function exigir(actor: Pick<Actor, 'rol'>, accion: Accion): void {
  if (!puede(actor, accion)) throw new NoAutorizado(accion);
}

/** Un admin no puede crear ni editar propietarios; nadie cambia su propio rol. */
export function puedeAsignarRol(actor: Actor, rolDestino: Rol, usuarioDestinoId?: string): boolean {
  if (!puede(actor, 'usuario.editar')) return false;
  if (usuarioDestinoId === actor.id) return false;
  if (rolDestino === 'propietario') return actor.rol === 'propietario';
  return true;
}

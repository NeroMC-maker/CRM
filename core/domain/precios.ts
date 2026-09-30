import { puede, type Actor } from './roles';

export interface OfertaVigenciaInput {
  id: string;
  productoId: string;
  precio: number;
  desde: string; // 'YYYY-MM-DD'
  hasta: string;
  activa: boolean;
}

/** La oferta activa y vigente más barata para el producto en esa fecha (Lima). */
export function ofertaVigente<T extends OfertaVigenciaInput>(
  ofertas: T[],
  productoId: string,
  fecha: string,
): T | null {
  const vigentes = ofertas.filter(
    (o) => o.activa && o.productoId === productoId && o.desde <= fecha && fecha <= o.hasta,
  );
  if (vigentes.length === 0) return null;
  return vigentes.reduce((a, b) => (b.precio < a.precio ? b : a));
}

export type TipoPrecio = 'regular' | 'oferta' | 'descuento_manual';

export interface PrecioCalculado {
  precioRegular: number;
  precioCobrado: number;
  tipoPrecio: TipoPrecio;
  ofertaId: string | null;
}

export class PrecioInvalido extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PrecioInvalido';
  }
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Precio de una venta. Sin precio manual: regular u oferta vigente.
 * Con precio manual distinto del aplicable: descuento manual, solo Admin/Propietario y con motivo.
 */
export function calcularPrecio(input: {
  precioRegular: number;
  oferta: { id: string; precio: number } | null;
  precioManual?: number | null;
  motivo?: string | null;
  actor: Pick<Actor, 'rol'>;
}): PrecioCalculado {
  const precioRegular = redondear(input.precioRegular);
  const aplicable = input.oferta ? redondear(input.oferta.precio) : precioRegular;
  const base: PrecioCalculado = input.oferta
    ? { precioRegular, precioCobrado: aplicable, tipoPrecio: 'oferta', ofertaId: input.oferta.id }
    : { precioRegular, precioCobrado: precioRegular, tipoPrecio: 'regular', ofertaId: null };

  if (input.precioManual == null) return base;
  const manual = redondear(input.precioManual);
  if (manual === aplicable) return base;

  if (manual < 0) throw new PrecioInvalido('El precio no puede ser negativo.');
  if (manual > precioRegular) throw new PrecioInvalido('El precio no puede superar el precio regular.');
  if (!puede(input.actor, 'venta.descuento_manual')) {
    throw new PrecioInvalido('Solo un administrador puede aplicar un descuento fuera de oferta.');
  }
  if (!input.motivo?.trim()) throw new PrecioInvalido('Indica el motivo del descuento.');
  return { precioRegular, precioCobrado: manual, tipoPrecio: 'descuento_manual', ofertaId: null };
}

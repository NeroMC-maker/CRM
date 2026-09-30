import { describe, expect, it } from 'vitest';
import { alertaVencimiento, validarReserva, type ReservaInput } from './agenda';
import { calcularPrecio, ofertaVigente } from './precios';
import { puede, puedeAsignarRol, type Actor } from './roles';
import { fechaLima, horaLima, instanteLima, sumarDias } from './tiempo';

const admin: Actor = { id: 'a', nombre: 'A', rol: 'admin', centroId: null, instructorId: null };
const vendedor: Actor = { ...admin, id: 'v', rol: 'vendedor' };
const propietario: Actor = { ...admin, id: 'p', rol: 'propietario' };

describe('tiempo (Lima UTC-5)', () => {
  it('convierte hora local de Lima a instante y de vuelta', () => {
    const t = instanteLima('2026-09-26', 9);
    expect(t.toISOString()).toBe('2026-09-26T14:00:00.000Z');
    expect(fechaLima(t)).toBe('2026-09-26');
    expect(horaLima(t)).toBe(9);
  });
  it('una clase a las 20:00 en Lima sigue siendo del mismo día aunque en UTC ya sea mañana', () => {
    expect(fechaLima(instanteLima('2026-09-26', 20))).toBe('2026-09-26');
  });
  it('suma días cruzando meses', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
  });
});

describe('precios', () => {
  const ofertas = [
    { id: 'o1', productoId: 'p', precio: 550, desde: '2026-09-01', hasta: '2026-09-30', activa: true },
    { id: 'o2', productoId: 'p', precio: 520, desde: '2026-09-20', hasta: '2026-09-25', activa: true },
    { id: 'o3', productoId: 'p', precio: 400, desde: '2026-09-01', hasta: '2026-09-30', activa: false },
  ];
  it('elige la oferta vigente más barata y activa', () => {
    expect(ofertaVigente(ofertas, 'p', '2026-09-22')?.id).toBe('o2');
    expect(ofertaVigente(ofertas, 'p', '2026-09-26')?.id).toBe('o1');
    expect(ofertaVigente(ofertas, 'p', '2026-10-01')).toBeNull();
  });
  it('sin precio manual cobra regular u oferta', () => {
    expect(calcularPrecio({ precioRegular: 599, oferta: null, actor: vendedor })).toMatchObject({
      precioCobrado: 599,
      tipoPrecio: 'regular',
    });
    expect(calcularPrecio({ precioRegular: 599, oferta: { id: 'o1', precio: 550 }, actor: vendedor })).toMatchObject({
      precioCobrado: 550,
      tipoPrecio: 'oferta',
      ofertaId: 'o1',
    });
  });
  it('un vendedor no puede aplicar descuento manual', () => {
    expect(() => calcularPrecio({ precioRegular: 599, oferta: null, precioManual: 500, motivo: 'x', actor: vendedor })).toThrow(
      /administrador/,
    );
  });
  it('un admin sí, pero con motivo y sin superar el regular', () => {
    expect(() => calcularPrecio({ precioRegular: 599, oferta: null, precioManual: 500, actor: admin })).toThrow(/motivo/);
    expect(() => calcularPrecio({ precioRegular: 599, oferta: null, precioManual: 700, motivo: 'x', actor: admin })).toThrow(
      /superar/,
    );
    expect(calcularPrecio({ precioRegular: 599, oferta: null, precioManual: 500, motivo: 'convenio', actor: admin })).toMatchObject({
      precioCobrado: 500,
      tipoPrecio: 'descuento_manual',
    });
  });
  it('escribir el mismo precio aplicable no cuenta como descuento', () => {
    expect(calcularPrecio({ precioRegular: 599, oferta: null, precioManual: 599, actor: vendedor }).tipoPrecio).toBe('regular');
  });
});

describe('validarReserva', () => {
  const base = (): ReservaInput => ({
    tipo: 'clase',
    inicio: instanteLima('2026-10-05', 9),
    fin: instanteLima('2026-10-05', 11),
    centro: { id: 'c1', horaApertura: 7, horaCierre: 22 },
    vehiculo: { estado: 'activo', placa: 'ABC-123', soatVence: '2027-01-01', revisionVence: '2027-01-01' },
    horasDisponibles: 4,
  });
  it('acepta una reserva válida', () => {
    expect(validarReserva(base())).toEqual([]);
  });
  it('acepta duración flexible en tramos de 30 min y empezar a la media hora (7:30 a 9:00)', () => {
    const r = base();
    r.inicio = instanteLima('2026-10-05', 7, 30);
    r.fin = instanteLima('2026-10-05', 9);
    expect(validarReserva(r)).toEqual([]);
  });
  it('rechaza horas que no son en punto ni a la media hora, y duraciones fuera de tramo', () => {
    const r = base();
    r.inicio = instanteLima('2026-10-05', 9, 15);
    r.fin = instanteLima('2026-10-05', 11, 15);
    expect(validarReserva(r).join()).toMatch(/media hora/);
    const r2 = base();
    r2.fin = instanteLima('2026-10-05', 10, 20);
    expect(validarReserva(r2).join()).toMatch(/tramos de 30/);
  });
  it('limita la duración: clase hasta 4 h, acompañamiento hasta 12 h', () => {
    const r = base();
    r.fin = instanteLima('2026-10-05', 14);
    expect(validarReserva(r).join()).toMatch(/hasta 4 h/);
    const a = { ...base(), tipo: 'acompanamiento' as const, horasDisponibles: null };
    a.fin = instanteLima('2026-10-05', 14);
    expect(validarReserva(a)).toEqual([]);
  });
  it('una clase necesita paquete; el acompañamiento no', () => {
    expect(validarReserva({ ...base(), horasDisponibles: null }).join()).toMatch(/paquete/);
  });
  it('respeta el horario de clases', () => {
    const r = base();
    r.inicio = instanteLima('2026-10-05', 21);
    r.fin = instanteLima('2026-10-05', 23);
    expect(validarReserva(r).join()).toMatch(/horario de clases/);
  });
  it('bloquea carros en mantenimiento o con SOAT / revisión vencidos', () => {
    const r = base();
    r.vehiculo.estado = 'mantenimiento';
    r.vehiculo.soatVence = '2026-10-01';
    r.vehiculo.revisionVence = null;
    const e = validarReserva(r).join();
    expect(e).toMatch(/mantenimiento/);
    expect(e).toMatch(/SOAT/);
    expect(e).toMatch(/revisión técnica/);
  });
  it('no deja pasarse de las horas del paquete', () => {
    const r = base();
    r.horasDisponibles = 1;
    expect(validarReserva(r).join()).toMatch(/quedan 1 h/);
  });
  it('avisa vencimientos a 30 días', () => {
    expect(alertaVencimiento('2026-10-10', '2026-09-26')).toBe('por_vencer');
    expect(alertaVencimiento('2026-09-01', '2026-09-26')).toBe('vencido');
    expect(alertaVencimiento(null, '2026-09-26')).toBe('sin_dato');
  });
});

describe('roles', () => {
  it('el vendedor vende y agenda, pero no cambia precios ni ve todo el análisis', () => {
    expect(puede(vendedor, 'venta.crear')).toBe(true);
    expect(puede(vendedor, 'clase.agendar')).toBe(true);
    expect(puede(vendedor, 'producto.editar')).toBe(false);
    expect(puede(vendedor, 'analisis.ver_todo')).toBe(false);
  });
  it('solo el propietario crea propietarios y nadie cambia su propio rol', () => {
    expect(puedeAsignarRol(admin, 'propietario')).toBe(false);
    expect(puedeAsignarRol(propietario, 'propietario')).toBe(true);
    expect(puedeAsignarRol(admin, 'vendedor', admin.id)).toBe(false);
  });
});

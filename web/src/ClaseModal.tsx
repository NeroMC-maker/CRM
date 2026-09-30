import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Clase, type Horario, type PuntoRecojo, type Vehiculo } from './api';
import { Icono } from './iconos';
import { useCentros, usePuede } from './sesion';
import { Campo, ErrorCaja, Modal, useAviso } from './ui';
import { ESTADO_CLASE, fechaLarga, fechaLima, hhmm, horaLima, waLink } from './util';

const durTexto = (d: number) => (d < 1 ? '30 min' : `${Math.floor(d)} h${d % 1 ? ' 30' : ''}`);

/**
 * Ventana de una reserva: reprogramar (fecha, hora, duración, carro), recojo y notas, instructor,
 * marcar realizada / no asistió, deshacer una marca hecha por error o cancelar.
 * Se usa en el horario y en la ficha del alumno.
 */
export function ClaseModal(props: { clase: Clase; onCerrar: () => void; reprogramarDeInicio?: boolean }) {
  const c = props.clase;
  const puede = usePuede();
  const qc = useQueryClient();
  const avisar = useAviso();
  const centros = useCentros();
  const t = new Date(c.inicio);
  const durActual = (new Date(c.fin).getTime() - t.getTime()) / 3_600_000;
  const [modo, setModo] = useState<'ver' | 'mover' | 'detalles'>(props.reprogramarDeInicio ? 'mover' : 'ver');
  const [fecha, setFecha] = useState(fechaLima(t));
  const [hora, setHora] = useState(horaLima(t));
  const [duracion, setDuracion] = useState(durActual);
  const [vehiculoId, setVehiculoId] = useState(c.vehiculoId);
  const [puntoId, setPuntoId] = useState(c.puntoRecojoId ?? '');
  const [direccion, setDireccion] = useState(c.direccionRecojo ?? '');
  const [notas, setNotas] = useState(c.notas ?? '');

  const apertura = centros.length ? Math.min(...centros.map((x) => x.horaApertura)) : 7;
  const cierre = centros.length ? Math.max(...centros.map((x) => x.horaCierre)) : 22;
  const vehiculos = useQuery({ queryKey: ['vehiculos'], queryFn: () => api.get<Vehiculo[]>('/vehiculos') });
  const carros = (vehiculos.data ?? []).filter((v) => v.estado !== 'baja');
  const puntos = useQuery({ queryKey: ['puntos-recojo'], queryFn: () => api.get<PuntoRecojo[]>('/puntos-recojo'), staleTime: 5 * 60_000 });
  const punto = puntos.data?.find((p) => p.id === puntoId);

  const libres = useQuery({
    queryKey: ['instructores-libres', c.id],
    queryFn: () => api.get<{ id: string; nombres: string }[]>(`/clases/${c.id}/instructores-libres`),
    enabled: puede('clase.agendar') && c.estado === 'programada',
  });

  // Horario de ese día (clases y breaks) para marcar qué horas están ocupadas al reprogramar.
  const delDia = useQuery({
    queryKey: ['horario', fecha, fecha],
    queryFn: () => api.get<Horario>(`/horario?desde=${fecha}&hasta=${fecha}`),
    enabled: modo === 'mover',
  });
  const ocupadas = useMemo(() => {
    const m = new Map<number, string>();
    const marcar = (ini: number, fin: number, motivo: string) => {
      // Un inicio h choca si [h, h+duración) se superpone con [ini, fin).
      for (let h = apertura; h < cierre; h += 0.5) if (h < fin && h + duracion > ini && !m.has(h)) m.set(h, motivo);
    };
    for (const o of delDia.data?.clases ?? []) {
      if (o.id === c.id) continue;
      const ini = horaLima(new Date(o.inicio));
      const fin = horaLima(new Date(o.fin));
      if (o.vehiculoId === vehiculoId) marcar(ini, fin, `carro ocupado (${o.alumno.split(' ')[0]})`);
      else if (o.alumnoId === c.alumnoId) marcar(ini, fin, 'el alumno ya tiene clase');
    }
    for (const b of delDia.data?.bloqueos ?? []) {
      if (b.vehiculoId === vehiculoId) marcar(horaLima(new Date(b.inicio)), horaLima(new Date(b.fin)), 'break');
    }
    return m;
  }, [delDia.data, vehiculoId, c.id, c.alumnoId, duracion, apertura, cierre]);

  const refrescar = () => ['horario', 'clases', 'paquetes', 'por-asignar', 'alumno', 'hoy'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const accion = useMutation({
    mutationFn: (v: { f: () => Promise<unknown>; msg: string }) => v.f(),
    onSuccess: (_r, v) => {
      refrescar();
      avisar(v.msg);
      props.onCerrar();
    },
  });

  const horasInicio = Array.from({ length: (cierre - apertura) * 2 }, (_, i) => apertura + i / 2).filter((h) => h + duracion <= cierre);
  const maxDur = c.tipo === 'acompanamiento' ? 12 : 4;
  const duraciones = Array.from({ length: maxDur * 2 }, (_, i) => (i + 1) / 2);
  const programada = c.estado === 'programada';
  const marcada = c.estado === 'realizada' || c.estado === 'no_asistio';
  const libreElegido = !ocupadas.has(hora);
  const wa = waLink(c.telefonoAlumno);
  const recojo = c.direccionRecojo ?? c.puntoRecojo;

  return (
    <Modal titulo={`${c.tipo === 'acompanamiento' ? 'Acompañamiento' : 'Clase'} de ${c.alumno}`} onCerrar={props.onCerrar} ancho={620}>
      <div className="grid g2">
        <div>
          <div className="suave chico">Horario</div>
          <strong>
            {fechaLarga(fechaLima(t))}, {hhmm(horaLima(t))}–{hhmm(horaLima(new Date(c.fin)))}
          </strong>{' '}
          <span className="suave chico">({durTexto(durActual)})</span>
        </div>
        <div>
          <div className="suave chico">Estado</div>
          <span className={`chip ${c.estado === 'realizada' ? 'ok' : c.estado === 'no_asistio' ? 'gris' : c.estado === 'cancelada' ? 'error' : ''}`}>{ESTADO_CLASE[c.estado]}</span>
        </div>
        <div>
          <div className="suave chico">Carro</div>
          <strong>{c.carro}</strong> <span className="suave chico">{c.placa}</span>
        </div>
        <div>
          <div className="suave chico">Alumno</div>
          {puede('alumno.editar') ? <Link to={`/alumnos/${c.alumnoId}`} onClick={props.onCerrar}>{c.alumno}</Link> : c.alumno}
          {c.telefonoAlumno && (
            <div className="suave chico">
              {c.telefonoAlumno}
              {wa && <> · <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a></>}
            </div>
          )}
        </div>
        <div>
          <div className="suave chico">Recojo</div>
          {recojo ?? <span className="suave">Sin indicar</span>}
        </div>
        {c.notas && (
          <div>
            <div className="suave chico">Nota</div>
            <span className="chip alerta">{c.notas}</span>
          </div>
        )}
      </div>

      {puede('clase.agendar') && programada && modo === 'ver' && (
        <Campo etiqueta="Instructor">
          <select
            value={c.instructorId ?? ''}
            disabled={accion.isPending}
            onChange={(e) => {
              const v = e.target.value || null;
              accion.mutate({ f: () => api.patch(`/clases/${c.id}/instructor`, { instructorId: v }), msg: 'Instructor actualizado' });
            }}
          >
            <option value="">Sin asignar</option>
            {c.instructorId && !libres.data?.some((i) => i.id === c.instructorId) && <option value={c.instructorId}>{c.instructor}</option>}
            {(libres.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombres}</option>)}
          </select>
        </Campo>
      )}
      {(!puede('clase.agendar') || !programada) && (
        <div>
          <div className="suave chico">Instructor</div>
          <strong>{c.instructor ?? 'Sin asignar'}</strong>
        </div>
      )}

      {modo === 'mover' && (
        <div className="carrito-item" style={{ background: 'var(--fondo-2)' }}>
          <strong>Nuevo horario</strong>
          <div className="grid g4" style={{ marginTop: 8 }}>
            <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></Campo>
            <Campo etiqueta="Carro">
              <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
                {carros.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.estado !== 'activo'}>
                    {v.nombre ?? v.placa}{v.estado !== 'activo' ? ' (mantenimiento)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <select value={hora} onChange={(e) => setHora(Number(e.target.value))}>
                {horasInicio.map((h) => (
                  <option key={h} value={h} disabled={ocupadas.has(h)}>
                    {hhmm(h)}{ocupadas.has(h) ? ` · ${ocupadas.get(h)}` : ''}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Duración">
              <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                {duraciones.map((d) => <option key={d} value={d}>{durTexto(d)}</option>)}
              </select>
            </Campo>
          </div>
          <div className="suave chico" style={{ marginTop: 6 }}>
            {delDia.isFetching ? 'Revisando disponibilidad…' : `${horasInicio.length - [...ocupadas.keys()].filter((h) => horasInicio.includes(h)).length} horarios libres ese día para este carro.`}
            {c.tipo === 'clase' && duracion !== durActual && ' Cambiar la duración cambia las horas que descuenta del paquete.'}
          </div>
        </div>
      )}

      {modo === 'detalles' && (
        <div className="carrito-item" style={{ background: 'var(--fondo-2)' }}>
          <Campo etiqueta="Recojo">
            <div className="fila">
              {(puntos.data ?? []).map((p) => (
                <button key={p.id} type="button" className={`elegible ${puntoId === p.id ? 'sel' : ''}`} style={{ fontWeight: 500, fontSize: '0.86rem', padding: '6px 10px' }} onClick={() => setPuntoId(p.id)}>
                  {p.nombre}
                </button>
              ))}
            </div>
          </Campo>
          {punto?.tipo === 'domicilio' && (
            <Campo etiqueta="Dirección"><input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Campo>
          )}
          <Campo etiqueta="Nota"><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: es menor de edad · no reprogramar" /></Campo>
        </div>
      )}

      <ErrorCaja error={accion.error} />

      <div className="fila">
        {modo === 'mover' && (
          <>
            <button
              className="btn"
              disabled={accion.isPending || !libreElegido}
              onClick={() =>
                accion.mutate({
                  f: () => api.patch(`/clases/${c.id}/reprogramar`, { fecha, hora, duracion, vehiculoId }),
                  msg: `Movida a ${fechaLarga(fecha)} ${hhmm(hora)}–${hhmm(hora + duracion)}`,
                })
              }
            >
              <Icono n="check" t={16} /> Guardar nuevo horario
            </button>
            <button className="btn sec" onClick={() => setModo('ver')}>Volver</button>
          </>
        )}
        {modo === 'detalles' && (
          <>
            <button
              className="btn"
              disabled={accion.isPending || (punto?.tipo === 'domicilio' && !direccion.trim())}
              onClick={() =>
                accion.mutate({
                  f: () => api.patch(`/clases/${c.id}/detalles`, { puntoRecojoId: puntoId || null, direccionRecojo: punto?.tipo === 'domicilio' ? direccion : null, notas: notas || null }),
                  msg: 'Recojo y nota guardados',
                })
              }
            >
              <Icono n="check" t={16} /> Guardar
            </button>
            <button className="btn sec" onClick={() => setModo('ver')}>Volver</button>
          </>
        )}
        {modo === 'ver' && (
          <>
            {programada && puede('clase.agendar') && (
              <>
                <button className="btn" onClick={() => setModo('mover')}><Icono n="calendario" t={16} /> Reprogramar</button>
                <button className="btn sec" onClick={() => setModo('detalles')}>Recojo y nota</button>
              </>
            )}
            {programada && puede('clase.marcar') && (
              <>
                <button className="btn sec" onClick={() => accion.mutate({ f: () => api.patch(`/clases/${c.id}/estado`, { estado: 'realizada' }), msg: 'Marcada como realizada' })}>
                  Realizada
                </button>
                <button className="btn sec" onClick={() => accion.mutate({ f: () => api.patch(`/clases/${c.id}/estado`, { estado: 'no_asistio' }), msg: 'Marcada: no asistió' })}>
                  No asistió
                </button>
              </>
            )}
            {marcada && puede('clase.agendar') && (
              <button className="btn sec" onClick={() => accion.mutate({ f: () => api.patch(`/clases/${c.id}/estado`, { estado: 'programada' }), msg: 'Volvió a programada' })} title="Si se marcó por error">
                <Icono n="recargar" t={16} /> Deshacer marca
              </button>
            )}
            {programada && puede('clase.agendar') && (
              <>
                <span className="espacio" />
                <button
                  className="btn peligro"
                  onClick={() =>
                    confirm(c.tipo === 'clase' ? '¿Cancelar esta clase? Las horas vuelven al paquete del alumno.' : '¿Cancelar este acompañamiento?') &&
                    accion.mutate({ f: () => api.patch(`/clases/${c.id}/estado`, { estado: 'cancelada' }), msg: 'Reserva cancelada' })
                  }
                >
                  Cancelar
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

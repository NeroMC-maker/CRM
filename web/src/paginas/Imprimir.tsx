import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Clase } from '../api';
import { useCentros } from '../sesion';
import { ESTADO_CLASE, fechaLarga, fechaLima, hhmm, horaLima, hoyLima } from '../util';

type Agrupar = 'dia' | 'carro' | 'instructor';

/**
 * Hoja de horarios para imprimir o "Guardar como PDF" desde el navegador.
 * Se genera en el navegador: no usa servidor ni servicios de pago.
 */
export function Imprimir() {
  const [params] = useSearchParams();
  const centros = useCentros();
  const centroId = params.get('centroId') ?? '';
  const desde = params.get('desde') ?? hoyLima();
  const hasta = params.get('hasta') ?? desde;
  const vehiculoId = params.get('vehiculoId');
  const [agrupar, setAgrupar] = useState<Agrupar>((params.get('agrupar') as Agrupar | null) ?? 'dia');
  const centro = centros.find((c) => c.id === centroId);
  const q = useQuery({
    queryKey: ['clases', centroId, desde, hasta, 'imprimir'],
    queryFn: () => api.get<Clase[]>(`/clases?${centroId ? `centroId=${centroId}&` : ''}desde=${desde}&hasta=${hasta}`),
  });
  // Si viene filtrado por carro desde el calendario, solo ese carro.
  const lista = (q.data ?? []).filter((c) => !vehiculoId || c.vehiculoId === vehiculoId);

  const grupos = useMemo(() => {
    const m = new Map<string, Clase[]>();
    for (const c of lista) {
      const k = agrupar === 'dia' ? fechaLima(new Date(c.inicio)) : agrupar === 'carro' ? c.placa : (c.instructor ?? 'Sin instructor asignado');
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lista, agrupar]);

  return (
    <div className="hoja">
      <div className="fila no-imprimir" style={{ marginBottom: 16 }}>
        <label className="fila">
          Agrupar por
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)} style={{ width: 'auto' }}>
            <option value="dia">Día</option>
            <option value="carro">Carro</option>
            <option value="instructor">Instructor</option>
          </select>
        </label>
        <span className="espacio" />
        <button className="btn" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>
      <div className="hoja-cab">
        <div>
          <div style={{ fontWeight: 800, color: 'var(--azul-800)', fontSize: '1.25rem' }}>Tulicencia.com.pe</div>
          <div>Horario de clases · {centro?.nombre ?? 'Ambos centros'}{vehiculoId && lista[0] ? ` · carro ${lista[0].placa}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong>{desde === hasta ? fechaLarga(desde) : `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`}</strong>
          <div className="suave chico">{lista.length} clases · impreso {fechaLarga(hoyLima())}</div>
        </div>
      </div>
      {q.isLoading && <div className="vacio">Cargando…</div>}
      {q.isSuccess && grupos.length === 0 && <div className="vacio">No hay clases en este periodo.</div>}
      {grupos.map(([clave, lista]) => (
        <table key={clave} style={{ marginBottom: 14 }}>
          <thead>
            <tr><th className="dia" colSpan={6}>{agrupar === 'dia' ? fechaLarga(clave) : clave}</th></tr>
            <tr>
              {agrupar !== 'dia' && <th>Fecha</th>}
              <th style={{ width: 110 }}>Hora</th>
              {agrupar !== 'carro' && <th>Carro</th>}
              {agrupar !== 'instructor' && <th>Instructor</th>}
              <th>Alumno</th>
              <th>Teléfono</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const t = new Date(c.inicio);
              return (
                <tr key={c.id}>
                  {agrupar !== 'dia' && <td>{fechaLarga(fechaLima(t))}</td>}
                  <td>{hhmm(horaLima(t))}–{hhmm(horaLima(new Date(c.fin)))}</td>
                  {agrupar !== 'carro' && <td>{c.placa}</td>}
                  {agrupar !== 'instructor' && <td>{c.instructor ?? '—'}</td>}
                  <td>{c.alumno}</td>
                  <td>{c.telefonoAlumno ?? ''}</td>
                  <td>{ESTADO_CLASE[c.estado]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}

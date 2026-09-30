import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useCentros } from '../sesion';
import { ErrorCaja, useAviso } from '../ui';
import { fechaLarga, fechaLima, hhmm, horaLima } from '../util';

interface Pendiente {
  id: string;
  inicio: string;
  fin: string;
  centroId: string;
  centro: string;
  placa: string;
  alumno: string;
}

export function PorAsignar() {
  const centros = useCentros();
  const [centroId, setCentroId] = useState('');
  const q = useQuery({
    queryKey: ['por-asignar', centroId],
    queryFn: () => api.get<Pendiente[]>(`/clases/sin-instructor${centroId ? `?centroId=${centroId}` : ''}`),
    refetchInterval: 15_000,
  });
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Clases por asignar instructor</h1>
          <p>El horario y el carro ya están reservados; falta elegir quién dicta la clase. Solo aparecen instructores libres a esa hora.</p>
        </div>
        <select value={centroId} onChange={(e) => setCentroId(e.target.value)} style={{ width: 'auto' }} aria-label="Centro">
          <option value="">Todos los centros</option>
          {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="tarjeta tabla-scroll">
        {q.data && q.data.length === 0 ? (
          <div className="vacio">Todas las clases tienen instructor.</div>
        ) : (
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Hora</th><th>Centro</th><th>Carro</th><th>Alumno</th><th style={{ width: 260 }}>Instructor</th></tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => <FilaPendiente key={c.id} c={c} />)}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function FilaPendiente({ c }: { c: Pendiente }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const libres = useQuery({
    queryKey: ['instructores-libres', c.id],
    queryFn: () => api.get<{ id: string; nombres: string }[]>(`/clases/${c.id}/instructores-libres`),
  });
  const asignar = useMutation({
    mutationFn: (instructorId: string) => api.patch(`/clases/${c.id}/instructor`, { instructorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['por-asignar'] });
      qc.invalidateQueries({ queryKey: ['clases'] });
      avisar('Instructor asignado');
    },
  });
  const t = new Date(c.inicio);
  return (
    <tr>
      <td>{fechaLarga(fechaLima(t))}</td>
      <td>{hhmm(horaLima(t))}–{hhmm(horaLima(new Date(c.fin)))}</td>
      <td>{c.centro}</td>
      <td>{c.placa}</td>
      <td>{c.alumno}</td>
      <td>
        <select defaultValue="" disabled={asignar.isPending} onChange={(e) => e.target.value && asignar.mutate(e.target.value)} aria-label="Asignar instructor">
          <option value="">{libres.data?.length === 0 ? 'Nadie libre a esa hora' : 'Elegir…'}</option>
          {(libres.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombres}</option>)}
        </select>
        {asignar.error ? <ErrorCaja error={asignar.error} /> : null}
      </td>
    </tr>
  );
}

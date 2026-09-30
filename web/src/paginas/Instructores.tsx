import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Instructor } from '../api';
import { useCentros, usePuede } from '../sesion';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';

export function Instructores() {
  const puede = usePuede();
  const centros = useCentros();
  const q = useQuery({ queryKey: ['instructores'], queryFn: () => api.get<Instructor[]>('/instructores') });
  const [edit, setEdit] = useState<Instructor | 'nuevo' | null>(null);
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Instructores</h1>
          <p>Un instructor sin centro puede dictar clases en ambos.</p>
        </div>
        {puede('instructor.editar') && <button className="btn" onClick={() => setEdit('nuevo')}>+ Agregar instructor</button>}
      </div>
      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Licencia</th><th>Categorías</th><th>Centro</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(q.data ?? []).map((i) => (
              <tr key={i.id} style={!i.activo ? { opacity: 0.55 } : undefined}>
                <td><strong>{i.nombres}</strong></td>
                <td>{i.dni ?? '—'}</td>
                <td>{i.telefono ?? '—'}</td>
                <td>{i.licencia ?? '—'}</td>
                <td>{i.categorias.join(', ')}</td>
                <td>{i.centroId ? centros.find((c) => c.id === i.centroId)?.nombre : 'Ambos'}</td>
                <td>{i.activo ? <span className="chip ok">Activo</span> : <span className="chip gris">Inactivo</span>}</td>
                <td>{puede('instructor.editar') && <button className="btn fantasma" onClick={() => setEdit(i)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <InstructorForm instructor={edit === 'nuevo' ? null : edit} onCerrar={() => setEdit(null)} />}
    </>
  );
}

function InstructorForm({ instructor, onCerrar }: { instructor: Instructor | null; onCerrar: () => void }) {
  const centros = useCentros();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState({
    nombres: instructor?.nombres ?? '',
    dni: instructor?.dni ?? '',
    telefono: instructor?.telefono ?? '',
    licencia: instructor?.licencia ?? '',
    categorias: (instructor?.categorias ?? ['A-I']).join(', '),
    centroId: instructor?.centroId ?? '',
    activo: instructor?.activo ?? true,
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        ...f,
        dni: f.dni || null,
        telefono: f.telefono || null,
        licencia: f.licencia || null,
        centroId: f.centroId || null,
        categorias: f.categorias.split(',').map((s) => s.trim()).filter(Boolean),
      };
      return instructor ? api.put(`/instructores/${instructor.id}`, cuerpo) : api.post('/instructores', cuerpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructores'] });
      avisar('Instructor guardado');
      onCerrar();
    },
  });
  return (
    <Modal
      titulo={instructor ? 'Editar instructor' : 'Agregar instructor'}
      onCerrar={onCerrar}
      pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}
    >
      <div className="grid g2">
        <Campo etiqueta="Nombre completo"><input value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
        <Campo etiqueta="DNI"><input value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Campo>
        <Campo etiqueta="Teléfono"><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="N.º de licencia"><input value={f.licencia} onChange={(e) => setF({ ...f, licencia: e.target.value })} /></Campo>
        <Campo etiqueta="Categorías que enseña" ayuda="Separadas por coma: A-I, A-IIa"><input value={f.categorias} onChange={(e) => setF({ ...f, categorias: e.target.value })} /></Campo>
        <Campo etiqueta="Centro">
          <select value={f.centroId} onChange={(e) => setF({ ...f, centroId: e.target.value })}>
            <option value="">Ambos centros</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <label className="fila"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

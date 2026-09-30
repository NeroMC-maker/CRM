import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { alertaVencimiento } from '../../../core/domain/agenda';
import { api, type Vehiculo } from '../api';
import { useCentros, usePuede } from '../sesion';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';
import { fechaCorta, hoyLima, TRANSMISION } from '../util';

function Vence({ fecha }: { fecha: string | null }) {
  const a = alertaVencimiento(fecha, hoyLima());
  if (a === 'sin_dato') return <span className="chip error">Sin registrar</span>;
  if (a === 'vencido') return <span className="chip error">Vencido {fechaCorta(fecha)}</span>;
  if (a === 'por_vencer') return <span className="chip alerta">Vence {fechaCorta(fecha)}</span>;
  return <span className="chip ok">{fechaCorta(fecha)}</span>;
}

const ESTADO = { activo: 'Activo', mantenimiento: 'Mantenimiento', baja: 'De baja' } as const;

export function Flota() {
  const puede = usePuede();
  const centros = useCentros();
  const q = useQuery({ queryKey: ['vehiculos'], queryFn: () => api.get<Vehiculo[]>('/vehiculos') });
  const [edit, setEdit] = useState<Vehiculo | 'nuevo' | null>(null);
  const lista = q.data ?? [];
  const alertas = lista.filter(
    (v) => v.estado === 'activo' && [v.soatVence, v.revisionVence].some((f) => alertaVencimiento(f, hoyLima()) !== 'ok'),
  );
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Flota</h1>
          <p>Un carro en mantenimiento, de baja o con SOAT o revisión técnica vencidos no se puede agendar.</p>
        </div>
        {puede('flota.editar') && <button className="btn" onClick={() => setEdit('nuevo')}>+ Agregar carro</button>}
      </div>
      {alertas.length > 0 && (
        <div className="aviso alerta" style={{ marginBottom: 14 }}>
          {alertas.length === 1 ? 'Un carro tiene' : `${alertas.length} carros tienen`} documentos vencidos, por vencer (30 días) o sin registrar: {alertas.map((v) => v.placa).join(', ')}.
        </div>
      )}
      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th>Placa</th><th>Carro</th><th>Transmisión</th><th>Centro</th><th>Estado</th><th>SOAT</th><th>Revisión técnica</th><th /></tr>
          </thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id} style={v.estado === 'baja' ? { opacity: 0.55 } : undefined}>
                <td><span className="chip-carro"><i style={{ background: v.colorHorario }} /><strong>{v.nombre ?? v.placa}</strong></span><div className="suave chico">{v.placa}</div></td>
                <td>{v.marca} {v.modelo} {v.anio ?? ''}<div className="suave chico">Cat. {v.categoria}{v.notas ? ` · ${v.notas}` : ''}</div></td>
                <td>{TRANSMISION[v.transmision]}</td>
                <td>{centros.find((c) => c.id === v.centroId)?.nombre}</td>
                <td><span className={`chip ${v.estado === 'activo' ? 'ok' : v.estado === 'baja' ? 'gris' : 'alerta'}`}>{ESTADO[v.estado]}</span></td>
                <td><Vence fecha={v.soatVence} /></td>
                <td><Vence fecha={v.revisionVence} /></td>
                <td>{puede('flota.editar') && <button className="btn fantasma" onClick={() => setEdit(v)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <VehiculoForm vehiculo={edit === 'nuevo' ? null : edit} onCerrar={() => setEdit(null)} />}
    </>
  );
}

function VehiculoForm({ vehiculo, onCerrar }: { vehiculo: Vehiculo | null; onCerrar: () => void }) {
  const centros = useCentros();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState({
    placa: vehiculo?.placa ?? '',
    nombre: vehiculo?.nombre ?? '',
    colorHorario: vehiculo?.colorHorario ?? '#2563eb',
    orden: String(vehiculo?.orden ?? 0),
    marca: vehiculo?.marca ?? '',
    modelo: vehiculo?.modelo ?? '',
    anio: vehiculo?.anio ? String(vehiculo.anio) : '',
    transmision: vehiculo?.transmision ?? 'mecanica',
    categoria: vehiculo?.categoria ?? 'A-I',
    color: vehiculo?.color ?? '',
    centroId: vehiculo?.centroId ?? centros[0]?.id ?? '',
    estado: vehiculo?.estado ?? 'activo',
    soatVence: vehiculo?.soatVence ?? '',
    revisionVence: vehiculo?.revisionVence ?? '',
    notas: vehiculo?.notas ?? '',
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        ...f,
        anio: f.anio ? Number(f.anio) : null,
        nombre: f.nombre.trim() || null,
        orden: Number(f.orden) || 0,
        soatVence: f.soatVence || null,
        revisionVence: f.revisionVence || null,
        color: f.color || null,
        notas: f.notas || null,
      };
      return vehiculo ? api.put(`/vehiculos/${vehiculo.id}`, cuerpo) : api.post('/vehiculos', cuerpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehiculos'] });
      avisar(vehiculo ? 'Carro actualizado' : 'Carro agregado');
      onCerrar();
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      titulo={vehiculo ? `Editar ${vehiculo.placa}` : 'Agregar carro'}
      onCerrar={onCerrar}
      pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</button></>}
    >
      <div className="grid g3">
        <Campo etiqueta="Nombre en el horario" ayuda="Ej.: KIA BLANCO"><input value={f.nombre} onChange={set('nombre')} /></Campo>
        <Campo etiqueta="Color de la columna"><input type="color" value={f.colorHorario} onChange={set('colorHorario')} style={{ height: 38, padding: 2 }} /></Campo>
        <Campo etiqueta="Orden en el horario"><input type="number" value={f.orden} onChange={set('orden')} /></Campo>
        <Campo etiqueta="Placa"><input value={f.placa} onChange={set('placa')} placeholder="ABC-123" /></Campo>
        <Campo etiqueta="Marca"><input value={f.marca} onChange={set('marca')} /></Campo>
        <Campo etiqueta="Modelo"><input value={f.modelo} onChange={set('modelo')} /></Campo>
        <Campo etiqueta="Año"><input type="number" value={f.anio} onChange={set('anio')} /></Campo>
        <Campo etiqueta="Transmisión">
          <select value={f.transmision} onChange={set('transmision')}>
            <option value="mecanica">Mecánico</option><option value="automatica">Automático</option>
          </select>
        </Campo>
        <Campo etiqueta="Categoría"><input value={f.categoria} onChange={set('categoria')} /></Campo>
        <Campo etiqueta="Centro">
          <select value={f.centroId} onChange={set('centroId')}>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select value={f.estado} onChange={set('estado')}>
            {Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Color"><input value={f.color} onChange={set('color')} /></Campo>
        <Campo etiqueta="SOAT vence"><input type="date" value={f.soatVence} onChange={set('soatVence')} /></Campo>
        <Campo etiqueta="Revisión técnica vence"><input type="date" value={f.revisionVence} onChange={set('revisionVence')} /></Campo>
      </div>
      <Campo etiqueta="Notas"><input value={f.notas} onChange={set('notas')} /></Campo>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

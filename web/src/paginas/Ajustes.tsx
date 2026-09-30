import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Centro, type Instructor, type Rol, type Usuario } from '../api';
import { useCentros, useYo } from '../sesion';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';
import { fechaHora, ROLES } from '../util';

export function Ajustes() {
  const yo = useYo();
  const centros = useCentros();
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<Usuario[]>('/usuarios') });
  const [editU, setEditU] = useState<Usuario | 'nuevo' | null>(null);
  const [editC, setEditC] = useState<Centro | null>(null);
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Usuarios y centros</h1>
          <p>Hasta 5 usuarios. Los permisos de cada rol están en docs/permisos.md.</p>
        </div>
        <button className="btn" onClick={() => setEditU('nuevo')}>+ Usuario</button>
      </div>
      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Centro</th><th>Último acceso</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(usuarios.data ?? []).map((u) => (
              <tr key={u.id} style={!u.activo ? { opacity: 0.55 } : undefined}>
                <td><strong>{u.nombre}</strong>{u.id === yo.id && <span className="chip" style={{ marginLeft: 6 }}>Tú</span>}</td>
                <td>{u.email}</td>
                <td>{ROLES[u.rol]}</td>
                <td>{centros.find((c) => c.id === u.centroId)?.nombre ?? '—'}</td>
                <td>{u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : 'Nunca'}</td>
                <td>{u.activo ? <span className="chip ok">Activo</span> : <span className="chip gris">Inactivo</span>}</td>
                <td>{(u.rol !== 'propietario' || yo.rol === 'propietario') && <button className="btn fantasma" onClick={() => setEditU(u)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tarjeta tabla-scroll">
        <h2 style={{ marginBottom: 10 }}>Centros</h2>
        <table className="tabla">
          <thead><tr><th>Centro</th><th>Dirección</th><th>Teléfono</th><th>Horario de clases</th><th /></tr></thead>
          <tbody>
            {centros.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nombre}</strong></td>
                <td>{c.direccion}</td>
                <td>{c.telefono}</td>
                <td>{c.horaApertura}:00 – {c.horaCierre}:00</td>
                <td><button className="btn fantasma" onClick={() => setEditC(c)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editU && <UsuarioForm usuario={editU === 'nuevo' ? null : editU} onCerrar={() => setEditU(null)} />}
      {editC && <CentroForm centro={editC} onCerrar={() => setEditC(null)} />}
    </>
  );
}

function UsuarioForm({ usuario, onCerrar }: { usuario: Usuario | null; onCerrar: () => void }) {
  const yo = useYo();
  const centros = useCentros();
  const qc = useQueryClient();
  const avisar = useAviso();
  const instructores = useQuery({ queryKey: ['instructores'], queryFn: () => api.get<Instructor[]>('/instructores') });
  const [f, setF] = useState({
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    rol: (usuario?.rol ?? 'vendedor') as Rol,
    centroId: usuario?.centroId ?? '',
    instructorId: usuario?.instructorId ?? '',
    activo: usuario?.activo ?? true,
    password: '',
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        ...f,
        centroId: f.centroId || null,
        instructorId: f.rol === 'instructor' ? f.instructorId || null : null,
        password: f.password || undefined,
      };
      return usuario ? api.put(`/usuarios/${usuario.id}`, cuerpo) : api.post('/usuarios', cuerpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisar('Usuario guardado');
      onCerrar();
    },
  });
  const roles = (Object.keys(ROLES) as Rol[]).filter((r) => r !== 'propietario' || yo.rol === 'propietario');
  const esYo = usuario?.id === yo.id;
  return (
    <Modal titulo={usuario ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}>
      <div className="grid g2">
        <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Correo"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo etiqueta="Rol">
          <select value={f.rol} disabled={esYo} onChange={(e) => setF({ ...f, rol: e.target.value as Rol })}>
            {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Centro principal">
          <select value={f.centroId} onChange={(e) => setF({ ...f, centroId: e.target.value })}>
            <option value="">—</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        {f.rol === 'instructor' && (
          <Campo etiqueta="Ficha de instructor" ayuda="Verá solo sus clases.">
            <select value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}>
              <option value="">Elegir…</option>
              {(instructores.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.nombres}</option>)}
            </select>
          </Campo>
        )}
        <Campo etiqueta={usuario ? 'Nueva contraseña' : 'Contraseña inicial'} ayuda={usuario ? 'Déjala vacía para no cambiarla.' : 'Mínimo 8 caracteres.'}>
          <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Campo>
      </div>
      {!esYo && <label className="fila"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Puede entrar al sistema</label>}
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

function CentroForm({ centro, onCerrar }: { centro: Centro; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ ...centro });
  const guardar = useMutation({
    mutationFn: () => api.put(`/centros/${centro.id}`, { nombre: f.nombre, direccion: f.direccion, telefono: f.telefono, horaApertura: Number(f.horaApertura), horaCierre: Number(f.horaCierre) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['centros'] });
      onCerrar();
    },
  });
  return (
    <Modal titulo={`Centro ${centro.nombre}`} onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}>
      <div className="grid g2">
        <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Teléfono"><input value={f.telefono ?? ''} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
      </div>
      <Campo etiqueta="Dirección"><input value={f.direccion ?? ''} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></Campo>
      <div className="grid g2">
        <Campo etiqueta="Primera clase desde (hora)"><input type="number" min={0} max={23} value={f.horaApertura} onChange={(e) => setF({ ...f, horaApertura: Number(e.target.value) })} /></Campo>
        <Campo etiqueta="Última clase termina (hora)"><input type="number" min={1} max={24} value={f.horaCierre} onChange={(e) => setF({ ...f, horaCierre: Number(e.target.value) })} /></Campo>
      </div>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

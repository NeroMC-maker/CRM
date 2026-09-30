import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, type Alumno } from './api';
import { Icono, type NombreIcono } from './iconos';
import { usePuede, useYo } from './sesion';
import { escribiendo, Modal, useAtajo } from './ui';
import { ETAPAS, ROLES } from './util';

type Enlace = { a: string; t: string; i: NombreIcono; atajo?: string; permiso: string | null };
const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Día a día',
    enlaces: [
      { a: '/hoy', t: 'Hoy', i: 'hoy', atajo: 'Alt+H', permiso: null },
      { a: '/venta', t: 'Venta rápida', i: 'venta', atajo: 'Alt+V', permiso: 'venta.crear' },
      { a: '/calendario', t: 'Calendario', i: 'calendario', atajo: 'Alt+C', permiso: null },
      { a: '/por-asignar', t: 'Asignar instructores', i: 'asignar', permiso: 'clase.agendar' },
    ],
  },
  {
    titulo: 'Comercial',
    enlaces: [
      { a: '/prospectos', t: 'Prospectos', i: 'prospectos', atajo: 'Alt+P', permiso: 'alumno.editar' },
      { a: '/alumnos', t: 'Alumnos', i: 'alumnos', atajo: 'Alt+A', permiso: 'alumno.editar' },
      { a: '/analisis', t: 'Análisis', i: 'analisis', permiso: 'analisis.ver_propio' },
    ],
  },
  {
    titulo: 'Gestión',
    enlaces: [
      { a: '/flota', t: 'Flota', i: 'flota', permiso: 'clase.ver_todas' },
      { a: '/instructores', t: 'Instructores', i: 'instructores', permiso: 'clase.ver_todas' },
      { a: '/productos', t: 'Productos y ofertas', i: 'productos', permiso: 'venta.crear' },
      { a: '/ajustes', t: 'Usuarios y centros', i: 'ajustes', permiso: 'usuario.editar' },
    ],
  },
];

const ATAJOS: [string, string][] = [
  ['Ctrl + K', 'Buscar alumno o prospecto'],
  ['Alt + H / V / C / P / A', 'Ir a Hoy, Venta, Calendario, Prospectos, Alumnos'],
  ['F2', 'Venta: buscar alumno'],
  ['F4', 'Venta: alumno nuevo'],
  ['1 – 9', 'Venta: agregar producto al carrito'],
  ['Alt + 1 – 5', 'Venta: método de pago'],
  ['Ctrl + Enter', 'Confirmar venta / guardar'],
  ['← →', 'Calendario: día, semana o mes anterior / siguiente'],
  ['T', 'Calendario: hoy'],
  ['D / S / M', 'Calendario: vista día, semana o mes'],
  ['?', 'Esta ayuda'],
];

export function Layout() {
  const yo = useYo();
  const puede = usePuede();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  useAtajo('alt+h', () => nav('/hoy'));
  useAtajo('alt+v', () => puede('venta.crear') && nav('/venta'));
  useAtajo('alt+c', () => nav('/calendario'));
  useAtajo('alt+p', () => puede('alumno.editar') && nav('/prospectos'));
  useAtajo('alt+a', () => puede('alumno.editar') && nav('/alumnos'));
  useAtajo('ctrl+k', () => puede('alumno.editar') && setBuscar(true));
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === '?' && !escribiendo() && setAyuda(true);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const salir = async () => {
    await api.post('/auth/logout');
    qc.clear();
    nav('/entrar');
  };

  return (
    <div className="app">
      <aside className="lateral no-imprimir">
        <div className="marca">
          <div className="marca-logo">TL</div>
          <div className="marca-texto">
            Tulicencia
            <small>Escuela de manejo · CRM</small>
          </div>
        </div>
        {puede('alumno.editar') && (
          <button className="buscador-btn" onClick={() => setBuscar(true)}>
            <Icono n="buscar" t={16} /> Buscar alumno… <kbd>Ctrl K</kbd>
          </button>
        )}
        {GRUPOS.map((g) => {
          const visibles = g.enlaces.filter((e) => !e.permiso || puede(e.permiso));
          if (!visibles.length) return null;
          return (
            <nav key={g.titulo} className="nav-grupo" aria-label={g.titulo}>
              <div className="nav-titulo">{g.titulo}</div>
              {visibles.map((e) => (
                <NavLink key={e.a} to={e.a} className={({ isActive }) => `nav-link ${isActive ? 'activo' : ''}`}>
                  <Icono n={e.i} />
                  {e.t}
                  {e.atajo && <span className="atajo">{e.atajo}</span>}
                </NavLink>
              ))}
            </nav>
          );
        })}
        <div className="lateral-pie">
          <div className="avatar">{yo.nombre.slice(0, 1)}</div>
          <div style={{ minWidth: 0 }}>
            <strong>{yo.nombre}</strong>
            {ROLES[yo.rol]}
          </div>
          <span className="espacio" />
          <button className="btn fantasma icono" onClick={() => setAyuda(true)} title="Atajos de teclado (?)" aria-label="Atajos de teclado">
            <Icono n="teclado" />
          </button>
          <button className="btn fantasma icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icono n="salir" />
          </button>
        </div>
      </aside>
      <main className="principal">
        <Outlet />
      </main>
      {buscar && <Buscador onCerrar={() => setBuscar(false)} />}
      {ayuda && (
        <Modal titulo="Atajos de teclado" onCerrar={() => setAyuda(false)}>
          <table className="tabla">
            <tbody>
              {ATAJOS.map(([k, t]) => (
                <tr key={k}>
                  <td style={{ width: 180 }}><kbd>{k}</kbd></td>
                  <td>{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}

/** Buscador global (Ctrl+K): nombre, DNI o teléfono → ficha. */
function Buscador({ onCerrar }: { onCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(0);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const r = useQuery({
    queryKey: ['alumnos', q],
    queryFn: () => api.get<Alumno[]>(`/alumnos?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  const lista = q.trim().length >= 2 ? (r.data ?? []) : [];
  const ir = (a: Alumno) => {
    onCerrar();
    nav(`/alumnos/${a.id}`);
  };
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="velo arriba" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="paleta" role="dialog" aria-label="Buscar">
        <div className="paleta-entrada">
          <Icono n="buscar" />
          <input
            ref={ref}
            placeholder="Nombre, DNI o teléfono…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setFoco(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCerrar();
              if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => Math.min(f + 1, lista.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
              if (e.key === 'Enter' && lista[foco]) ir(lista[foco]!);
            }}
          />
        </div>
        <div className="paleta-lista">
          {lista.map((a, i) => (
            <button key={a.id} className={`paleta-item ${i === foco ? 'foco' : ''}`} onMouseEnter={() => setFoco(i)} onClick={() => ir(a)}>
              <span>
                <strong>{a.nombres} {a.apellidos}</strong>
                <span className="suave chico"> · DNI {a.dni ?? '—'} · {a.telefono ?? 'sin teléfono'}</span>
              </span>
              <span className={`chip etapa-${a.etapa}`}>{ETAPAS[a.etapa]}</span>
            </button>
          ))}
          {q.trim().length < 2 && <div className="suave chico" style={{ padding: 12 }}>Escribe al menos 2 letras o números.</div>}
          {q.trim().length >= 2 && r.isSuccess && lista.length === 0 && <div className="suave chico" style={{ padding: 12 }}>Sin resultados.</div>}
        </div>
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Alumno, type Clase, type Etapa, type Paquete, type Seguimiento, type VentaResumen } from '../api';
import { ClaseModal } from '../ClaseModal';
import { Icono, type NombreIcono } from '../iconos';
import { usePuede } from '../sesion';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';
import {
  ESTADO_CLASE,
  ETAPAS,
  fechaCorta,
  fechaHora,
  hoyLima,
  METODOS,
  ORIGENES,
  relativo,
  S,
  sumarDias,
  TIPO_PRECIO,
  TIPOS_SEGUIMIENTO,
  urgencia,
  waLink,
} from '../util';
import { NuevoAlumno } from './VentaRapida';

export function Alumnos() {
  const [q, setQ] = useState('');
  const [etapa, setEtapa] = useState<Etapa | ''>('');
  const [nuevo, setNuevo] = useState(false);
  const nav = useNavigate();
  const lista = useQuery({
    queryKey: ['alumnos', 'lista', q],
    queryFn: () => api.get<Alumno[]>(`/alumnos?q=${encodeURIComponent(q)}`),
  });
  const filas = (lista.data ?? []).filter((a) => !etapa || a.etapa === etapa);
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Alumnos y prospectos</h1>
          <p>Todas las personas: prospectos en seguimiento, alumnos matriculados y perdidos.</p>
        </div>
        <button className="btn" onClick={() => setNuevo(true)}><Icono n="mas" t={16} /> Persona nueva</button>
      </div>
      <div className="fila" style={{ marginBottom: 14 }}>
        <input placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 380 }} autoFocus />
        <div className="fila" role="tablist">
          {(['', 'nuevo', 'contactado', 'interesado', 'matriculado', 'perdido'] as const).map((e) => (
            <button key={e} className={`btn ${etapa === e ? '' : 'sec'}`} onClick={() => setEtapa(e)}>{e ? ETAPAS[e] : 'Todos'}</button>
          ))}
        </div>
      </div>
      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th>Nombre</th><th>Etapa</th><th>Teléfono</th><th>DNI</th><th>Origen</th><th>Próximo paso</th><th>Registrado</th></tr>
          </thead>
          <tbody>
            {filas.map((a) => {
              const u = urgencia(a.proximoSeguimiento);
              return (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/alumnos/${a.id}`)}>
                  <td><Link to={`/alumnos/${a.id}`}>{a.nombres} {a.apellidos}</Link></td>
                  <td><span className={`chip etapa-${a.etapa}`}>{ETAPAS[a.etapa]}</span></td>
                  <td>{a.telefono ?? '—'}</td>
                  <td>{a.dni ?? '—'}</td>
                  <td>{ORIGENES[a.origen as keyof typeof ORIGENES] ?? a.origen}</td>
                  <td>{a.proximoSeguimiento ? <span className={`chip ${u === 'vencido' ? 'error' : u === 'hoy' ? 'alerta' : ''}`}>{relativo(a.proximoSeguimiento)}</span> : <span className="suave">—</span>}</td>
                  <td>{fechaCorta(a.creadoEn)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.isSuccess && filas.length === 0 && <div className="vacio">Sin resultados.</div>}
      </div>
      {nuevo && <NuevoAlumno titulo="Persona nueva" onCerrar={() => setNuevo(false)} onCreado={(a) => nav(`/alumnos/${a.id}`)} />}
    </>
  );
}

interface Detalle {
  alumno: Alumno & { vendedor: string | null };
  paquetes: Paquete[];
  ventas: VentaResumen[];
  historial: { actividades: Seguimiento[]; etapas: { id: string; de: Etapa | null; a: Etapa; fecha: string; usuario: string | null }[] };
  clases: Clase[];
}

const ICONO_TIPO: Record<Seguimiento['tipo'], NombreIcono> = { nota: 'productos', llamada: 'telefono', whatsapp: 'mensaje', visita: 'hoy', tarea: 'reloj' };

export function AlumnoDetalle() {
  const { id } = useParams();
  const puede = usePuede();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['alumno', id], queryFn: () => api.get<Detalle>(`/alumnos/${id}`) });
  const [editar, setEditar] = useState(false);
  const [pestana, setPestana] = useState<'paquetes' | 'ventas' | 'clases'>('paquetes');
  const [perder, setPerder] = useState(false);
  const [claseSel, setClaseSel] = useState<{ clase: Clase; mover: boolean } | null>(null);
  const refrescar = () => ['alumno', 'crm', 'hoy', 'alumnos'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const etapa = useMutation({
    mutationFn: (v: { etapa: Etapa; motivo?: string }) => api.patch(`/alumnos/${id}/etapa`, v),
    onSuccess: () => { refrescar(); avisar('Etapa actualizada'); },
  });
  const completar = useMutation({
    mutationFn: (sid: string) => api.patch(`/seguimientos/${sid}/completar`, {}),
    onSuccess: refrescar,
  });

  if (!q.data) return <div className="vacio">{q.error ? 'No se encontró la persona.' : 'Cargando…'}</div>;
  const { alumno, paquetes, ventas, historial, clases } = q.data;
  const comprado = ventas.filter((v) => v.estado === 'activa').reduce((s, v) => s + v.total, 0);
  const porAgendar = paquetes.reduce((s, p) => s + p.horasDisponibles, 0);
  const wa = waLink(alumno.telefono);
  const abierto = ['nuevo', 'contactado', 'interesado'].includes(alumno.etapa);
  const u = urgencia(alumno.proximoSeguimiento);

  // Línea de tiempo: actividades + cambios de etapa, del más reciente al más antiguo.
  const eventos = [
    ...historial.actividades.map((a) => ({ fecha: a.fecha, tipo: 'act' as const, a })),
    ...historial.etapas.map((e) => ({ fecha: e.fecha, tipo: 'etapa' as const, e })),
  ].sort((x, y) => y.fecha.localeCompare(x.fecha));

  return (
    <>
      <div className="cabecera">
        <div>
          <div className="fila">
            <h1>{alumno.nombres} {alumno.apellidos}</h1>
            <span className={`chip etapa-${alumno.etapa}`}>{ETAPAS[alumno.etapa]}</span>
          </div>
          <p>
            {alumno.telefono ?? 'sin teléfono'} · DNI {alumno.dni ?? '—'} · {ORIGENES[alumno.origen as keyof typeof ORIGENES]} · Vendedor: {alumno.vendedor ?? '—'} · Llegó {relativo(alumno.creadoEn)}
          </p>
        </div>
        <div className="fila">
          {wa && <a className="btn sec" href={wa} target="_blank" rel="noreferrer"><Icono n="mensaje" t={16} /> WhatsApp</a>}
          {alumno.telefono && <a className="btn sec" href={`tel:${alumno.telefono}`}><Icono n="telefono" t={16} /> Llamar</a>}
          <button className="btn sec" onClick={() => setEditar(true)}>Editar</button>
          {puede('venta.crear') && <button className="btn" onClick={() => nav('/venta')}><Icono n="venta" t={16} /> Vender</button>}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="tarjeta kpi"><div className="v">{porAgendar} h</div><div className="t">Horas por agendar</div></div>
        <div className="tarjeta kpi"><div className="v">{S(comprado)}</div><div className="t">Total comprado (pagado)</div></div>
        <div className="tarjeta kpi"><div className="v">{clases.filter((c) => c.estado === 'realizada').length}</div><div className="t">Clases realizadas</div></div>
        <div className="tarjeta kpi">
          <div className="v" style={{ fontSize: '1.1rem' }}>
            {abierto ? (alumno.proximoSeguimiento ? <span className={`chip ${u === 'vencido' ? 'error' : u === 'hoy' ? 'alerta' : ''}`}>{relativo(alumno.proximoSeguimiento)}</span> : <span className="chip alerta">Sin próximo paso</span>) : '—'}
          </div>
          <div className="t">Próximo seguimiento</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', alignItems: 'start' }}>
        {/* CRM */}
        <section className="tarjeta">
          <div className="tarjeta-cab"><h2>Seguimiento comercial</h2></div>
          {alumno.etapa !== 'matriculado' && puede('alumno.editar') && (
            <div className="fila" style={{ marginBottom: 12 }}>
              <span className="suave chico">Etapa:</span>
              {(['nuevo', 'contactado', 'interesado'] as const).map((e) => (
                <button key={e} className={`btn ${alumno.etapa === e ? '' : 'sec'}`} disabled={etapa.isPending} onClick={() => etapa.mutate({ etapa: e })}>{ETAPAS[e]}</button>
              ))}
              {alumno.etapa !== 'perdido' && <button className="btn peligro" onClick={() => setPerder(true)}>Perdido</button>}
            </div>
          )}
          {alumno.etapa === 'perdido' && <div className="aviso alerta chico" style={{ marginBottom: 10 }}>Perdido: {alumno.motivoPerdida}</div>}
          {etapa.error ? <ErrorCaja error={etapa.error} /> : null}
          <NuevaActividad alumnoId={alumno.id} onGuardado={refrescar} />
          <div className="timeline" style={{ marginTop: 12 }}>
            {eventos.map((ev) =>
              ev.tipo === 'act' ? (
                <div key={ev.a.id} className={`tl-item ${ev.a.venceEn && !ev.a.completadoEn ? 'tarea-pend' : ''}`}>
                  <span className="tl-icono"><Icono n={ICONO_TIPO[ev.a.tipo]} t={14} /></span>
                  <div>
                    <div className="tl-texto">{ev.a.texto}</div>
                    <div className="tl-meta">
                      {TIPOS_SEGUIMIENTO[ev.a.tipo]} · {ev.a.usuario} · {fechaHora(ev.a.fecha)}
                      {ev.a.venceEn && ` · para ${fechaHora(ev.a.venceEn)}`}
                      {ev.a.completadoEn && ' · hecha'}
                    </div>
                  </div>
                  {ev.a.venceEn && !ev.a.completadoEn && (
                    <button className="btn sec icono" title="Marcar como hecha" aria-label="Marcar como hecha" onClick={() => completar.mutate(ev.a.id)}><Icono n="check" t={14} /></button>
                  )}
                </div>
              ) : (
                <div key={ev.e.id} className="tl-item">
                  <span className="tl-icono"><Icono n="prospectos" t={14} /></span>
                  <div>
                    <div className="tl-texto">Pasó a <strong>{ETAPAS[ev.e.a]}</strong>{ev.e.de ? ` desde ${ETAPAS[ev.e.de]}` : ''}</div>
                    <div className="tl-meta">{ev.e.usuario ?? 'Sistema'} · {fechaHora(ev.e.fecha)}</div>
                  </div>
                </div>
              ),
            )}
            {eventos.length === 0 && <div className="suave chico">Sin actividad todavía.</div>}
          </div>
        </section>

        {/* Operación */}
        <section className="tarjeta">
          <div className="pestanas" role="tablist">
            {([['paquetes', `Paquetes (${paquetes.length})`], ['ventas', `Ventas (${ventas.length})`], ['clases', `Clases (${clases.length})`]] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={pestana === k} className={`pestana ${pestana === k ? 'activa' : ''}`} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </div>
          {pestana === 'paquetes' && (
            <div className="lista-simple">
              {paquetes.map((p) => (
                <div key={p.id} style={p.estado === 'anulado' ? { opacity: 0.5 } : undefined}>
                  <div style={{ flex: 1 }}>
                    <strong>{p.nombre}</strong> {p.recargas > 0 && <span className="chip"><Icono n="recargar" t={12} /> {p.recargas} recarga{p.recargas > 1 ? 's' : ''}</span>} {p.estado === 'anulado' && <span className="chip error">Anulado</span>}
                    <div className="suave chico">{p.horasDictadas} h dictadas · {p.horasAgendadas - p.horasDictadas} h agendadas · {p.horasDisponibles} h por agendar · total {p.horasCompradas} h</div>
                    <div className="progreso" style={{ marginTop: 6 }} title={`${p.horasDictadas} dictadas de ${p.horasCompradas}`}>
                      <div className="dict" style={{ width: `${(100 * p.horasDictadas) / Math.max(1, p.horasCompradas)}%` }} />
                      <div className="agen" style={{ width: `${(100 * (p.horasAgendadas - p.horasDictadas)) / Math.max(1, p.horasCompradas)}%` }} />
                    </div>
                  </div>
                  {p.estado === 'activo' && p.horasDisponibles > 0 && puede('clase.agendar') && (
                    <button className="btn sec" onClick={() => nav(`/calendario?paquete=${p.id}`)}><Icono n="calendario" t={16} /> Agendar</button>
                  )}
                </div>
              ))}
              {paquetes.length === 0 && <div className="suave">Aún no tiene paquetes.</div>}
            </div>
          )}
          {pestana === 'ventas' && (
            <div className="lista-simple">
              {ventas.map((v) => (
                <div key={v.id} style={{ alignItems: 'flex-start', ...(v.estado === 'anulada' ? { opacity: 0.5 } : {}) }}>
                  <div style={{ flex: 1 }}>
                    <strong>{fechaCorta(v.fecha)}</strong> <span className="suave chico">· {v.vendedor}</span> {v.estado === 'anulada' && <span className="chip error">Anulada</span>}
                    {v.items.map((i, k) => (
                      <div key={k} className="chico">
                        {i.descripcion} — {S(i.precio_cobrado)}{' '}
                        {i.tipo_precio !== 'regular' && <span className="chip">{TIPO_PRECIO[i.tipo_precio as keyof typeof TIPO_PRECIO]}</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{S(v.total)}</strong>
                    {v.metodo && <div className="suave chico">Pagado · {v.metodo.split(', ').map((m) => METODOS.find((x) => x.id === m)?.t ?? m).join(', ')}</div>}
                  </div>
                </div>
              ))}
              {ventas.length === 0 && <div className="suave">Sin compras.</div>}
            </div>
          )}
          {pestana === 'clases' && (
            <>
              <table className="tabla">
                <thead><tr><th>Fecha y hora</th><th>Carro</th><th>Instructor</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {clases.map((c) => (
                    <tr
                      key={c.id}
                      style={{ cursor: c.estado === 'cancelada' ? 'default' : 'pointer', ...(c.estado === 'cancelada' ? { opacity: 0.55 } : {}) }}
                      onClick={() => c.estado !== 'cancelada' && setClaseSel({ clase: c, mover: false })}
                      title={c.estado === 'cancelada' ? undefined : 'Abrir para editar'}
                    >
                      <td>{fechaHora(c.inicio)}</td>
                      <td>{c.placa}</td>
                      <td>{c.instructor ?? <span className="chip">Sin asignar</span>}</td>
                      <td><span className={`chip ${c.estado === 'realizada' ? 'ok' : c.estado === 'cancelada' ? 'error' : c.estado === 'no_asistio' ? 'gris' : ''}`}>{ESTADO_CLASE[c.estado]}</span></td>
                      <td className="num">
                        {c.estado === 'programada' && puede('clase.agendar') && (
                          <button
                            className="btn sec"
                            style={{ padding: '4px 10px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setClaseSel({ clase: c, mover: true });
                            }}
                          >
                            <Icono n="calendario" t={14} /> Reprogramar
                          </button>
                        )}
                        {c.estado !== 'programada' && c.estado !== 'cancelada' && <span className="suave chico">Editar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clases.length === 0 && <div className="suave">Sin clases.</div>}
              {clases.length > 0 && <div className="suave chico" style={{ marginTop: 8 }}>Haz clic en una clase para asignar instructor, marcarla, deshacer una marca o cancelarla.</div>}
            </>
          )}
        </section>
      </div>

      {claseSel && <ClaseModal clase={claseSel.clase} reprogramarDeInicio={claseSel.mover} onCerrar={() => setClaseSel(null)} />}
      {editar && <EditarAlumno alumno={alumno} onCerrar={() => setEditar(false)} />}
      {perder && (
        <MotivoPerdida
          onCerrar={() => setPerder(false)}
          onConfirmar={(motivo) => {
            setPerder(false);
            etapa.mutate({ etapa: 'perdido', motivo });
          }}
        />
      )}
    </>
  );
}

function NuevaActividad({ alumnoId, onGuardado }: { alumnoId: string; onGuardado: () => void }) {
  const [tipo, setTipo] = useState<Seguimiento['tipo']>('whatsapp');
  const [texto, setTexto] = useState('');
  const [conFecha, setConFecha] = useState(false);
  const [fecha, setFecha] = useState(sumarDias(hoyLima(), 1));
  const [hora, setHora] = useState(10);
  const guardar = useMutation({
    mutationFn: () =>
      api.post(`/alumnos/${alumnoId}/seguimientos`, {
        tipo: conFecha ? 'tarea' : tipo,
        texto,
        fecha: conFecha ? fecha : null,
        hora: conFecha ? hora : null,
      }),
    onSuccess: () => {
      setTexto('');
      setConFecha(false);
      onGuardado();
    },
  });
  const atajos = [
    { t: 'Mañana', d: 1 },
    { t: 'En 3 días', d: 3 },
    { t: 'En 1 semana', d: 7 },
  ];
  return (
    <div className="carrito-item" style={{ background: 'var(--fondo-2)' }}>
      <div className="fila" style={{ marginBottom: 8 }}>
        {(['whatsapp', 'llamada', 'visita', 'nota'] as const).map((t) => (
          <button key={t} className={`elegible ${!conFecha && tipo === t ? 'sel' : ''}`} style={{ padding: '5px 10px', fontSize: '0.85rem' }} onClick={() => { setTipo(t); setConFecha(false); }}>
            {TIPOS_SEGUIMIENTO[t]}
          </button>
        ))}
        <button className={`elegible ${conFecha ? 'sel' : ''}`} style={{ padding: '5px 10px', fontSize: '0.85rem' }} onClick={() => setConFecha(true)}>
          <Icono n="reloj" t={13} /> Programar próximo paso
        </button>
      </div>
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={conFecha ? '¿Qué hay que hacer? Ej.: llamar para confirmar horario' : '¿Qué pasó? Ej.: le envié precios por WhatsApp'}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim() && guardar.mutate()}
      />
      {conFecha && (
        <div className="fila" style={{ marginTop: 8 }}>
          {atajos.map((a) => (
            <button key={a.t} className={`btn sec ${fecha === sumarDias(hoyLima(), a.d) ? 'activo' : ''}`} style={{ padding: '5px 10px' }} onClick={() => setFecha(sumarDias(hoyLima(), a.d))}>{a.t}</button>
          ))}
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 'auto' }} aria-label="Fecha" />
          <select value={hora} onChange={(e) => setHora(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Hora">
            {Array.from({ length: 14 }, (_, i) => 8 + i).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
      )}
      <div className="fila fila-fin" style={{ marginTop: 8 }}>
        <ErrorCaja error={guardar.error} />
        <button className="btn" disabled={!texto.trim() || guardar.isPending} onClick={() => guardar.mutate()}>
          {conFecha ? 'Programar' : 'Registrar'}
        </button>
      </div>
    </div>
  );
}

function MotivoPerdida({ onCerrar, onConfirmar }: { onCerrar: () => void; onConfirmar: (m: string) => void }) {
  const [m, setM] = useState('');
  return (
    <Modal titulo="¿Por qué se perdió?" onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" disabled={!m.trim()} onClick={() => onConfirmar(m)}>Marcar perdido</button></>}>
      <div className="fila">
        {['Precio', 'Eligió otra escuela', 'No respondió', 'Horarios no le acomodan', 'Ya no necesita'].map((x) => (
          <button key={x} className={`elegible ${m === x ? 'sel' : ''}`} onClick={() => setM(x)}>{x}</button>
        ))}
      </div>
      <Campo etiqueta="Otro motivo"><input value={m} onChange={(e) => setM(e.target.value)} /></Campo>
    </Modal>
  );
}

function EditarAlumno({ alumno, onCerrar }: { alumno: Alumno; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombres: alumno.nombres,
    apellidos: alumno.apellidos,
    dni: alumno.dni ?? '',
    telefono: alumno.telefono ?? '',
    email: alumno.email ?? '',
    origen: alumno.origen,
    notas: alumno.notas ?? '',
  });
  const guardar = useMutation({
    mutationFn: () => api.put(`/alumnos/${alumno.id}`, f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alumno'] });
      qc.invalidateQueries({ queryKey: ['alumnos'] });
      onCerrar();
    },
  });
  return (
    <Modal titulo="Editar datos" onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}>
      <div className="grid g2">
        <Campo etiqueta="Nombres"><input value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
        <Campo etiqueta="Apellidos"><input value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
        <Campo etiqueta="DNI"><input value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Campo>
        <Campo etiqueta="Teléfono"><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="Correo"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo etiqueta="Origen">
          <select value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
            {Object.entries(ORIGENES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Notas"><textarea rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

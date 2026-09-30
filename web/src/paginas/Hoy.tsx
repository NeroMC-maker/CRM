import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Icono } from '../iconos';
import { usePuede, useYo } from '../sesion';
import { useAviso } from '../ui';
import { ESTADO_CLASE, ETAPAS, fechaCorta, fechaLarga, hhmm, horaLima, relativo, S, TIPOS_SEGUIMIENTO, urgencia, waLink } from '../util';

interface Panel {
  fecha: string;
  clasesHoy: { id: string; inicio: string; fin: string; estado: keyof typeof ESTADO_CLASE; placa: string; instructor: string | null; centro: string; alumno_id: string; alumno: string; telefono: string | null }[];
  sinInstructor7d: number;
  porAgendar: { paquete_id: string; alumno_id: string; alumno: string; telefono: string | null; horas: number }[];
  documentos: { placa: string; soat_vence: string | null; revision_vence: string | null }[];
  embudo: { etapa: keyof typeof ETAPAS; n: number }[];
  ventasHoy: { ventas: number; monto: number };
  tareas: { id: string; texto: string; tipo: keyof typeof TIPOS_SEGUIMIENTO; venceEn: string; alumnoId: string; alumno: string; telefono: string | null }[];
}

function saludo() {
  const h = horaLima(new Date());
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function Hoy() {
  const yo = useYo();
  const puede = usePuede();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['hoy'], queryFn: () => api.get<Panel>('/hoy'), refetchInterval: 30_000 });
  const completar = useMutation({
    mutationFn: (id: string) => api.patch(`/seguimientos/${id}/completar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hoy'] });
      avisar('Tarea hecha');
    },
  });
  const d = q.data;
  const abiertos = d?.embudo.reduce((s, r) => s + r.n, 0) ?? 0;

  return (
    <>
      <div className="cabecera">
        <div>
          <h1 className="saludo">{saludo()}, {yo.nombre.split(' ')[0]}</h1>
          <p>{d ? fechaLarga(d.fecha).replace(/^./, (c) => c.toUpperCase()) : ''}</p>
        </div>
        <div className="fila">
          {puede('alumno.editar') && <button className="btn sec" onClick={() => nav('/prospectos?nuevo=1')}><Icono n="mas" t={16} /> Prospecto</button>}
          {puede('venta.crear') && <button className="btn" onClick={() => nav('/venta')}><Icono n="venta" t={16} /> Nueva venta</button>}
        </div>
      </div>
      {!d ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <Link to="/calendario" className="tarjeta kpi" style={{ textDecoration: 'none' }}>
              <div className="v">{d.clasesHoy.length}</div><div className="t">Clases hoy</div>
            </Link>
            {puede('venta.crear') && (
              <Link to="/analisis" className="tarjeta kpi" style={{ textDecoration: 'none' }}>
                <div className="v">{S(d.ventasHoy.monto)}</div><div className="t">{d.ventasHoy.ventas} ventas hoy</div>
              </Link>
            )}
            {puede('alumno.editar') && (
              <Link to="/prospectos" className="tarjeta kpi" style={{ textDecoration: 'none' }}>
                <div className="v">{abiertos}</div><div className="t">Prospectos abiertos</div>
              </Link>
            )}
            {puede('clase.agendar') && (
              <Link to="/por-asignar" className="tarjeta kpi" style={{ textDecoration: 'none' }}>
                <div className="v">{d.sinInstructor7d}</div><div className="t">Clases sin instructor (7 días)</div>
              </Link>
            )}
          </div>

          <div className="grid g2">
            {puede('alumno.editar') && (
              <section className="tarjeta">
                <div className="tarjeta-cab">
                  <Icono n="reloj" />
                  <h2>Seguimientos para hoy</h2>
                  <span className={`cuenta ${d.tareas.some((t) => urgencia(t.venceEn) === 'vencido') ? 'rojo' : ''}`}>{d.tareas.length}</span>
                </div>
                {d.tareas.length === 0 ? (
                  <div className="suave">Nada pendiente. Buen momento para contactar prospectos nuevos.</div>
                ) : (
                  <div className="lista-simple">
                    {d.tareas.map((t) => {
                      const wa = waLink(t.telefono);
                      const u = urgencia(t.venceEn);
                      return (
                        <div key={t.id}>
                          <button className="btn sec icono" title="Marcar como hecha" aria-label="Marcar como hecha" onClick={() => completar.mutate(t.id)}>
                            <Icono n="check" t={16} />
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Link to={`/alumnos/${t.alumnoId}`}><strong>{t.alumno}</strong></Link>
                            <div className="suave chico">{t.texto}</div>
                          </div>
                          <span className={`chip ${u === 'vencido' ? 'error' : 'alerta'}`}>{u === 'vencido' ? `Vencida ${relativo(t.venceEn)}` : `Hoy ${hhmm(horaLima(new Date(t.venceEn)))}`}</span>
                          {wa && <a className="btn fantasma icono" href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"><Icono n="mensaje" t={16} /></a>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <section className="tarjeta">
              <div className="tarjeta-cab">
                <Icono n="calendario" />
                <h2>Clases de hoy</h2>
                <Link to="/calendario" className="chico">Ver calendario</Link>
              </div>
              {d.clasesHoy.length === 0 ? (
                <div className="suave">No hay clases hoy.</div>
              ) : (
                <div className="lista-simple">
                  {d.clasesHoy.map((c) => (
                    <div key={c.id}>
                      <span className="hora-chip">{hhmm(horaLima(new Date(c.inicio)))}–{hhmm(horaLima(new Date(c.fin)))}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{c.alumno}</strong>
                        <div className="suave chico">{c.placa} · {c.centro} · {c.instructor ?? <span style={{ color: 'var(--alerta)' }}>sin instructor</span>}</div>
                      </div>
                      <span className={`chip ${c.estado === 'realizada' ? 'ok' : c.estado === 'no_asistio' ? 'gris' : ''}`}>{ESTADO_CLASE[c.estado]}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {d.porAgendar.length > 0 && (
              <section className="tarjeta">
                <div className="tarjeta-cab">
                  <Icono n="calendario" />
                  <h2>Horas compradas sin agendar</h2>
                </div>
                <div className="lista-simple">
                  {d.porAgendar.map((p) => {
                    const wa = waLink(p.telefono);
                    return (
                      <div key={p.paquete_id}>
                        <div style={{ flex: 1 }}><Link to={`/alumnos/${p.alumno_id}`}><strong>{p.alumno}</strong></Link></div>
                        <span className="chip">{p.horas} h</span>
                        {wa && <a className="btn fantasma icono" href={wa} target="_blank" rel="noreferrer" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"><Icono n="mensaje" t={16} /></a>}
                        <button className="btn sec" style={{ padding: '4px 10px' }} onClick={() => nav(`/calendario?paquete=${p.paquete_id}`)}>Agendar</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {d.documentos.length > 0 && (
              <section className="tarjeta">
                <div className="tarjeta-cab">
                  <Icono n="alerta" />
                  <h2>Documentos de carros</h2>
                  <Link to="/flota" className="chico">Ir a flota</Link>
                </div>
                <div className="lista-simple">
                  {d.documentos.map((v) => (
                    <div key={v.placa}>
                      <strong style={{ flex: 1 }}>{v.placa}</strong>
                      <span className="suave chico">SOAT {fechaCorta(v.soat_vence)} · Revisión {fechaCorta(v.revision_vence)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}

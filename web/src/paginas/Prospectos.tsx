import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Etapa } from '../api';
import { RAMPA_ORDINAL } from '../graficos';
import { Icono } from '../iconos';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';
import { ETAPAS, hhmm, horaLima, ORIGENES, relativo, urgencia, waLink } from '../util';
import { NuevoAlumno } from './VentaRapida';

interface Tarjeta {
  id: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  origen: keyof typeof ORIGENES;
  etapa: Etapa;
  proximo_seguimiento: string | null;
  motivo_perdida: string | null;
  creado_en: string;
  vendedor: string | null;
  ultima_actividad: string | null;
}

const COLUMNAS: { etapa: Etapa; color: string; ayuda: string }[] = [
  { etapa: 'nuevo', color: '#cbd5e1', ayuda: 'Aún no se le contacta' },
  { etapa: 'contactado', color: RAMPA_ORDINAL[0], ayuda: 'Ya recibió información' },
  { etapa: 'interesado', color: RAMPA_ORDINAL[2], ayuda: 'Pidió precios u horarios' },
  { etapa: 'matriculado', color: RAMPA_ORDINAL[4], ayuda: 'Compró (se mueve al vender)' },
  { etapa: 'perdido', color: '#94a3b8', ayuda: 'No se matriculó' },
];

export function Prospectos() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const avisar = useAviso();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [mios, setMios] = useState(false);
  const [arrastrando, setArrastrando] = useState<Tarjeta | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [perder, setPerder] = useState<Tarjeta | null>(null);
  const [nuevo, setNuevo] = useState(params.get('nuevo') === '1');
  useEffect(() => {
    if (params.get('nuevo')) {
      params.delete('nuevo');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const tablero = useQuery({
    queryKey: ['crm', 'tablero', q, mios],
    queryFn: () => api.get<Tarjeta[]>(`/crm/tablero?q=${encodeURIComponent(q)}${mios ? '&mios=1' : ''}`),
    refetchInterval: 20_000,
  });
  const mover = useMutation({
    mutationFn: (v: { id: string; etapa: Etapa; motivo?: string }) => api.patch(`/alumnos/${v.id}/etapa`, { etapa: v.etapa, motivo: v.motivo }),
    onMutate: async (v) => {
      // Actualización optimista: la tarjeta cambia de columna al instante.
      await qc.cancelQueries({ queryKey: ['crm', 'tablero'] });
      const clave = ['crm', 'tablero', q, mios];
      const antes = qc.getQueryData<Tarjeta[]>(clave);
      qc.setQueryData<Tarjeta[]>(clave, (l) => l?.map((t) => (t.id === v.id ? { ...t, etapa: v.etapa } : t)));
      return { antes, clave };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.clave, ctx.antes);
      avisar(e instanceof Error ? e.message : 'No se pudo mover', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  });

  const soltar = (etapa: Etapa) => {
    const t = arrastrando;
    setArrastrando(null);
    setSobre(null);
    if (!t || t.etapa === etapa) return;
    if (etapa === 'matriculado') {
      avisar('Para matricular registra la venta: te llevo a Venta rápida.');
      nav('/venta');
      return;
    }
    if (etapa === 'perdido') return setPerder(t);
    mover.mutate({ id: t.id, etapa });
  };

  const lista = tablero.data ?? [];
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Prospectos</h1>
          <p>Arrastra cada tarjeta a la etapa que corresponde. Todo prospecto abierto debería tener un próximo paso con fecha.</p>
        </div>
        <div className="fila">
          <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} aria-label="Buscar prospecto" />
          <label className="fila chico"><input type="checkbox" checked={mios} onChange={(e) => setMios(e.target.checked)} /> Solo míos</label>
          <button className="btn" onClick={() => setNuevo(true)}><Icono n="mas" t={16} /> Prospecto</button>
        </div>
      </div>

      <div className="kanban">
        {COLUMNAS.map((col) => {
          const tarjetas = lista.filter((t) => t.etapa === col.etapa);
          return (
            <section
              key={col.etapa}
              className={`kanban-col ${sobre === col.etapa ? 'sobre' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.etapa);
              }}
              onDragLeave={() => setSobre((s) => (s === col.etapa ? null : s))}
              onDrop={() => soltar(col.etapa)}
              aria-label={ETAPAS[col.etapa]}
            >
              <div className="kanban-cab" title={col.ayuda}>
                <span className="punto" style={{ background: col.color }} />
                {ETAPAS[col.etapa]}
                <span className="espacio" />
                <span className="cuenta">{tarjetas.length}</span>
              </div>
              <div className="kanban-cuerpo">
                {tarjetas.map((t) => {
                  const u = urgencia(t.proximo_seguimiento);
                  const abierto = ['nuevo', 'contactado', 'interesado'].includes(t.etapa);
                  const wa = waLink(t.telefono);
                  return (
                    <div
                      key={t.id}
                      className={`tarjeta-p ${arrastrando?.id === t.id ? 'arrastrando' : ''}`}
                      draggable
                      onDragStart={() => setArrastrando(t)}
                      onDragEnd={() => setArrastrando(null)}
                      onClick={() => nav(`/alumnos/${t.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && nav(`/alumnos/${t.id}`)}
                    >
                      <div className="nombre">{t.nombres} {t.apellidos}</div>
                      <div className="meta">{ORIGENES[t.origen]} · {t.vendedor ?? 'sin vendedor'} · llegó {relativo(t.creado_en)}</div>
                      {t.ultima_actividad && <div className="meta" style={{ color: 'var(--texto)' }}>“{t.ultima_actividad.slice(0, 60)}”</div>}
                      {t.etapa === 'perdido' && t.motivo_perdida && <div className="meta">Motivo: {t.motivo_perdida}</div>}
                      <div className="pie">
                        {abierto &&
                          (t.proximo_seguimiento ? (
                            <span className={`chip ${u === 'vencido' ? 'error' : u === 'hoy' ? 'alerta' : ''}`}>
                              <Icono n="reloj" t={12} />
                              {u === 'hoy' ? `Hoy ${hhmm(horaLima(new Date(t.proximo_seguimiento)))}` : relativo(t.proximo_seguimiento)}
                            </span>
                          ) : (
                            <span className="chip alerta">Sin próximo paso</span>
                          ))}
                        <span className="espacio" />
                        {(t.etapa === 'nuevo' || t.etapa === 'contactado') && (
                          <button
                            className="btn fantasma chico"
                            style={{ padding: '3px 6px' }}
                            title="Pasar a la siguiente etapa (sin arrastrar)"
                            onClick={(e) => {
                              e.stopPropagation();
                              mover.mutate({ id: t.id, etapa: t.etapa === 'nuevo' ? 'contactado' : 'interesado' });
                            }}
                          >
                            → {t.etapa === 'nuevo' ? 'Contactado' : 'Interesado'}
                          </button>
                        )}
                        {t.etapa === 'interesado' && (
                          <button
                            className="btn fantasma chico"
                            style={{ padding: '3px 6px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              nav('/venta');
                            }}
                          >
                            → Vender
                          </button>
                        )}
                        {wa && (
                          <a className="btn fantasma icono" href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="WhatsApp" aria-label="Abrir WhatsApp">
                            <Icono n="mensaje" t={15} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                {tarjetas.length === 0 && <div className="suave chico" style={{ padding: 8 }}>{col.ayuda}</div>}
              </div>
            </section>
          );
        })}
      </div>

      {perder && <PerdidoModal tarjeta={perder} onCerrar={() => setPerder(null)} onConfirmar={(motivo) => { mover.mutate({ id: perder.id, etapa: 'perdido', motivo }); setPerder(null); }} />}
      {nuevo && (
        <NuevoAlumno
          titulo="Prospecto nuevo"
          onCerrar={() => setNuevo(false)}
          onCreado={(a) => {
            setNuevo(false);
            qc.invalidateQueries({ queryKey: ['crm'] });
            avisar(`${a.nombres} agregado a Nuevos`);
          }}
        />
      )}
    </>
  );
}

const MOTIVOS = ['Precio', 'Eligió otra escuela', 'No respondió', 'Horarios no le acomodan', 'Ya no necesita'];

function PerdidoModal(props: { tarjeta: Tarjeta; onCerrar: () => void; onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      titulo={`¿Por qué se perdió ${props.tarjeta.nombres}?`}
      onCerrar={props.onCerrar}
      pie={
        <>
          <button className="btn sec" onClick={props.onCerrar}>Cancelar</button>
          <button className="btn" onClick={() => (motivo.trim() ? props.onConfirmar(motivo) : setError('Elige o escribe un motivo.'))}>Marcar perdido</button>
        </>
      }
    >
      <div className="fila">
        {MOTIVOS.map((m) => (
          <button key={m} className={`elegible ${motivo === m ? 'sel' : ''}`} onClick={() => setMotivo(m)}>{m}</button>
        ))}
      </div>
      <Campo etiqueta="Otro motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      {error && <ErrorCaja error={new Error(error)} />}
      <span className="suave chico">Sirve para el análisis de “¿Por qué se pierden?”.</span>
    </Modal>
  );
}

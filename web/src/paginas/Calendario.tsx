import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Alumno, type Bloqueo, type Clase, type Horario, type Instructor, type PaquetePorAgendar, type PuntoRecojo, type TipoClase, type Turno, type Vehiculo } from '../api';
import { ClaseModal } from '../ClaseModal';
import { Icono } from '../iconos';
import { useCentros, usePuede } from '../sesion';
import { Campo, ErrorCaja, escribiendo, Modal, useAviso } from '../ui';
import { fechaLarga, fechaLima, hhmm, horaLima, hoyLima, lunesDe, sumarDias, TRANSMISION } from '../util';

type Vista = 'dia' | 'semana' | 'mes';
type Zoom = 'compacto' | 'normal' | 'grande';
type Hueco = { fecha: string; hora: number; vehiculoId: string };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (f: string) => `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
const ZOOM = {
  // col = ancho mínimo de cada carro en la semana (7 días × 4 carros); dia = en la vista de un día.
  compacto: { fila: 22, col: 46, dia: 150 },
  normal: { fila: 30, col: 54, dia: 200 },
  grande: { fila: 40, col: 84, dia: 260 },
} as const;

function mover(f: string, vista: Vista, dir: 1 | -1): string {
  if (vista === 'dia') return sumarDias(f, dir);
  if (vista === 'semana') return sumarDias(f, 7 * dir);
  let [y, m] = [Number(f.slice(0, 4)), Number(f.slice(5, 7)) + dir];
  if (m === 0) [y, m] = [y - 1, 12];
  if (m === 13) [y, m] = [y + 1, 1];
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
const nombreCarro = (v: Pick<Vehiculo, 'nombre' | 'placa'>) => v.nombre ?? v.placa;
const durH = (x: { inicio: string; fin: string }) => (new Date(x.fin).getTime() - new Date(x.inicio).getTime()) / 3_600_000;
const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guardar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
};

export function Calendario() {
  const puede = usePuede();
  const centros = useCentros();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const agenda = puede('clase.agendar');

  const [fecha, setFecha] = useState(hoyLima());
  const [vista, setVista] = useState<Vista>(() => (leer('tl-vista') as Vista) || 'dia');
  const [zoom, setZoom] = useState<Zoom>(() => (leer('tl-zoom') as Zoom) || 'grande');
  useEffect(() => guardar('tl-vista', vista), [vista]);
  useEffect(() => guardar('tl-zoom', zoom), [zoom]);
  const desde = vista === 'dia' ? fecha : vista === 'semana' ? lunesDe(fecha) : lunesDe(`${fecha.slice(0, 8)}01`);
  const hasta = vista === 'dia' ? fecha : vista === 'semana' ? sumarDias(desde, 6) : sumarDias(desde, 41);

  // Horario único de todos los carros (se comparten entre sedes).
  const apertura = centros.length ? Math.min(...centros.map((c) => c.horaApertura)) : 7;
  const cierre = centros.length ? Math.max(...centros.map((c) => c.horaCierre)) : 22;
  const vehiculosQ = useQuery({ queryKey: ['vehiculos'], queryFn: () => api.get<Vehiculo[]>('/vehiculos'), enabled: puede('clase.ver_todas') });
  const carros = (vehiculosQ.data ?? []).filter((v) => v.estado !== 'baja');
  const [carroId, setCarroId] = useState('');
  const carrosVista = carroId ? carros.filter((v) => v.id === carroId) : carros;

  const horarioQ = useQuery({
    queryKey: ['horario', desde, hasta],
    queryFn: () => api.get<Horario>(`/horario?desde=${desde}&hasta=${hasta}`),
  });
  const horario = horarioQ.data ?? { clases: [], bloqueos: [], turnos: [] };

  // Tiempo real: cada 5 s se consulta una huella del horario; si cambió, se recarga.
  const version = useQuery({
    queryKey: ['clases-version'],
    queryFn: () => api.get<{ version: string }>('/clases/version'),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const ultimaVersion = useRef<string | null>(null);
  useEffect(() => {
    const v = version.data?.version;
    if (v && ultimaVersion.current && v !== ultimaVersion.current) {
      ['horario', 'clases', 'por-asignar', 'paquetes'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
    if (v) ultimaVersion.current = v;
  }, [version.data, qc]);

  // Modo "agendar paquete" (viene de la venta rápida, de Hoy o de la ficha del alumno)
  const paqueteParam = params.get('paquete');
  const paqueteQ = useQuery({
    queryKey: ['paquetes', 'por-agendar', paqueteParam],
    queryFn: () => api.get<PaquetePorAgendar[]>(`/paquetes/por-agendar?paqueteId=${paqueteParam}`),
    enabled: !!paqueteParam && agenda,
  });
  const paqueteActivo = paqueteParam ? (paqueteQ.data?.[0] ?? null) : null;
  const terminarModo = () => {
    params.delete('paquete');
    setParams(params, { replace: true });
  };

  const [hueco, setHueco] = useState<Hueco | null>(null);
  const [claseSel, setClaseSel] = useState<Clase | null>(null);
  const [bloqueoSel, setBloqueoSel] = useState<Bloqueo | null>(null);
  const [turnoSel, setTurnoSel] = useState<{ fecha: string; vehiculo: Vehiculo } | null>(null);
  const hayModal = !!(hueco || claseSel || bloqueoSel || turnoSel);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (escribiendo() || hayModal || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') setFecha((f) => mover(f, vista, -1));
      if (e.key === 'ArrowRight') setFecha((f) => mover(f, vista, 1));
      const k = e.key.toLowerCase();
      if (k === 't') setFecha(hoyLima());
      if (k === 'd') setVista('dia');
      if (k === 's') setVista('semana');
      if (k === 'm') setVista('mes');
      if (k === '+') setZoom((z) => (z === 'compacto' ? 'normal' : 'grande'));
      if (k === '-') setZoom((z) => (z === 'grande' ? 'normal' : 'compacto'));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [vista, hayModal]);

  const clasesVista = horario.clases.filter((c) => !carroId || c.vehiculoId === carroId);
  const dias = vista === 'dia' ? [fecha] : Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));

  return (
    <>
      <div className="cabecera no-imprimir">
        <div>
          <h1>Horario de clases</h1>
          <p>
            Tramos de 30 min · clic en un espacio libre para reservar · <kbd>←</kbd> <kbd>→</kbd> cambiar · <kbd>T</kbd> hoy · <kbd>D</kbd> <kbd>S</kbd> <kbd>M</kbd> vista · <kbd>+</kbd> <kbd>−</kbd> tamaño
          </p>
        </div>
        <span className="vivo" title="Los cambios de otros usuarios aparecen solos">En vivo</span>
      </div>

      {paqueteActivo && (
        <div className="aviso info fila no-imprimir" style={{ marginBottom: 12 }}>
          <span>
            Agendando para <strong>{paqueteActivo.alumno}</strong> · {paqueteActivo.producto} · quedan <strong>{paqueteActivo.horas_disponibles} h</strong>. Haz clic en un espacio libre.
          </span>
          <span className="espacio" />
          <button className="btn sec" onClick={terminarModo}>Terminar</button>
        </div>
      )}
      {paqueteParam && paqueteQ.isSuccess && !paqueteActivo && (
        <div className="aviso ok fila no-imprimir" style={{ marginBottom: 12 }}>
          <span>Todas las horas del paquete ya están agendadas.</span>
          <span className="espacio" />
          <button className="btn sec" onClick={terminarModo}>Cerrar</button>
        </div>
      )}

      <div className="cal-barra no-imprimir">
        <button className="btn sec" onClick={() => setFecha((f) => mover(f, vista, -1))} aria-label="Anterior">←</button>
        <button className="btn sec" onClick={() => setFecha(hoyLima())}>Hoy</button>
        <button className="btn sec" onClick={() => setFecha((f) => mover(f, vista, 1))} aria-label="Siguiente">→</button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} style={{ width: 'auto' }} aria-label="Fecha" />
        <span className="fecha-grande">
          {vista === 'dia' ? fechaLarga(fecha).replace(/^./, (c) => c.toUpperCase()) : vista === 'semana' ? `Semana del ${fechaLarga(desde)}` : nombreMes(fecha)}
        </span>
        <span className="espacio" />
        <div className="fila" role="tablist" aria-label="Vista">
          {(['dia', 'semana', 'mes'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={vista === v} className={`btn ${vista === v ? '' : 'sec'}`} onClick={() => setVista(v)}>
              {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
        {vista !== 'mes' && (
          <div className="fila" role="radiogroup" aria-label="Tamaño">
            {(['compacto', 'normal', 'grande'] as const).map((z) => (
              <button key={z} role="radio" aria-checked={zoom === z} className={`btn ${zoom === z ? '' : 'sec'}`} onClick={() => setZoom(z)} title={`Tamaño ${z}`}>
                {z === 'compacto' ? 'A' : z === 'normal' ? <span style={{ fontSize: '1.1em' }}>A</span> : <span style={{ fontSize: '1.3em' }}>A</span>}
              </button>
            ))}
          </div>
        )}
        <button className="btn sec" onClick={() => window.print()}><Icono n="imprimir" t={16} /> Imprimir / PDF</button>
      </div>

      {carros.length > 1 && (
        <div className="fila filtro-carros no-imprimir" role="radiogroup" aria-label="Filtrar por carro">
          <span className="suave chico">Carros:</span>
          <button role="radio" aria-checked={!carroId} className={`elegible ${!carroId ? 'sel' : ''}`} onClick={() => setCarroId('')}>
            Todos ({carros.length})
          </button>
          {carros.map((v) => (
            <button key={v.id} role="radio" aria-checked={carroId === v.id} className={`elegible chip-carro ${carroId === v.id ? 'sel' : ''}`} onClick={() => setCarroId(v.id)}>
              <i style={{ background: v.colorHorario }} />
              <strong>{nombreCarro(v)}</strong>
              {v.estado === 'mantenimiento' && <span className="chip alerta">Mant.</span>}
            </button>
          ))}
        </div>
      )}

      <div className="imprimir-titulo">
        <strong>Tulicencia.com.pe · Horario de clases</strong> — {vista === 'dia' ? fechaLarga(fecha) : `semana del ${fechaLarga(desde)}`}
      </div>

      {!horarioQ.data && !vehiculosQ.data ? (
        <div className="vacio">Cargando…</div>
      ) : vista === 'mes' ? (
        <VistaMes
          fecha={fecha}
          desde={desde}
          clases={clasesVista}
          capacidad={Math.max(1, carrosVista.filter((v) => v.estado === 'activo').length) * (cierre - apertura)}
          onDia={(f) => {
            setFecha(f);
            setVista('dia');
          }}
        />
      ) : (
        <RejillaHorario
          dias={dias}
          carros={carrosVista}
          horario={{ ...horario, clases: clasesVista }}
          apertura={apertura}
          cierre={cierre}
          zoom={zoom}
          puedeReservar={agenda}
          onHueco={setHueco}
          onClase={setClaseSel}
          onBloqueo={setBloqueoSel}
          onTurno={(f, v) => agenda && setTurnoSel({ fecha: f, vehiculo: v })}
          onDia={
            vista === 'semana'
              ? (f) => {
                  setFecha(f);
                  setVista('dia');
                }
              : undefined
          }
        />
      )}
      <div className="leyenda no-imprimir">
        <span>Clase</span>
        <span className="l-sin">Sin instructor</span>
        <span className="l-real">Realizada</span>
        <span className="l-no">No asistió</span>
        <span className="l-acomp">Acompañamiento</span>
        <span className="l-break">Break</span>
      </div>

      {hueco && (
        <ReservarModal
          hueco={hueco}
          carros={carros}
          horario={horario}
          apertura={apertura}
          cierre={cierre}
          paquete={paqueteActivo}
          onCerrar={() => setHueco(null)}
        />
      )}
      {claseSel && <ClaseModal clase={claseSel} onCerrar={() => setClaseSel(null)} />}
      {bloqueoSel && <BloqueoModal bloqueo={bloqueoSel} carro={carros.find((v) => v.id === bloqueoSel.vehiculoId)} onCerrar={() => setBloqueoSel(null)} />}
      {turnoSel && (
        <TurnoModal
          fecha={turnoSel.fecha}
          vehiculo={turnoSel.vehiculo}
          turnos={horario.turnos.filter((t) => t.vehiculoId === turnoSel.vehiculo.id && fechaLima(new Date(t.inicio)) === turnoSel.fecha)}
          apertura={apertura}
          cierre={cierre}
          onCerrar={() => setTurnoSel(null)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Rejilla tipo Excel

function claseCss(c: Clase) {
  if (c.tipo === 'acompanamiento') return `bloque acomp ${c.estado}`;
  return `bloque ${c.estado} ${!c.instructorId && c.estado === 'programada' ? 'sin-inst' : ''}`;
}
function recojoTexto(c: Clase) {
  if (c.direccionRecojo) return c.direccionRecojo;
  return c.puntoRecojo ?? '';
}

/**
 * Filas = tramos de 30 min; columnas = día × carro (como el Excel de la escuela).
 * Debajo de cada carro, el instructor del turno de ese día.
 */
function RejillaHorario(props: {
  dias: string[];
  carros: Vehiculo[];
  horario: Horario;
  apertura: number;
  cierre: number;
  zoom: Zoom;
  puedeReservar: boolean;
  onHueco: (h: Hueco) => void;
  onClase: (c: Clase) => void;
  onBloqueo: (b: Bloqueo) => void;
  onTurno: (fecha: string, v: Vehiculo) => void;
  onDia?: (f: string) => void;
}) {
  const { dias, carros, apertura, cierre } = props;
  const z = ZOOM[props.zoom];
  const tramos = Array.from({ length: (cierre - apertura) * 2 }, (_, i) => apertura + i / 2);
  const hoy = hoyLima();
  const unDia = dias.length === 1;
  const anchoCol = unDia ? Math.max(z.dia, 0) : z.col;
  const col = (di: number, ci: number) => 2 + di * carros.length + ci;
  const fila = (h: number) => 3 + Math.round((h - apertura) * 2);

  if (carros.length === 0) return <div className="vacio tarjeta">No hay carros activos. Agrégalos en Flota.</div>;

  // Índices para ubicar cada bloque.
  const idxCarro = new Map(carros.map((v, i) => [v.id, i]));
  const idxDia = new Map(dias.map((d, i) => [d, i]));
  const ubicar = (x: { vehiculoId: string; inicio: string; fin: string }) => {
    const ini = new Date(x.inicio);
    const di = idxDia.get(fechaLima(ini));
    const ci = idxCarro.get(x.vehiculoId);
    if (di === undefined || ci === undefined) return null;
    const h0 = Math.max(apertura, horaLima(ini));
    const h1 = Math.min(cierre, horaLima(ini) + durH(x));
    if (h1 <= h0) return null;
    return { gridColumn: col(di, ci), gridRow: `${fila(h0)} / ${fila(h1)}` };
  };
  const turnosDe = (f: string, vId: string) => props.horario.turnos.filter((t) => t.vehiculoId === vId && fechaLima(new Date(t.inicio)) === f);
  const ahora = horaLima(new Date());

  return (
    <div className={`horario zoom-${props.zoom} ${unDia ? '' : 'estrecho'}`} style={{ ['--fila' as string]: `${z.fila}px` }}>
      <div
        className="rejilla"
        style={{
          gridTemplateColumns: `58px repeat(${dias.length * carros.length}, minmax(${anchoCol}px, 1fr))`,
          gridTemplateRows: `auto auto repeat(${tramos.length}, var(--fila)) auto`,
        }}
      >
        {/* Cabeceras: día (abarca sus carros) y carro */}
        <div className="r-esquina" style={{ gridRow: '1 / 3', gridColumn: 1 }}>Hora</div>
        {dias.map((d, di) => (
          <button
            key={d}
            className={`r-dia ${d === hoy ? 'hoy' : ''}`}
            style={{ gridRow: 1, gridColumn: `${col(di, 0)} / span ${carros.length}` }}
            onClick={() => props.onDia?.(d)}
            disabled={!props.onDia}
            title={props.onDia ? 'Ver este día' : undefined}
          >
            {(unDia ? fechaLarga(d) : fechaLarga(d).split(' ').slice(0, 2).join(' ')).replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
        {dias.map((d, di) =>
          carros.map((v, ci) => (
            <div key={`${d}-${v.id}`} className={`r-carro ${ci === 0 ? 'inicio-dia' : ''}`} style={{ gridRow: 2, gridColumn: col(di, ci), background: v.colorHorario }}>
              {nombreCarro(v)}
              <small>{v.placa} · {TRANSMISION[v.transmision]}</small>
            </div>
          )),
        )}

        {/* Columna de horas */}
        {tramos.map((h) => (
          <div key={h} className={`r-hora ${h % 1 ? 'media' : ''}`} style={{ gridRow: fila(h), gridColumn: 1 }}>
            {hhmm(h)}
          </div>
        ))}

        {/* Celdas vacías (clic = reservar) */}
        {dias.map((d, di) =>
          carros.map((v, ci) =>
            tramos.map((h) => {
              const bloq = !props.puedeReservar || v.estado !== 'activo';
              return (
                <div
                  key={`${d}-${v.id}-${h}`}
                  className={`r-celda ${h % 1 ? 'media' : ''} ${ci === 0 ? 'inicio-dia' : ''} ${d === hoy ? 'hoy' : ''} ${bloq ? 'bloq' : ''}`}
                  style={{ gridRow: fila(h), gridColumn: col(di, ci) }}
                  onClick={() => !bloq && props.onHueco({ fecha: d, hora: h, vehiculoId: v.id })}
                  title={bloq ? undefined : `Reservar ${nombreCarro(v)} ${hhmm(h)}`}
                />
              );
            }),
          ),
        )}

        {/* Breaks */}
        {props.horario.bloqueos.map((b) => {
          const pos = ubicar(b);
          if (!pos) return null;
          return (
            <button key={b.id} className={`bloque break ${b.motivo}`} style={pos} onClick={() => props.onBloqueo(b)}>
              <strong>{b.motivo === 'break' ? 'Break' : b.motivo === 'mantenimiento' ? 'Mantenimiento' : 'Bloqueado'}</strong>
              {durH(b) > 0.5 && <span>{hhmm(horaLima(new Date(b.inicio)))}–{hhmm(horaLima(new Date(b.fin)))}</span>}
            </button>
          );
        })}

        {/* Clases y acompañamientos */}
        {props.horario.clases.map((c) => {
          const pos = ubicar(c);
          if (!pos) return null;
          const h = durH(c);
          const t0 = horaLima(new Date(c.inicio));
          return (
            <button key={c.id} className={claseCss(c)} style={pos} onClick={() => props.onClase(c)} title={`${c.alumno} · ${hhmm(t0)}–${hhmm(t0 + h)}`}>
              <span className="b-hora">
                {hhmm(t0)}–{hhmm(t0 + h)}
                {c.tipo === 'acompanamiento' && ' · Acompañamiento'}
              </span>
              <strong className="b-alumno">{c.alumno}</strong>
              {h >= 1 && c.telefonoAlumno && <span className="b-linea"><Icono n="telefono" t={11} /> {c.telefonoAlumno}</span>}
              {h >= 1 && recojoTexto(c) && <span className="b-linea"><Icono n="hoy" t={11} /> {recojoTexto(c)}</span>}
              {h >= 1.5 && c.notas && <span className="b-nota">{c.notas}</span>}
              {h >= 1.5 && <span className="b-linea b-inst">{c.instructor ?? 'Sin instructor'}</span>}
            </button>
          );
        })}

        {/* Línea de "ahora" */}
        {dias.includes(hoy) && ahora >= apertura && ahora < cierre && (
          <div
            className="ahora"
            style={{
              gridColumn: `${col(dias.indexOf(hoy), 0)} / span ${carros.length}`,
              gridRow: fila(Math.floor(ahora * 2) / 2),
              marginTop: (ahora * 2 - Math.floor(ahora * 2)) * ZOOM[props.zoom].fila,
            }}
          />
        )}

        {/* Turnos: instructor del día por carro (fila de abajo del Excel) */}
        <div className="r-esquina pie" style={{ gridRow: tramos.length + 3, gridColumn: 1 }}>Instr.</div>
        {dias.map((d, di) =>
          carros.map((v, ci) => {
            const ts = turnosDe(d, v.id);
            return (
              <button
                key={`t-${d}-${v.id}`}
                className={`r-turno ${ci === 0 ? 'inicio-dia' : ''} ${ts.length ? '' : 'vacio-turno'}`}
                style={{ gridRow: tramos.length + 3, gridColumn: col(di, ci) }}
                onClick={() => props.onTurno(d, v)}
                title="Instructor de este carro este día"
              >
                {ts.length === 0
                  ? '+ Instructor'
                  : ts.map((t, i) => (
                      <span key={t.id}>
                        {i > 0 && ' · '}
                        {t.instructor}
                        {ts.length > 1 && <small> {hhmm(horaLima(new Date(t.inicio)))}–{hhmm(horaLima(new Date(t.fin)))}</small>}
                      </span>
                    ))}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Mes

function VistaMes(props: { fecha: string; desde: string; clases: Clase[]; capacidad: number; onDia: (f: string) => void }) {
  const mes = props.fecha.slice(0, 7);
  const hoy = hoyLima();
  const porDia = useMemo(() => {
    const m = new Map<string, { n: number; horas: number; sinInst: number; acomp: number }>();
    for (const c of props.clases) {
      const f = fechaLima(new Date(c.inicio));
      const r = m.get(f) ?? { n: 0, horas: 0, sinInst: 0, acomp: 0 };
      r.n++;
      r.horas += durH(c);
      if (!c.instructorId && c.estado === 'programada') r.sinInst++;
      if (c.tipo === 'acompanamiento') r.acomp++;
      m.set(f, r);
    }
    return m;
  }, [props.clases]);
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(props.desde, i));
  const semanas = dias.slice(35).some((d) => d.slice(0, 7) === mes) ? dias : dias.slice(0, 35);
  return (
    <div className="mes">
      {['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map((d) => (
        <div key={d} className="mes-cab">{d}</div>
      ))}
      {semanas.map((f) => {
        const r = porDia.get(f);
        const ocup = r ? Math.min(100, Math.round((100 * r.horas) / props.capacidad)) : 0;
        return (
          <button key={f} className={`mes-dia ${f.slice(0, 7) !== mes ? 'fuera' : ''} ${f === hoy ? 'hoy' : ''}`} onClick={() => props.onDia(f)} aria-label={`${fechaLarga(f)}: ${r?.n ?? 0} clases`}>
            <span className="num">{Number(f.slice(8))}</span>
            {r && (
              <>
                <span className="detalle"><strong style={{ color: 'var(--tinta)' }}>{r.n}</strong> {r.n === 1 ? 'reserva' : 'reservas'} · {ocup} %</span>
                {r.acomp > 0 && <span className="chip" style={{ alignSelf: 'flex-start', background: '#ffedd5', color: '#9a3412', borderColor: '#fed7aa' }}>{r.acomp} acompañ.</span>}
                {r.sinInst > 0 && <span className="chip alerta" style={{ alignSelf: 'flex-start' }}>{r.sinInst} sin instructor</span>}
              </>
            )}
            <span className="ocup" title={`Ocupación ${ocup} %`}><div style={{ width: `${ocup}%` }} /></span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Reservar (clase, acompañamiento o break)

type TipoReserva = TipoClase | 'break';

function ReservarModal(props: {
  hueco: Hueco;
  carros: Vehiculo[];
  horario: Horario;
  apertura: number;
  cierre: number;
  paquete: PaquetePorAgendar | null;
  onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [tipo, setTipo] = useState<TipoReserva>('clase');
  const [q, setQ] = useState('');
  const [paquete, setPaquete] = useState<PaquetePorAgendar | null>(props.paquete);
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [vehiculoId, setVehiculoId] = useState(props.hueco.vehiculoId);
  const [fecha, setFecha] = useState(props.hueco.fecha);
  const [hora, setHora] = useState(props.hueco.hora);
  const restantes = paquete?.horas_disponibles ?? 4;
  const [duracion, setDuracion] = useState(Math.min(2, restantes));
  const [puntoId, setPuntoId] = useState<string>('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [instructorId, setInstructorId] = useState('');

  const puntos = useQuery({ queryKey: ['puntos-recojo'], queryFn: () => api.get<PuntoRecojo[]>('/puntos-recojo'), staleTime: 5 * 60_000 });
  useEffect(() => {
    if (!puntoId && puntos.data?.[0]) setPuntoId(puntos.data[0].id);
  }, [puntos.data, puntoId]);
  const punto = puntos.data?.find((p) => p.id === puntoId);
  const instructores = useQuery({ queryKey: ['instructores'], queryFn: () => api.get<Instructor[]>('/instructores') });
  const buscadosPaq = useQuery({
    queryKey: ['paquetes', 'por-agendar', 'q', q],
    queryFn: () => api.get<(PaquetePorAgendar & { direccion: string | null })[]>(`/paquetes/por-agendar?q=${encodeURIComponent(q)}`),
    enabled: tipo === 'clase' && !paquete,
  });
  const buscadosAl = useQuery({
    queryKey: ['alumnos', q],
    queryFn: () => api.get<Alumno[]>(`/alumnos?q=${encodeURIComponent(q)}`),
    enabled: tipo === 'acompanamiento' && !alumno && q.trim().length >= 2,
  });

  // Al cambiar de tipo, duración por defecto razonable.
  useEffect(() => {
    setDuracion(tipo === 'break' ? 1 : tipo === 'acompanamiento' ? 4 : Math.min(2, restantes));
  }, [tipo, restantes]);

  const maxDur = tipo === 'clase' ? Math.min(4, restantes) : tipo === 'acompanamiento' ? 12 : 4;
  const duraciones = Array.from({ length: Math.max(1, Math.round(maxDur * 2)) }, (_, i) => (i + 1) / 2);
  const horasInicio = Array.from({ length: (props.cierre - props.apertura) * 2 }, (_, i) => props.apertura + i / 2).filter((h) => h + duracion <= props.cierre);

  // Choques con lo ya cargado (clases o breaks del carro); la base de datos lo valida igual.
  const choque = useMemo(() => {
    const ini = hora;
    const fin = hora + duracion;
    const mismo = (x: { vehiculoId: string; inicio: string }) => x.vehiculoId === vehiculoId && fechaLima(new Date(x.inicio)) === fecha;
    const cruza = (x: { inicio: string; fin: string }) => horaLima(new Date(x.inicio)) < fin && horaLima(new Date(x.fin)) > ini;
    const c = props.horario.clases.find((x) => mismo(x) && cruza(x));
    if (c) return `El carro ya tiene a ${c.alumno} de ${hhmm(horaLima(new Date(c.inicio)))} a ${hhmm(horaLima(new Date(c.fin)))}.`;
    const b = props.horario.bloqueos.find((x) => mismo(x) && cruza(x));
    if (b) return `El carro tiene break de ${hhmm(horaLima(new Date(b.inicio)))} a ${hhmm(horaLima(new Date(b.fin)))}.`;
    return null;
  }, [props.horario, vehiculoId, fecha, hora, duracion]);

  // Instructor del turno a esa hora (se asigna solo).
  const turno: Turno | undefined = props.horario.turnos.find(
    (t) => t.vehiculoId === vehiculoId && fechaLima(new Date(t.inicio)) === fecha && horaLima(new Date(t.inicio)) <= hora && horaLima(new Date(t.fin)) > hora,
  );

  const guardar = useMutation({
    mutationFn: () =>
      tipo === 'break'
        ? api.post('/bloqueos', { vehiculoId, fecha, hora, duracion, motivo: 'break', nota: notas || null })
        : api.post('/clases', {
            tipo,
            paqueteId: tipo === 'clase' ? paquete?.paquete_id : null,
            alumnoId: tipo === 'acompanamiento' ? alumno?.id : null,
            vehiculoId,
            fecha,
            hora,
            duracion,
            instructorId: instructorId || null,
            puntoRecojoId: puntoId || null,
            direccionRecojo: punto?.tipo === 'domicilio' ? direccion : null,
            notas: notas || null,
          }),
    onSuccess: () => {
      ['horario', 'clases', 'paquetes', 'por-asignar', 'hoy'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      avisar(tipo === 'break' ? 'Break agregado' : `Reservado: ${fechaLarga(fecha)} ${hhmm(hora)}–${hhmm(hora + duracion)}`);
      props.onCerrar();
    },
  });

  const listo = !choque && !guardar.isPending && (tipo === 'break' || (tipo === 'clase' ? !!paquete : !!alumno)) && (punto?.tipo !== 'domicilio' || tipo === 'break' || direccion.trim() !== '');
  const carro = props.carros.find((v) => v.id === vehiculoId);

  return (
    <Modal
      titulo={`Reservar · ${carro ? nombreCarro(carro) : ''}`}
      onCerrar={props.onCerrar}
      ancho={640}
      pie={
        <>
          <button className="btn sec" onClick={props.onCerrar}>Cancelar</button>
          <button className="btn" disabled={!listo} onClick={() => guardar.mutate()}>
            {tipo === 'break' ? 'Agregar break' : 'Reservar'} {hhmm(hora)}–{hhmm(hora + duracion)}
          </button>
        </>
      }
    >
      <div className="fila" role="radiogroup" aria-label="Tipo">
        {([['clase', 'Clase de manejo'], ['acompanamiento', 'Acompañamiento'], ['break', 'Break']] as const).map(([k, t]) => (
          <button key={k} role="radio" aria-checked={tipo === k} className={`elegible ${tipo === k ? 'sel' : ''}`} style={{ flex: 1, textAlign: 'center' }} onClick={() => setTipo(k)}>
            {t}
          </button>
        ))}
      </div>

      {tipo === 'clase' &&
        (paquete ? (
          <div className="elegible sel" style={{ cursor: 'default' }}>
            <strong>{paquete.alumno}</strong>
            <div className="suave chico">{paquete.producto} · quedan {paquete.horas_disponibles} h por agendar</div>
            {!props.paquete && <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setPaquete(null)}>Cambiar</button>}
          </div>
        ) : (
          <Campo etiqueta="Alumno con horas por agendar">
            <input autoFocus placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="lista-elegible" style={{ maxHeight: 200 }}>
              {(buscadosPaq.data ?? []).map((p) => (
                <button
                  key={p.paquete_id}
                  className="elegible"
                  style={{ fontWeight: 400 }}
                  onClick={() => {
                    setPaquete(p);
                    if (p.direccion) setDireccion(p.direccion);
                  }}
                >
                  <strong>{p.alumno}</strong>
                  <div className="suave chico">{p.producto} · quedan {p.horas_disponibles} h</div>
                </button>
              ))}
              {buscadosPaq.isSuccess && buscadosPaq.data.length === 0 && (
                <span className="suave chico" style={{ fontWeight: 400 }}>Nadie con horas pendientes{q ? ' con ese nombre' : ''}. Primero registra la venta.</span>
              )}
            </div>
          </Campo>
        ))}

      {tipo === 'acompanamiento' &&
        (alumno ? (
          <div className="elegible sel" style={{ cursor: 'default' }}>
            <strong>{alumno.nombres} {alumno.apellidos}</strong>
            <div className="suave chico">{alumno.telefono ?? ''}</div>
            <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setAlumno(null)}>Cambiar</button>
          </div>
        ) : (
          <Campo etiqueta="Alumno">
            <input autoFocus placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="lista-elegible" style={{ maxHeight: 200 }}>
              {(buscadosAl.data ?? []).map((a) => (
                <button
                  key={a.id}
                  className="elegible"
                  style={{ fontWeight: 400 }}
                  onClick={() => {
                    setAlumno(a);
                    if (a.direccion) setDireccion(a.direccion);
                  }}
                >
                  <strong>{a.nombres} {a.apellidos}</strong>
                  <div className="suave chico">{a.telefono ?? ''}</div>
                </button>
              ))}
            </div>
          </Campo>
        ))}

      <div className="grid g4">
        <Campo etiqueta="Fecha"><input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></Campo>
        <Campo etiqueta="Desde">
          <select value={hora} onChange={(e) => setHora(Number(e.target.value))}>
            {horasInicio.map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Duración">
          <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            {duraciones.map((d) => <option key={d} value={d}>{d < 1 ? '30 min' : `${Math.floor(d)} h${d % 1 ? ' 30' : ''}`}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Carro">
          <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
            {props.carros.map((v) => <option key={v.id} value={v.id} disabled={v.estado !== 'activo'}>{nombreCarro(v)}</option>)}
          </select>
        </Campo>
      </div>
      {choque && <div className="aviso alerta chico">{choque}</div>}

      {tipo !== 'break' && (
        <>
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
            <Campo etiqueta="Dirección de recojo" ayuda="Se guarda en la ficha del alumno para la próxima vez.">
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej.: Jr. Hermano Lobo 230, San Borja" />
            </Campo>
          )}
          <Campo etiqueta="Instructor">
            <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">{turno ? `Del turno: ${turno.instructor}` : 'Sin turno: asignar después'}</option>
              {(instructores.data ?? []).filter((i) => i.activo).map((i) => <option key={i.id} value={i.id}>{i.nombres}</option>)}
            </select>
          </Campo>
        </>
      )}
      <Campo etiqueta={tipo === 'break' ? 'Nota (opcional)' : 'Nota (opcional)'}>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={tipo === 'break' ? 'Ej.: refrigerio' : 'Ej.: es menor de edad · no reprogramar'} />
      </Campo>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

// ------------------------------------------------------------------ Break (ver / quitar)

function BloqueoModal(props: { bloqueo: Bloqueo; carro?: Vehiculo; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const puede = usePuede();
  const b = props.bloqueo;
  const quitar = useMutation({
    mutationFn: () => api.del(`/bloqueos/${b.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['horario'] });
      avisar('Break quitado');
      props.onCerrar();
    },
  });
  const t = new Date(b.inicio);
  return (
    <Modal
      titulo={b.motivo === 'break' ? 'Break' : b.motivo === 'mantenimiento' ? 'Mantenimiento' : 'Bloqueo'}
      onCerrar={props.onCerrar}
      pie={
        <>
          <button className="btn sec" onClick={props.onCerrar}>Cerrar</button>
          {puede('clase.agendar') && <button className="btn peligro" onClick={() => quitar.mutate()}>Quitar y liberar el horario</button>}
        </>
      }
    >
      <p style={{ margin: 0 }}>
        <strong>{props.carro ? nombreCarro(props.carro) : ''}</strong> · {fechaLarga(fechaLima(t))}, {hhmm(horaLima(t))}–{hhmm(horaLima(new Date(b.fin)))}
      </p>
      {b.nota && <p className="suave" style={{ margin: 0 }}>{b.nota}</p>}
      <ErrorCaja error={quitar.error} />
    </Modal>
  );
}

// ------------------------------------------------------------------ Turno: instructor del carro en el día

function TurnoModal(props: { fecha: string; vehiculo: Vehiculo; turnos: Turno[]; apertura: number; cierre: number; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const instructores = useQuery({ queryKey: ['instructores'], queryFn: () => api.get<Instructor[]>('/instructores') });
  const [instructorId, setInstructorId] = useState(props.turnos[0]?.instructorId ?? '');
  const [desde, setDesde] = useState(props.apertura);
  const [hasta, setHasta] = useState(props.cierre);
  const tramos = Array.from({ length: (props.cierre - props.apertura) * 2 + 1 }, (_, i) => props.apertura + i / 2);
  const guardar = useMutation({
    mutationFn: (quitar: boolean) =>
      api.put<{ clasesActualizadas: number }>('/turnos', { vehiculoId: props.vehiculo.id, fecha: props.fecha, instructorId: quitar ? null : instructorId, desde, hasta }),
    onSuccess: (r) => {
      ['horario', 'por-asignar', 'hoy'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      avisar(`Turno guardado${r.clasesActualizadas ? ` · ${r.clasesActualizadas} clases actualizadas` : ''}`);
      props.onCerrar();
    },
  });
  return (
    <Modal
      titulo={`Instructor de ${nombreCarro(props.vehiculo)}`}
      onCerrar={props.onCerrar}
      pie={
        <>
          {props.turnos.length > 0 && <button className="btn peligro" onClick={() => guardar.mutate(true)}>Quitar en este tramo</button>}
          <span className="espacio" />
          <button className="btn sec" onClick={props.onCerrar}>Cancelar</button>
          <button className="btn" disabled={!instructorId || guardar.isPending} onClick={() => guardar.mutate(false)}>Guardar</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{fechaLarga(props.fecha).replace(/^./, (c) => c.toUpperCase())}</p>
      {props.turnos.length > 0 && (
        <div className="aviso info chico">
          Ahora: {props.turnos.map((t) => `${t.instructor} (${hhmm(horaLima(new Date(t.inicio)))}–${hhmm(horaLima(new Date(t.fin)))})`).join(' · ')}
        </div>
      )}
      <Campo etiqueta="Instructor">
        <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} autoFocus>
          <option value="">Elegir…</option>
          {(instructores.data ?? []).filter((i) => i.activo).map((i) => <option key={i.id} value={i.id}>{i.nombres}</option>)}
        </select>
      </Campo>
      <div className="grid g2">
        <Campo etiqueta="Desde">
          <select value={desde} onChange={(e) => setDesde(Number(e.target.value))}>
            {tramos.slice(0, -1).map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Hasta">
          <select value={hasta} onChange={(e) => setHasta(Number(e.target.value))}>
            {tramos.filter((h) => h > desde).map((h) => <option key={h} value={h}>{hhmm(h)}</option>)}
          </select>
        </Campo>
      </div>
      <span className="suave chico">
        Si cambia de instructor a medio día, elige el tramo (por ejemplo desde las 14:00). Las clases programadas de ese carro en el tramo toman este instructor.
      </span>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

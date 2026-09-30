import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Alumno, type Paquete, type Producto, type VentaResumen } from '../api';
import { Icono } from '../iconos';
import { centroPreferido, recordarCentro, useCentros, usePuede, useYo } from '../sesion';
import { Campo, ErrorCaja, escribiendo, Modal, useAtajo, useAviso } from '../ui';
import { ETAPAS, METODOS, ORIGENES, S } from '../util';

type Metodo = (typeof METODOS)[number]['id'];
interface ItemCarrito {
  clave: number;
  producto: Producto;
  /** null = paquete nuevo; id = recargar ese paquete. */
  recargaPaqueteId: string | null;
  precioEspecial: string;
}

const precioAplicable = (p: Producto) => p.oferta?.precio ?? p.precioRegular;
const clasesTxt = (h: number) => `${h / 2} ${h === 2 ? 'clase' : 'clases'}`;

export function VentaRapida() {
  const yo = useYo();
  const puede = usePuede();
  const centros = useCentros();
  const avisar = useAviso();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [centroId, setCentroId] = useState('');
  useEffect(() => {
    if (!centroId && centros.length) setCentroId(centroPreferido(yo, centros));
  }, [centros, centroId, yo]);

  // ---- 1. Alumno
  const buscarRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(0);
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const resultados = useQuery({
    queryKey: ['alumnos', q],
    queryFn: () => api.get<Alumno[]>(`/alumnos?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  const lista = q.trim().length >= 2 ? (resultados.data ?? []) : [];
  const ficha = useQuery({
    queryKey: ['alumno', alumno?.id],
    queryFn: () => api.get<{ paquetes: Paquete[]; ventas: VentaResumen[] }>(`/alumnos/${alumno!.id}`),
    enabled: !!alumno,
  });
  const paquetesActivos = (ficha.data?.paquetes ?? []).filter((p) => p.estado === 'activo');

  // ---- 2. Carrito
  const productos = useQuery({ queryKey: ['productos'], queryFn: () => api.get<Producto[]>('/productos') });
  const activos = useMemo(() => (productos.data ?? []).filter((p) => p.activo), [productos.data]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const claveRef = useRef(1);
  const agregar = (p: Producto) =>
    setCarrito((c) => [...c, { clave: claveRef.current++, producto: p, recargaPaqueteId: null, precioEspecial: '' }]);
  const quitar = (clave: number) => setCarrito((c) => c.filter((i) => i.clave !== clave));
  const cambiar = (clave: number, cambios: Partial<ItemCarrito>) =>
    setCarrito((c) => c.map((i) => (i.clave === clave ? { ...i, ...cambios } : i)));

  // ---- 3. Cobro
  const precioItem = (i: ItemCarrito) => (i.precioEspecial !== '' ? Number(i.precioEspecial) : precioAplicable(i.producto));
  const totalRegular = carrito.reduce((s, i) => s + i.producto.precioRegular, 0);
  const total = Math.round(carrito.reduce((s, i) => s + precioItem(i), 0) * 100) / 100;
  const hayEspecial = carrito.some((i) => i.precioEspecial !== '' && Number(i.precioEspecial) !== precioAplicable(i.producto));
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('yape');
  const horasCarrito = carrito.reduce((s, i) => s + i.producto.horas, 0);

  const [hecha, setHecha] = useState<{ alumno: Alumno; items: ItemCarrito[]; total: number; metodo: Metodo; paquetes: string[] } | null>(null);

  const reiniciar = () => {
    setAlumno(null);
    setCarrito([]);
    setQ('');
    setMotivo('');
    setHecha(null);
    setTimeout(() => buscarRef.current?.focus(), 0);
  };

  const vender = useMutation({
    mutationFn: () =>
      api.post<{ id: string; paquetes: string[] }>('/ventas', {
        alumnoId: alumno!.id,
        centroId,
        items: carrito.map((i) => ({
          productoId: i.producto.id,
          recargaPaqueteId: i.recargaPaqueteId,
          precioManual: i.precioEspecial !== '' ? Number(i.precioEspecial) : null,
        })),
        motivoDescuento: hayEspecial ? motivo : null,
        metodo,
      }),
    onSuccess: (v) => {
      setHecha({ alumno: alumno!, items: carrito, total, metodo, paquetes: v.paquetes });
      ['paquetes', 'analisis', 'alumno', 'hoy', 'crm'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      avisar('Venta registrada');
    },
  });

  const listo = !!alumno && carrito.length > 0 && !!centroId && !vender.isPending && (!hayEspecial || motivo.trim() !== '');
  const confirmar = () => listo && !hecha && vender.mutate();

  // ---- Atajos
  useAtajo('f2', () => {
    if (hecha) reiniciar();
    buscarRef.current?.focus();
    buscarRef.current?.select();
  });
  useAtajo('f4', () => !hecha && setNuevo(true));
  useAtajo('ctrl+enter', confirmar);
  useAtajo('escape', () => !nuevo && reiniciar(), !nuevo);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (hecha || nuevo || e.ctrlKey || e.metaKey) return;
      if (e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        setMetodo(METODOS[Number(e.key) - 1]!.id);
        return;
      }
      if (escribiendo() || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const p = activos[Number(e.key) - 1];
        if (p) agregar(p);
      }
      if (e.key === 'Backspace' || e.key === 'Delete') setCarrito((c) => c.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activos, hecha, nuevo]);

  const elegirAlumno = (a: Alumno) => {
    setAlumno(a);
    setQ('');
    (document.activeElement as HTMLElement | null)?.blur();
  };

  if (hecha) {
    const horas = hecha.items.reduce((s, i) => s + i.producto.horas, 0);
    return (
      <>
        <div className="cabecera"><h1>Venta rápida</h1></div>
        <div className="tarjeta" style={{ maxWidth: 580 }}>
          <div className="aviso ok" style={{ marginBottom: 14 }}>
            Venta registrada para <strong>{hecha.alumno.nombres} {hecha.alumno.apellidos}</strong>
          </div>
          {hecha.items.map((i) => (
            <div key={i.clave} className="resumen-linea">
              <span>{i.recargaPaqueteId ? `Recarga ${i.producto.horas} h` : i.producto.nombre}</span>
              <span>{S(precioItem(i))}</span>
            </div>
          ))}
          <div className="resumen-linea" style={{ borderTop: '1px solid var(--borde)', marginTop: 6, paddingTop: 8 }}><span>Total</span><strong>{S(hecha.total)}</strong></div>
          <div className="resumen-linea"><span>Pagado con</span><strong>{METODOS.find((m) => m.id === hecha.metodo)?.t}</strong></div>
          {horas > 0 && <div className="resumen-linea"><span>Horas por agendar</span><strong>{horas} h ({clasesTxt(horas)})</strong></div>}
          <div className="fila" style={{ marginTop: 16 }}>
            {hecha.paquetes[0] && (
              <button className="btn grande" onClick={() => nav(`/calendario?paquete=${hecha.paquetes[0]}`)} autoFocus>
                <Icono n="calendario" /> Agendar clases ahora
              </button>
            )}
            <button className="btn sec grande" onClick={reiniciar}>Nueva venta <kbd>F2</kbd></button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Venta rápida</h1>
          <p>
            <kbd>F2</kbd> alumno · <kbd>F4</kbd> nuevo · <kbd>1</kbd>–<kbd>9</kbd> agregar producto · <kbd>⌫</kbd> quitar último ·{' '}
            <kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>5</kbd> pago · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> confirmar
          </p>
        </div>
        <label className="campo" style={{ minWidth: 200 }}>
          Centro
          <select value={centroId} onChange={(e) => { setCentroId(e.target.value); recordarCentro(e.target.value); }}>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="pos">
        {/* 1. Alumno */}
        <section className="tarjeta">
          <div className="paso"><span className="paso-n">1</span><h2>Alumno</h2></div>
          {alumno ? (
            <>
              <div className="elegible sel" style={{ cursor: 'default' }}>
                <div className="fila">
                  <strong style={{ flex: 1 }}>{alumno.nombres} {alumno.apellidos}</strong>
                  <span className={`chip etapa-${alumno.etapa}`}>{ETAPAS[alumno.etapa]}</span>
                </div>
                <div className="suave chico">DNI {alumno.dni ?? '—'} · {alumno.telefono ?? 'sin teléfono'}</div>
                <div className="fila" style={{ marginTop: 8 }}>
                  <button className="btn sec" onClick={() => { setAlumno(null); setCarrito((c) => c.map((i) => ({ ...i, recargaPaqueteId: null }))); setTimeout(() => buscarRef.current?.focus(), 0); }}>Cambiar</button>
                  <Link className="btn sec" to={`/alumnos/${alumno.id}`}>Ver ficha</Link>
                </div>
              </div>
              {paquetesActivos.length > 0 && (
                <div className="paquetes-alumno">
                  <div className="suave chico" style={{ fontWeight: 700 }}>Lo que ya tiene</div>
                  {paquetesActivos.map((p) => (
                    <div key={p.id} className="paquete-mini">
                      <strong>{p.nombre}</strong>{p.recargas > 0 && ` · ${p.recargas} recarga${p.recargas > 1 ? 's' : ''}`}
                      <div className="suave">{p.horasDictadas} h dictadas · {p.horasDisponibles} h por agendar de {p.horasCompradas} h</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <input
                ref={buscarRef}
                autoFocus
                placeholder="Nombre, DNI o teléfono…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setFoco(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => Math.min(f + 1, lista.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
                  if (e.key === 'Enter' && lista[foco]) { e.preventDefault(); elegirAlumno(lista[foco]!); }
                }}
                aria-label="Buscar alumno"
              />
              <div className="lista-elegible">
                {lista.map((a, i) => (
                  <button key={a.id} className={`elegible ${i === foco ? 'foco' : ''}`} onClick={() => elegirAlumno(a)}>
                    <div className="fila">
                      <strong style={{ flex: 1 }}>{a.nombres} {a.apellidos}</strong>
                      <span className={`chip etapa-${a.etapa}`}>{ETAPAS[a.etapa]}</span>
                    </div>
                    <div className="suave chico">DNI {a.dni ?? '—'} · {a.telefono ?? 'sin teléfono'}</div>
                  </button>
                ))}
                {q.trim().length >= 2 && !resultados.isFetching && lista.length === 0 && <div className="suave chico">No hay coincidencias.</div>}
              </div>
              <button className="btn sec" style={{ marginTop: 10, width: '100%' }} onClick={() => setNuevo(true)}>
                <Icono n="mas" t={16} /> Alumno nuevo <kbd>F4</kbd>
              </button>
            </>
          )}
        </section>

        {/* 2. Productos */}
        <section className="tarjeta">
          <div className="paso"><span className="paso-n">2</span><h2>Productos</h2><span className="espacio" /><span className="suave chico">Clic o número para agregar</span></div>
          <div className="productos">
            {activos.map((p, i) => {
              const enCarrito = carrito.filter((c) => c.producto.id === p.id).length;
              return (
                <button key={p.id} className={`elegible producto ${enCarrito ? 'foco' : ''}`} onClick={() => agregar(p)}>
                  {i < 9 && <kbd>{i + 1}</kbd>}
                  <div className="horas">{p.tipo === 'paquete' ? `${p.horas} h` : <Icono n="productos" />}</div>
                  <div className="chico">{p.tipo === 'paquete' ? clasesTxt(p.horas) : p.nombre}</div>
                  <div className="precio">
                    {p.oferta ? (<><span className="tachado">{S(p.precioRegular)}</span>{S(p.oferta.precio)}</>) : S(p.precioRegular)}
                  </div>
                  {p.oferta && <span className="chip" style={{ marginTop: 4 }}>{p.oferta.nombre}</span>}
                  {enCarrito > 0 && <span className="chip etapa-matriculado" style={{ marginTop: 4, marginLeft: 4 }}>× {enCarrito}</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Carrito y cobro */}
        <section className="tarjeta">
          <div className="paso"><span className="paso-n">3</span><h2>Carrito y cobro</h2></div>
          {carrito.length === 0 ? (
            <div className="vacio" style={{ padding: 16 }}>El carrito está vacío.<br /><span className="chico">Agrega un paquete, un examen médico o una recarga de horas.</span></div>
          ) : (
            <div className="carrito">
              {carrito.map((i) => (
                <div key={i.clave} className="carrito-item">
                  <div className="fila-sup">
                    <span className="nombre">{i.recargaPaqueteId ? `Recarga ${i.producto.horas} h` : i.producto.nombre}</span>
                    <strong>{S(precioItem(i))}</strong>
                    <button className="btn fantasma icono" onClick={() => quitar(i.clave)} aria-label={`Quitar ${i.producto.nombre}`} title="Quitar"><Icono n="basura" t={16} /></button>
                  </div>
                  {i.producto.oferta && i.precioEspecial === '' && <div className="suave chico">Oferta {i.producto.oferta.nombre} (antes {S(i.producto.precioRegular)})</div>}
                  {i.producto.horas > 0 && paquetesActivos.length > 0 && (
                    <select
                      style={{ marginTop: 6 }}
                      value={i.recargaPaqueteId ?? ''}
                      onChange={(e) => cambiar(i.clave, { recargaPaqueteId: e.target.value || null })}
                      aria-label="Paquete nuevo o recarga"
                    >
                      <option value="">Paquete nuevo</option>
                      {paquetesActivos.map((p) => (
                        <option key={p.id} value={p.id}>Recargar «{p.nombre}» (le quedan {p.horasDisponibles} h)</option>
                      ))}
                    </select>
                  )}
                  {puede('venta.descuento_manual') && (
                    <input
                      style={{ marginTop: 6 }}
                      type="number"
                      min={0}
                      step="0.01"
                      value={i.precioEspecial}
                      placeholder={`Precio especial (solo admin) · ${precioAplicable(i.producto).toFixed(2)}`}
                      onChange={(e) => cambiar(i.clave, { precioEspecial: e.target.value })}
                      aria-label="Precio especial"
                    />
                  )}
                </div>
              ))}
              {hayEspecial && (
                <Campo etiqueta="Motivo del descuento"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: convenio empresa" /></Campo>
              )}
              <div className="resumen-linea" style={{ alignItems: 'baseline', borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
                <span>Total{horasCarrito > 0 ? ` · ${horasCarrito} h` : ''}</span>
                <span className="resumen-total">{S(total)}</span>
              </div>
              {totalRegular > total && <div className="suave chico" style={{ textAlign: 'right' }}>Ahorro frente a precio regular: {S(totalRegular - total)}</div>}

              <div className="suave chico" style={{ fontWeight: 600 }}>Método de pago · se cobra completo</div>
              <div className="metodos" role="radiogroup" aria-label="Método de pago">
                {METODOS.map((m, idx) => (
                  <button key={m.id} role="radio" aria-checked={metodo === m.id} className={`elegible ${metodo === m.id ? 'sel' : ''}`} onClick={() => setMetodo(m.id)} title={`Alt+${idx + 1}`}>{m.t}</button>
                ))}
              </div>
              <ErrorCaja error={vender.error} />
              <button className="btn grande" style={{ width: '100%' }} disabled={!listo} onClick={confirmar}>
                Cobrar {S(total)} y confirmar
              </button>
              {!alumno && <div className="suave chico">Falta elegir el alumno.</div>}
              {hayEspecial && !motivo.trim() && <div className="suave chico">Indica el motivo del descuento.</div>}
            </div>
          )}
        </section>
      </div>

      {nuevo && (
        <NuevoAlumno
          nombreInicial={q}
          onCerrar={() => setNuevo(false)}
          onCreado={(a) => {
            setNuevo(false);
            elegirAlumno(a);
            avisar('Alumno creado');
          }}
        />
      )}
    </>
  );
}

export function NuevoAlumno(props: { titulo?: string; nombreInicial?: string; onCerrar: () => void; onCreado: (a: Alumno) => void }) {
  const ini = props.nombreInicial?.trim() ?? '';
  const soloLetras = ini && !/\d/.test(ini) ? ini : '';
  const [f, setF] = useState({
    nombres: soloLetras.split(' ')[0] ?? '',
    apellidos: soloLetras.split(' ').slice(1).join(' '),
    dni: /^\d{8}$/.test(ini) ? ini : '',
    telefono: /^9\d{8}$/.test(ini) ? ini : '',
    origen: 'whatsapp',
    notas: '',
  });
  const [error, setError] = useState<unknown>(null);
  const guardar = async () => {
    try {
      props.onCreado(await api.post<Alumno>('/alumnos', { ...f, notas: f.notas || null }));
    } catch (e) {
      setError(e);
    }
  };
  useAtajo('ctrl+enter', guardar);
  return (
    <Modal
      titulo={props.titulo ?? 'Alumno nuevo'}
      onCerrar={props.onCerrar}
      pie={<><button className="btn sec" onClick={props.onCerrar}>Cancelar</button><button className="btn" onClick={guardar}>Guardar <kbd>Ctrl+Enter</kbd></button></>}
    >
      <div className="grid g2">
        <Campo etiqueta="Nombres"><input value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
        <Campo etiqueta="Apellidos"><input value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
        <Campo etiqueta="Teléfono / WhatsApp"><input inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></Campo>
        <Campo etiqueta="DNI" ayuda="Opcional para prospectos"><input inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Campo>
      </div>
      <Campo etiqueta="¿Cómo nos conoció?">
        <div className="fila">
          {Object.entries(ORIGENES).map(([k, v]) => (
            <button key={k} type="button" className={`elegible ${f.origen === k ? 'sel' : ''}`} onClick={() => setF({ ...f, origen: k })} style={{ fontWeight: 500 }}>{v}</button>
          ))}
        </div>
      </Campo>
      <Campo etiqueta="Nota (opcional)"><input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Ej.: quiere clases los sábados" /></Campo>
      {error ? <ErrorCaja error={error} /> : null}
    </Modal>
  );
}

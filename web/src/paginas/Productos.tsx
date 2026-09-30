import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Oferta, type Producto } from '../api';
import { usePuede } from '../sesion';
import { Campo, ErrorCaja, Modal, useAviso } from '../ui';
import { fechaCorta, hoyLima, S, sumarDias } from '../util';

export function Productos() {
  const puede = usePuede();
  const editar = puede('producto.editar');
  const prods = useQuery({ queryKey: ['productos'], queryFn: () => api.get<Producto[]>('/productos') });
  const ofertas = useQuery({ queryKey: ['ofertas'], queryFn: () => api.get<Oferta[]>('/ofertas') });
  const [editP, setEditP] = useState<Producto | 'nuevo' | null>(null);
  const [editO, setEditO] = useState<Oferta | 'nueva' | null>(null);
  const hoy = hoyLima();
  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Productos y ofertas</h1>
          <p>Cada venta guarda el precio regular y el cobrado; así el análisis distingue ventas a precio regular, en oferta o con descuento.</p>
        </div>
        {editar && <button className="btn" onClick={() => setEditP('nuevo')}>+ Producto</button>}
      </div>
      <div className="tarjeta tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Producto</th><th>Horas</th><th className="num">Precio regular</th><th>Oferta vigente hoy</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(prods.data ?? []).map((p) => (
              <tr key={p.id} style={!p.activo ? { opacity: 0.55 } : undefined}>
                <td><strong>{p.nombre}</strong></td>
                <td>{p.tipo === 'paquete' ? `${p.horas} h (${p.horas / 2} clases)` : '—'}</td>
                <td className="num">{S(p.precioRegular)}</td>
                <td>{p.oferta ? <span className="chip">{p.oferta.nombre}: {S(p.oferta.precio)} hasta {fechaCorta(p.oferta.hasta)}</span> : <span className="suave">—</span>}</td>
                <td>{p.activo ? <span className="chip ok">A la venta</span> : <span className="chip gris">Oculto</span>}</td>
                <td>{editar && <button className="btn fantasma" onClick={() => setEditP(p)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tarjeta tabla-scroll">
        <div className="fila" style={{ marginBottom: 10 }}>
          <h2>Ofertas</h2>
          <span className="espacio" />
          {editar && <button className="btn sec" onClick={() => setEditO('nueva')}>+ Oferta</button>}
        </div>
        <table className="tabla">
          <thead><tr><th>Oferta</th><th>Producto</th><th className="num">Precio</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(ofertas.data ?? []).map((o) => {
              const vigente = o.activa && o.desde <= hoy && hoy <= o.hasta;
              return (
                <tr key={o.id}>
                  <td><strong>{o.nombre}</strong></td>
                  <td>{o.producto}</td>
                  <td className="num">{S(o.precio)}</td>
                  <td>{fechaCorta(o.desde)} – {fechaCorta(o.hasta)}</td>
                  <td>{vigente ? <span className="chip ok">Vigente</span> : <span className="chip gris">{o.activa ? (o.hasta < hoy ? 'Terminó' : 'Programada') : 'Desactivada'}</span>}</td>
                  <td>{editar && <button className="btn fantasma" onClick={() => setEditO(o)}>Editar</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ofertas.data?.length === 0 && <div className="vacio">No hay ofertas.</div>}
      </div>
      {editP && <ProductoForm producto={editP === 'nuevo' ? null : editP} onCerrar={() => setEditP(null)} />}
      {editO && <OfertaForm oferta={editO === 'nueva' ? null : editO} productos={prods.data ?? []} onCerrar={() => setEditO(null)} />}
    </>
  );
}

function ProductoForm({ producto, onCerrar }: { producto: Producto | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState({
    nombre: producto?.nombre ?? '',
    tipo: producto?.tipo ?? 'paquete',
    horas: String(producto?.horas ?? 2),
    precioRegular: String(producto?.precioRegular ?? ''),
    orden: String(producto?.orden ?? 0),
    activo: producto?.activo ?? true,
  });
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...f, horas: f.tipo === 'paquete' ? Number(f.horas) : 0, precioRegular: Number(f.precioRegular), orden: Number(f.orden) };
      return producto ? api.put(`/productos/${producto.id}`, cuerpo) : api.post('/productos', cuerpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      avisar('Producto guardado');
      onCerrar();
    },
  });
  return (
    <Modal titulo={producto ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}>
      <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
      <div className="grid g3">
        <Campo etiqueta="Tipo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'paquete' | 'otro' })}>
            <option value="paquete">Paquete de clases</option><option value="otro">Otro (examen, trámite…)</option>
          </select>
        </Campo>
        {f.tipo === 'paquete' && (
          <Campo etiqueta="Horas" ayuda="Clases de 2 h"><input type="number" step={2} min={2} value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></Campo>
        )}
        <Campo etiqueta="Precio regular (S/)"><input type="number" step="0.01" value={f.precioRegular} onChange={(e) => setF({ ...f, precioRegular: e.target.value })} /></Campo>
        <Campo etiqueta="Orden en la venta"><input type="number" value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} /></Campo>
      </div>
      <label className="fila"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> A la venta</label>
      {producto && <div className="aviso info chico">Cambiar el precio no altera las ventas ya registradas.</div>}
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

function OfertaForm({ oferta, productos, onCerrar }: { oferta: Oferta | null; productos: Producto[]; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState({
    productoId: oferta?.productoId ?? productos[0]?.id ?? '',
    nombre: oferta?.nombre ?? '',
    precio: String(oferta?.precio ?? ''),
    desde: oferta?.desde ?? hoyLima(),
    hasta: oferta?.hasta ?? sumarDias(hoyLima(), 30),
    activa: oferta?.activa ?? true,
  });
  const regular = productos.find((p) => p.id === f.productoId)?.precioRegular ?? 0;
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...f, precio: Number(f.precio) };
      return oferta ? api.put(`/ofertas/${oferta.id}`, cuerpo) : api.post('/ofertas', cuerpo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ofertas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      avisar('Oferta guardada');
      onCerrar();
    },
  });
  return (
    <Modal titulo={oferta ? 'Editar oferta' : 'Nueva oferta'} onCerrar={onCerrar} pie={<><button className="btn sec" onClick={onCerrar}>Cancelar</button><button className="btn" onClick={() => guardar.mutate()}>Guardar</button></>}>
      <div className="grid g2">
        <Campo etiqueta="Producto">
          <select value={f.productoId} onChange={(e) => setF({ ...f, productoId: e.target.value })}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({S(p.precioRegular)})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Nombre de la oferta"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Fiestas Patrias" /></Campo>
        <Campo etiqueta="Precio de oferta (S/)" ayuda={f.precio && regular ? `${Math.round(100 - (100 * Number(f.precio)) / regular)} % de descuento` : undefined}>
          <input type="number" step="0.01" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} />
        </Campo>
        <div />
        <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
      </div>
      <label className="fila"><input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} /> Activa</label>
      <ErrorCaja error={guardar.error} />
    </Modal>
  );
}

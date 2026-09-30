import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { Apilada, BarrasH, Columnas, LineaTiempo, MapaCalor, RAMPA_ORDINAL, SERIES, TarjetaGrafico } from '../graficos';
import { Icono } from '../iconos';
import { useCentros } from '../sesion';
import { ETAPAS, fechaCorta, hhmm, hoyLima, METODOS, ORIGENES, S, sumarDias, TIPO_PRECIO, TRANSMISION } from '../util';

interface Datos {
  alcance: 'todo' | 'propio';
  desde: string;
  hasta: string;
  resumen: { ventas: number; vendido: number; cobrado: number; descuento_total: number; ticket_promedio: number; horas_vendidas: number; alumnos: number };
  serie: { dia: string; vendido: number; cobrado: number }[];
  porProducto: { producto: string; unidades: number; ingresos: number; recargas: number }[];
  porTipoPrecio: { tipo_precio: keyof typeof TIPO_PRECIO; items: number; ingresos: number; dejado_de_cobrar: number }[];
  porVendedor: { vendedor: string; ventas: number; ingresos: number; ticket_promedio: number; pct_con_descuento: number }[];
  porCentro: { centro: string; ventas: number; ingresos: number }[];
  cobros: { metodo: string; monto: number; pagos: number }[];
  ocupacion: { placa: string; carro: string; transmision: keyof typeof TRANSMISION; centro: string; horas_uso: number; horas_disponibles: number; pct: number }[];
  demanda: { dow: number; hora: number; clases: number }[];
  origen: { origen: keyof typeof ORIGENES; alumnos: number }[];
  crm: {
    embudo: { nuevo: number; contactado: number; interesado: number; matriculado: number; perdido: number; dias_a_matricula: number };
    conversionOrigen: { origen: keyof typeof ORIGENES; prospectos: number; matriculados: number }[];
    semanas: { semana: string; prospectos: number; matriculados: number }[];
    perdidas: { motivo: string; n: number }[];
    conversionVendedor: { vendedor: string; prospectos: number; matriculados: number; sin_seguimiento: number }[];
  };
}

const RANGOS = [
  { id: '7', t: 'Últimos 7 días' },
  { id: '30', t: 'Últimos 30 días' },
  { id: '60', t: 'Últimos 60 días' },
  { id: '90', t: 'Últimos 90 días' },
  { id: 'mes', t: 'Este mes' },
];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
type Pestana = 'ventas' | 'crm' | 'operacion';
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const corto = (f: string) => fechaCorta(f).slice(0, 5);

export function Analisis() {
  const centros = useCentros();
  const [rango, setRango] = useState('30');
  const [centroId, setCentroId] = useState('');
  const [pestana, setPestana] = useState<Pestana>('ventas');
  const hasta = hoyLima();
  const desde = rango === 'mes' ? `${hasta.slice(0, 8)}01` : sumarDias(hasta, -(Number(rango) - 1));
  const q = useQuery({
    queryKey: ['analisis', desde, hasta, centroId],
    queryFn: () => api.get<Datos>(`/analisis?desde=${desde}&hasta=${hasta}${centroId ? `&centroId=${centroId}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Análisis</h1>
          <p>{d?.alcance === 'propio' ? 'Tus ventas y prospectos.' : 'Toda la escuela.'} {d && `Del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}.`} Montos en soles.</p>
        </div>
        <div className="fila">
          <select value={centroId} onChange={(e) => setCentroId(e.target.value)} style={{ width: 'auto' }} aria-label="Centro">
            <option value="">Ambos centros</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={rango} onChange={(e) => setRango(e.target.value)} style={{ width: 'auto' }} aria-label="Periodo">
            {RANGOS.map((r) => <option key={r.id} value={r.id}>{r.t}</option>)}
          </select>
          <button className="btn sec" onClick={() => window.print()}><Icono n="imprimir" t={16} /> PDF</button>
        </div>
      </div>

      <div className="pestanas no-imprimir" role="tablist">
        {([['ventas', 'Ventas'], ['crm', 'Comercial (CRM)'], ['operacion', 'Operación']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={`pestana ${pestana === k ? 'activa' : ''}`} onClick={() => setPestana(k)}>
            {t}
          </button>
        ))}
      </div>

      {!d ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <div style={{ opacity: q.isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          {pestana === 'ventas' && <Ventas d={d} />}
          {pestana === 'crm' && <Comercial d={d} />}
          {pestana === 'operacion' && <Operacion d={d} />}
        </div>
      )}
    </>
  );
}

function Kpi({ v, t, hero }: { v: string; t: string; hero?: boolean }) {
  return (
    <div className="tarjeta kpi">
      <div className={hero ? 'hero' : 'v'}>{v}</div>
      <div className="t">{t}</div>
    </div>
  );
}

function Ventas({ d }: { d: Datos }) {
  const totalItems = d.porTipoPrecio.reduce((s, r) => s + r.items, 0);
  const orden: (keyof typeof TIPO_PRECIO)[] = ['regular', 'oferta', 'descuento_manual'];
  const tipos = orden.map((t) => d.porTipoPrecio.find((r) => r.tipo_precio === t) ?? { tipo_precio: t, items: 0, ingresos: 0, dejado_de_cobrar: 0 });
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi hero v={S(d.resumen.vendido)} t={`Vendido · ${d.resumen.ventas} ventas`} />
        <Kpi v={String(d.resumen.alumnos)} t="Alumnos que compraron" />
        <Kpi v={S(d.resumen.ticket_promedio)} t="Ticket promedio" />
        <Kpi v={`${d.resumen.horas_vendidas} h`} t="Horas de manejo vendidas" />
      </div>
      <TarjetaGrafico
        titulo="Ventas por día"
        subtitulo="Siempre se cobra completo al vender. Pasa el mouse para ver cada día."
        tabla={{ columnas: ['Día', 'Vendido'], filas: d.serie.map((r) => [fechaCorta(r.dia), S(r.vendido)]) }}
      >
        <LineaTiempo
          etiquetas={d.serie.map((r) => corto(r.dia))}
          series={[{ nombre: 'Vendido', valores: d.serie.map((r) => r.vendido) }]}
          formato={(n) => `S/ ${n >= 1000 ? `${+(n / 1000).toFixed(1)} mil` : Math.round(n)}`}
          area
        />
      </TarjetaGrafico>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <TarjetaGrafico
          titulo="¿Qué producto se vende más?"
          subtitulo="Unidades vendidas (incluye recargas)."
          tabla={{ columnas: ['Producto', 'Unidades', 'Recargas', 'Ingresos'], filas: d.porProducto.map((r) => [r.producto, r.unidades, r.recargas, S(r.ingresos)]) }}
        >
          <BarrasH
            filas={d.porProducto.map((r) => ({
              etiqueta: r.producto,
              valor: r.unidades,
              texto: `${r.unidades}`,
              detalle: `${r.unidades} unidades · ${S(r.ingresos)}${r.recargas ? ` · ${r.recargas} recargas` : ''}`,
            }))}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="¿Precio regular u oferta?"
          subtitulo={`Productos vendidos: ${totalItems}. Dejado de cobrar frente al precio regular: ${S(d.resumen.descuento_total)}.`}
          tabla={{
            columnas: ['Tipo de precio', 'Productos', '%', 'Ingresos', 'Dejado de cobrar'],
            filas: tipos.map((r) => [TIPO_PRECIO[r.tipo_precio], r.items, `${pct(r.items, totalItems)} %`, S(r.ingresos), S(r.dejado_de_cobrar)]),
          }}
        >
          <Apilada
            partes={tipos.map((r) => ({
              nombre: TIPO_PRECIO[r.tipo_precio],
              valor: r.items,
              texto: `${r.items} productos · ${S(r.ingresos)}${r.dejado_de_cobrar ? ` · −${S(r.dejado_de_cobrar)}` : ''}`,
            }))}
          />
        </TarjetaGrafico>
        {d.alcance === 'todo' && (
          <TarjetaGrafico
            titulo="Ventas por vendedor"
            subtitulo="Ingresos del periodo."
            tabla={{
              columnas: ['Vendedor', 'Ventas', 'Ingresos', 'Ticket', 'Con descuento'],
              filas: d.porVendedor.map((r) => [r.vendedor, r.ventas, S(r.ingresos), S(r.ticket_promedio), `${Math.round(r.pct_con_descuento)} %`]),
            }}
          >
            <BarrasH
              filas={d.porVendedor.map((r) => ({
                etiqueta: r.vendedor,
                valor: r.ingresos,
                texto: S(r.ingresos),
                detalle: `${r.ventas} ventas · ticket ${S(r.ticket_promedio)} · ${Math.round(r.pct_con_descuento)} % con descuento`,
              }))}
            />
          </TarjetaGrafico>
        )}
        {d.alcance === 'todo' && (
          <TarjetaGrafico
            titulo="Comparación entre centros"
            subtitulo="Ingresos del periodo."
            tabla={{ columnas: ['Centro', 'Ventas', 'Ingresos'], filas: d.porCentro.map((r) => [r.centro, r.ventas, S(r.ingresos)]) }}
          >
            <BarrasH filas={d.porCentro.map((r) => ({ etiqueta: r.centro, valor: r.ingresos, texto: S(r.ingresos), detalle: `${r.ventas} ventas` }))} />
          </TarjetaGrafico>
        )}
        <TarjetaGrafico
          titulo="Cobros por método de pago"
          tabla={{ columnas: ['Método', 'Pagos', 'Monto'], filas: d.cobros.map((r) => [METODOS.find((m) => m.id === r.metodo)?.t ?? r.metodo, r.pagos, S(r.monto)]) }}
        >
          <BarrasH
            filas={d.cobros.map((r) => ({ etiqueta: METODOS.find((m) => m.id === r.metodo)?.t ?? r.metodo, valor: r.monto, texto: S(r.monto), detalle: `${r.pagos} pagos` }))}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="¿De dónde vienen los que compran?"
          subtitulo="Alumnos con venta en el periodo, por origen."
          tabla={{ columnas: ['Origen', 'Alumnos'], filas: d.origen.map((r) => [ORIGENES[r.origen] ?? r.origen, r.alumnos]) }}
        >
          <BarrasH filas={d.origen.map((r) => ({ etiqueta: ORIGENES[r.origen] ?? r.origen, valor: r.alumnos, texto: String(r.alumnos) }))} />
        </TarjetaGrafico>
      </div>
    </>
  );
}

function Comercial({ d }: { d: Datos }) {
  const e = d.crm.embudo;
  const etapas = [
    { k: 'nuevo', n: e.nuevo },
    { k: 'contactado', n: e.contactado },
    { k: 'interesado', n: e.interesado },
    { k: 'matriculado', n: e.matriculado },
  ] as const;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi hero v={`${pct(e.matriculado, e.nuevo)} %`} t={`Conversión: ${e.matriculado} de ${e.nuevo} prospectos se matricularon`} />
        <Kpi v={String(e.nuevo)} t="Prospectos nuevos en el periodo" />
        <Kpi v={e.dias_a_matricula ? `${e.dias_a_matricula.toFixed(1)} días` : '—'} t="Tiempo promedio hasta matricularse" />
        <Kpi v={String(e.perdido)} t="Prospectos perdidos" />
      </div>
      <div className="grid g2">
        <TarjetaGrafico
          titulo="Embudo de conversión"
          subtitulo="De los prospectos que llegaron en el periodo, cuántos alcanzaron cada etapa."
          tabla={{
            columnas: ['Etapa', 'Personas', '% del total', '% de la etapa anterior'],
            filas: etapas.map((s, i) => [ETAPAS[s.k], s.n, `${pct(s.n, e.nuevo)} %`, i === 0 ? '—' : `${pct(s.n, etapas[i - 1]!.n)} %`]),
          }}
        >
          <BarrasH
            max={Math.max(1, e.nuevo)}
            colores={[RAMPA_ORDINAL[0], RAMPA_ORDINAL[1], RAMPA_ORDINAL[3], RAMPA_ORDINAL[4]]}
            filas={etapas.map((s, i) => ({
              etiqueta: ETAPAS[s.k],
              valor: s.n,
              texto: `${s.n} · ${pct(s.n, e.nuevo)} %`,
              detalle: i === 0 ? `${s.n} prospectos` : `${pct(s.n, etapas[i - 1]!.n)} % pasó desde «${ETAPAS[etapas[i - 1]!.k]}»`,
            }))}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="Prospectos y matrículas por semana"
          tabla={{ columnas: ['Semana del', 'Prospectos', 'Matriculados'], filas: d.crm.semanas.map((r) => [fechaCorta(r.semana), r.prospectos, r.matriculados]) }}
        >
          <Columnas
            etiquetas={d.crm.semanas.map((r) => corto(r.semana))}
            series={[
              { nombre: 'Prospectos nuevos', valores: d.crm.semanas.map((r) => r.prospectos) },
              { nombre: 'Matriculados', valores: d.crm.semanas.map((r) => r.matriculados) },
            ]}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="Conversión por origen"
          subtitulo="Qué canal trae prospectos que sí se matriculan."
          tabla={{
            columnas: ['Origen', 'Prospectos', 'Matriculados', 'Conversión'],
            filas: d.crm.conversionOrigen.map((r) => [ORIGENES[r.origen] ?? r.origen, r.prospectos, r.matriculados, `${pct(r.matriculados, r.prospectos)} %`]),
          }}
        >
          <BarrasH
            max={100}
            filas={d.crm.conversionOrigen.map((r) => ({
              etiqueta: ORIGENES[r.origen] ?? r.origen,
              valor: pct(r.matriculados, r.prospectos),
              texto: `${pct(r.matriculados, r.prospectos)} % · ${r.matriculados}/${r.prospectos}`,
            }))}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="¿Por qué se pierden?"
          tabla={{ columnas: ['Motivo', 'Prospectos'], filas: d.crm.perdidas.map((r) => [r.motivo, r.n]) }}
        >
          <BarrasH filas={d.crm.perdidas.map((r) => ({ etiqueta: r.motivo, valor: r.n, texto: String(r.n) }))} color={SERIES[1]} />
        </TarjetaGrafico>
      </div>
      {d.crm.conversionVendedor.length > 0 && (
        <div className="tarjeta tabla-scroll" style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 10 }}>Seguimiento por vendedor</h2>
          <table className="tabla">
            <thead><tr><th>Vendedor</th><th className="num">Prospectos</th><th className="num">Matriculados</th><th className="num">Conversión</th><th className="num">Sin próximo paso</th></tr></thead>
            <tbody>
              {d.crm.conversionVendedor.map((r) => (
                <tr key={r.vendedor}>
                  <td>{r.vendedor}</td>
                  <td className="num">{r.prospectos}</td>
                  <td className="num">{r.matriculados}</td>
                  <td className="num">{pct(r.matriculados, r.prospectos)} %</td>
                  <td className="num">{r.sin_seguimiento > 0 ? <span className="chip alerta">{r.sin_seguimiento}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Operacion({ d }: { d: Datos }) {
  const horas = Array.from({ length: 7 }, (_, i) => 7 + i * 2);
  const valor = (fila: number, col: number) =>
    d.demanda.filter((r) => r.dow === fila + 1 && r.hora >= horas[col]! && r.hora < horas[col]! + 2).reduce((s, r) => s + r.clases, 0);
  const totalClases = d.demanda.reduce((s, r) => s + r.clases, 0);
  const usoTotal = d.ocupacion.reduce((s, r) => s + r.horas_uso, 0);
  const dispTotal = d.ocupacion.reduce((s, r) => s + r.horas_disponibles, 0);
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi hero v={`${pct(usoTotal, dispTotal)} %`} t="Ocupación de la flota" />
        <Kpi v={String(totalClases)} t="Clases en el periodo" />
        <Kpi v={`${Math.round(usoTotal)} h`} t="Horas de manejo" />
        <Kpi v={`${d.resumen.horas_vendidas} h`} t="Horas vendidas" />
      </div>
      <div className="grid g2">
        <TarjetaGrafico
          titulo="Uso de cada carro"
          subtitulo="Horas con clase entre las horas que atiende el centro."
          tabla={{
            columnas: ['Carro', 'Centro', 'Horas de uso', 'Horas disponibles', 'Ocupación'],
            filas: d.ocupacion.map((r) => [`${r.placa} (${TRANSMISION[r.transmision]})`, r.centro, r.horas_uso, r.horas_disponibles, `${r.pct} %`]),
          }}
        >
          <BarrasH
            max={100}
            filas={d.ocupacion.map((r) => ({
              etiqueta: `${r.placa} · ${TRANSMISION[r.transmision]}`,
              valor: r.pct,
              texto: `${r.pct} %`,
              detalle: `${r.centro} · ${r.horas_uso} h de ${r.horas_disponibles} h`,
            }))}
          />
        </TarjetaGrafico>
        <TarjetaGrafico
          titulo="¿Cuándo piden más clases?"
          subtitulo="Clases por día de la semana y franja de 2 horas. Útil para decidir si conviene otro carro."
          tabla={{
            columnas: ['Día', ...horas.map((h) => hhmm(h))],
            filas: DIAS.map((dia, f) => [dia, ...horas.map((_, c) => valor(f, c))]),
          }}
        >
          <MapaCalor
            filas={DIAS}
            columnas={horas.map((h) => `${h}–${h + 2}`)}
            valor={valor}
            formato={(n) => `${n} ${n === 1 ? 'clase' : 'clases'}`}
          />
        </TarjetaGrafico>
      </div>
    </>
  );
}

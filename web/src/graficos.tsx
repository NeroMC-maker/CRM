/**
 * Gráficos en SVG propio (sin librerías): marcas finas, rejilla tenue, tooltip al pasar el mouse
 * y una vista de tabla por gráfico. Paleta validada con el validador de dataviz:
 * serie 1 #2a78d6, serie 2 #eb6834, serie 3 #1baf7a; rampa ordinal azul #86b6ef→#0d366b.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
export const RAMPA_ORDINAL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'] as const;
const RAMPA_SEC = ['#f4f8fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => e && setAncho(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Números "limpios" para el eje. */
function ticks(max: number, n = 4): number[] {
  if (max <= 0) return [0, 1];
  const paso0 = max / n;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0) ?? paso0;
  const tope = Math.ceil(max / paso) * paso;
  return Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => +(i * paso).toFixed(6));
}
const compacto = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)} mil` : String(Math.round(n * 10) / 10));

/** Barra con extremo de datos redondeado (4px) y base recta. Horizontal. */
function barraH(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w, h / 2);
  if (w <= 0) return '';
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`;
}
/** Columna con tapa redondeada y base recta. */
function columna(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}v-${h - r}a${r},${r} 0 0 1 ${r},-${r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

// ------------------------------------------------------------------ Tarjeta con "ver tabla"

export function TarjetaGrafico(props: {
  titulo: string;
  subtitulo?: string;
  tabla: { columnas: string[]; filas: (string | number)[][] };
  children: ReactNode;
  accion?: ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className="tarjeta viz">
      <div className="g-cab">
        <div>
          <h2>{props.titulo}</h2>
          {props.subtitulo && <p>{props.subtitulo}</p>}
        </div>
        {props.accion}
        <button className="btn fantasma chico no-imprimir" onClick={() => setVerTabla((v) => !v)} aria-pressed={verTabla}>
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {verTabla ? (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>{props.tabla.columnas.map((c, i) => <th key={c} className={i > 0 ? 'num' : undefined}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {props.tabla.filas.map((f, i) => (
                <tr key={i}>{f.map((v, j) => <td key={j} className={j > 0 ? 'num' : undefined}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        props.children
      )}
    </section>
  );
}

function Leyenda({ items }: { items: { nombre: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="leyenda-g">
      {items.map((s) => (
        <span key={s.nombre}><i style={{ background: s.color }} />{s.nombre}</span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Línea en el tiempo

export function LineaTiempo(props: {
  etiquetas: string[]; // texto para el eje x y el tooltip
  series: { nombre: string; valores: number[]; color?: string }[];
  formato: (n: number) => string;
  alto?: number;
  area?: boolean;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const alto = props.alto ?? 220;
  const m = { t: 12, r: 16, b: 26, l: 52 };
  const n = props.etiquetas.length;
  const max = Math.max(1, ...props.series.flatMap((s) => s.valores));
  const ts = ticks(max);
  const tope = ts.at(-1)!;
  const w = ancho - m.l - m.r;
  const h = alto - m.t - m.b;
  const x = (i: number) => m.l + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => m.t + h - (v / tope) * h;
  const cadaX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))));
  const series = props.series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i]! }));

  return (
    <div className="grafico" ref={ref}>
      <Leyenda items={series} />
      <svg
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - r.left;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / w) * (n - 1)))));
        }}
        role="img"
        aria-label={series.map((s) => s.nombre).join(', ')}
      >
        {ts.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'base' : 'rejilla'} x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} />
            <text className="eje" x={m.l - 8} y={y(t) + 4} textAnchor="end">{props.formato(t)}</text>
          </g>
        ))}
        {props.etiquetas.map((e, i) =>
          i % cadaX === 0 ? (
            <text key={i} className="eje" x={x(i)} y={alto - 6} textAnchor="middle">{e}</text>
          ) : null,
        )}
        {series.map((s, si) => {
          const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
          return (
            <g key={s.nombre}>
              {props.area && si === 0 && n > 1 && (
                <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity={0.1} />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {n > 0 && <circle cx={x(n - 1)} cy={y(s.valores[n - 1] ?? 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />}
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + h} stroke="#c3c2b7" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.nombre} cx={x(hover)} cy={y(s.valores[hover] ?? 0)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: x(hover), top: m.t + 18 }}>
          <strong>{props.etiquetas[hover]}</strong>
          {series.map((s) => (
            <div key={s.nombre} className="fila-t">
              <i style={{ background: s.color }} />
              {s.nombre}: <b>{props.formato(s.valores[hover] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Barras horizontales

export function BarrasH(props: {
  filas: { etiqueta: string; valor: number; texto: string; detalle?: string }[];
  max?: number;
  color?: string;
  colores?: string[]; // uno por fila (p. ej. rampa ordinal del embudo)
  sufijoEje?: (n: number) => string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (props.filas.length === 0) return <div className="suave chico">Sin datos en el periodo.</div>;
  const alto_fila = 34;
  const grosor = 18;
  const etqAncho = Math.min(170, Math.max(90, ancho * 0.3));
  const valAncho = 96;
  const w = Math.max(40, ancho - etqAncho - valAncho - 8);
  const max = props.max ?? Math.max(1, ...props.filas.map((f) => f.valor));
  const alto = props.filas.length * alto_fila + 4;
  return (
    <div className="grafico" ref={ref}>
      <svg height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" onMouseLeave={() => setHover(null)}>
        <line className="base" x1={etqAncho} x2={etqAncho} y1={0} y2={alto} />
        {props.filas.map((f, i) => {
          const yy = i * alto_fila + (alto_fila - grosor) / 2;
          const bw = (Math.max(0, f.valor) / max) * w;
          const color = props.colores?.[i] ?? props.color ?? SERIES[0];
          return (
            <g key={f.etiqueta} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={i * alto_fila} width={ancho} height={alto_fila} fill={hover === i ? '#eff6ff' : 'transparent'} />
              <text className="etq" x={etqAncho - 8} y={yy + grosor / 2 + 4} textAnchor="end">
                {f.etiqueta.length > 24 ? `${f.etiqueta.slice(0, 23)}…` : f.etiqueta}
              </text>
              <path d={barraH(etqAncho, yy, Math.max(bw, f.valor > 0 ? 2 : 0), grosor)} fill={color} />
              <text className="valor" x={etqAncho + bw + 8} y={yy + grosor / 2 + 4}>{f.texto}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && props.filas[hover]?.detalle && (
        <div className="tooltip" style={{ left: etqAncho + w / 2, top: hover * alto_fila + 6 }}>
          <strong>{props.filas[hover]!.etiqueta}</strong>
          {props.filas[hover]!.detalle}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Barra 100 % apilada (parte del todo, ≤ 3 partes)

export function Apilada(props: { partes: { nombre: string; valor: number; texto: string }[] }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = props.partes.reduce((s, p) => s + p.valor, 0);
  if (total === 0) return <div className="suave chico">Sin datos en el periodo.</div>;
  const alto = 40;
  let x = 0;
  const segs = props.partes.map((p, i) => {
    const w = (p.valor / total) * ancho;
    const s = { ...p, x, w, color: SERIES[i]!, pct: Math.round((100 * p.valor) / total) };
    x += w;
    return s;
  });
  return (
    <div className="grafico" ref={ref}>
      <Leyenda items={segs.map((s) => ({ nombre: `${s.nombre} · ${s.pct} %`, color: s.color }))} />
      <svg height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" onMouseLeave={() => setHover(null)}>
        {segs.map((s, i) => {
          const gap = i < segs.length - 1 ? 2 : 0; // 2px de superficie entre segmentos
          const w = Math.max(0, s.w - gap);
          const cabe = w > 46;
          return (
            <g key={s.nombre} onMouseEnter={() => setHover(i)}>
              <rect x={s.x} y={0} width={w} height={alto} rx={i === 0 || i === segs.length - 1 ? 4 : 0} fill={s.color} />
              {cabe && (
                <text x={s.x + w / 2} y={alto / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                  {s.pct} %
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: segs[hover]!.x + segs[hover]!.w / 2, top: 34 }}>
          <strong>{segs[hover]!.nombre}</strong>
          {segs[hover]!.texto}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Columnas agrupadas (2 series)

export function Columnas(props: { etiquetas: string[]; series: { nombre: string; valores: number[] }[]; alto?: number }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const alto = props.alto ?? 220;
  const m = { t: 12, r: 8, b: 26, l: 36 };
  const n = props.etiquetas.length;
  const max = Math.max(1, ...props.series.flatMap((s) => s.valores));
  const ts = ticks(max, 4);
  const tope = ts.at(-1)!;
  const w = ancho - m.l - m.r;
  const h = alto - m.t - m.b;
  const banda = w / Math.max(1, n);
  const k = props.series.length;
  const grosor = Math.min(24, (banda * 0.7 - 2 * (k - 1)) / k);
  const y = (v: number) => m.t + h - (v / tope) * h;
  const cadaX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 60))));
  return (
    <div className="grafico" ref={ref}>
      <Leyenda items={props.series.map((s, i) => ({ nombre: s.nombre, color: SERIES[i]! }))} />
      <svg height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" onMouseLeave={() => setHover(null)}>
        {ts.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'base' : 'rejilla'} x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} />
            <text className="eje" x={m.l - 6} y={y(t) + 4} textAnchor="end">{compacto(t)}</text>
          </g>
        ))}
        {props.etiquetas.map((e, i) => {
          const x0 = m.l + i * banda + (banda - (k * grosor + 2 * (k - 1))) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={m.l + i * banda} y={m.t} width={banda} height={h} fill={hover === i ? '#eff6ff' : 'transparent'} />
              {props.series.map((s, si) => (
                <path key={s.nombre} d={columna(x0 + si * (grosor + 2), y(s.valores[i] ?? 0), grosor, y(0) - y(s.valores[i] ?? 0))} fill={SERIES[si]} />
              ))}
              {i % cadaX === 0 && <text className="eje" x={m.l + i * banda + banda / 2} y={alto - 6} textAnchor="middle">{e}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: m.l + hover * banda + banda / 2, top: m.t + 18 }}>
          <strong>{props.etiquetas[hover]}</strong>
          {props.series.map((s, si) => (
            <div key={s.nombre} className="fila-t"><i style={{ background: SERIES[si] }} />{s.nombre}: <b>{s.valores[hover] ?? 0}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Mapa de calor (día × hora)

export function MapaCalor(props: {
  filas: string[];
  columnas: string[];
  valor: (fila: number, col: number) => number;
  formato: (n: number) => string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [hover, setHover] = useState<[number, number] | null>(null);
  const etq = 40;
  const celdaW = (ancho - etq) / props.columnas.length;
  const celdaH = 28;
  const alto = props.filas.length * celdaH + 22;
  let max = 0;
  props.filas.forEach((_, f) => props.columnas.forEach((_, c) => (max = Math.max(max, props.valor(f, c)))));
  // 0 → el tono más claro; el resto se reparte en 7 pasos de la rampa azul (claro → oscuro).
  const color = (v: number) => RAMPA_SEC[v <= 0 ? 0 : 1 + Math.min(6, Math.floor((v / Math.max(1, max)) * 6.999))]!;
  return (
    <div className="grafico" ref={ref}>
      <svg height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" onMouseLeave={() => setHover(null)}>
        {props.columnas.map((c, ci) => (
          <text key={c} className="eje" x={etq + ci * celdaW + celdaW / 2} y={12} textAnchor="middle">{c}</text>
        ))}
        {props.filas.map((f, fi) => (
          <g key={f}>
            <text className="etq" x={etq - 8} y={20 + fi * celdaH + celdaH / 2 + 3} textAnchor="end">{f}</text>
            {props.columnas.map((_, ci) => {
              const v = props.valor(fi, ci);
              return (
                <rect
                  key={ci}
                  x={etq + ci * celdaW + 1}
                  y={20 + fi * celdaH + 1}
                  width={Math.max(0, celdaW - 2)}
                  height={celdaH - 2}
                  rx={3}
                  fill={color(v)}
                  onMouseEnter={() => setHover([fi, ci])}
                />
              );
            })}
          </g>
        ))}
      </svg>
      <div className="escala">
        Menos <span className="rampa">{RAMPA_SEC.map((c) => <span key={c} style={{ background: c }} />)}</span> Más (máx. {props.formato(max)})
      </div>
      {hover && (
        <div className="tooltip" style={{ left: etq + hover[1] * celdaW + celdaW / 2, top: 20 + hover[0] * celdaH }}>
          <strong>{props.filas[hover[0]]} · {props.columnas[hover[1]]}</strong>
          {props.formato(props.valor(hover[0], hover[1]))}
        </div>
      )}
    </div>
  );
}

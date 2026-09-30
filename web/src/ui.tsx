import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorApi } from './api';

// ---- Avisos flotantes
type Toast = { id: number; texto: string; tipo: 'ok' | 'error' };
const ToastCtx = createContext<(texto: string, tipo?: Toast['tipo']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const avisar = useCallback((texto: string, tipo: Toast['tipo'] = 'ok') => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} className={`toast ${t.tipo === 'error' ? 'error' : ''}`}>
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useAviso = () => useContext(ToastCtx);

export function mensajeError(e: unknown): string {
  if (e instanceof ErrorApi) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error.';
}

// ---- Modal accesible (Esc cierra)
export function Modal(props: { titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode; ancho?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.onCerrar();
    window.addEventListener('keydown', h);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [props.onCerrar]);
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && props.onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.titulo} ref={ref} style={props.ancho ? { width: `min(${props.ancho}px, 100%)` } : undefined}>
        <div className="modal-cab">
          <h2>{props.titulo}</h2>
          <button className="btn fantasma" onClick={props.onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-cuerpo">{props.children}</div>
        {props.pie && <div className="modal-pie">{props.pie}</div>}
      </div>
    </div>
  );
}

export function Campo(props: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="campo">
      {props.etiqueta}
      {props.children}
      {props.ayuda && <span className="suave chico" style={{ fontWeight: 400 }}>{props.ayuda}</span>}
    </label>
  );
}

export function ErrorCaja({ error }: { error: unknown }) {
  if (!error) return null;
  const detalles = error instanceof ErrorApi ? error.detalles : undefined;
  return (
    <div className="aviso error">
      {mensajeError(error)}
      {detalles && detalles.length > 1 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {detalles.slice(1).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Atajo de teclado global. `combo`: 'F2', 'ctrl+Enter', 'Alt+n'… */
export function useAtajo(combo: string, fn: (e: KeyboardEvent) => void, activo = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!activo) return;
    const partes = combo.toLowerCase().split('+');
    const tecla = partes.pop()!;
    const h = (e: KeyboardEvent) => {
      if (partes.includes('ctrl') !== (e.ctrlKey || e.metaKey)) return;
      if (partes.includes('alt') !== e.altKey) return;
      if (partes.includes('shift') !== e.shiftKey) return;
      if (e.key.toLowerCase() !== tecla) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [combo, activo]);
}

/** ¿El foco está en un campo de texto? (para no robar teclas numéricas al escribir) */
export function escribiendo(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

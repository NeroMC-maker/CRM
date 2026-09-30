import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ErrorApi, type Centro, type Yo } from './api';

const SesionCtx = createContext<Yo | null>(null);

export function useYo(): Yo {
  const yo = useContext(SesionCtx);
  if (!yo) throw new Error('useYo fuera de sesión');
  return yo;
}

export function usePuede() {
  const yo = useYo();
  return (accion: string) => yo.permisos.includes(accion);
}

export function RequiereSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const loc = useLocation();
  const q = useQuery({ queryKey: ['yo'], queryFn: () => api.get<Yo>('/auth/yo'), retry: false, staleTime: 60_000 });
  useEffect(() => {
    const h = () => qc.invalidateQueries({ queryKey: ['yo'] });
    window.addEventListener('sesion-expirada', h);
    return () => window.removeEventListener('sesion-expirada', h);
  }, [qc]);
  if (q.isLoading) return <div className="vacio">Cargando…</div>;
  if (q.error instanceof ErrorApi && q.error.status === 401) {
    return <Navigate to="/entrar" replace state={{ desde: loc.pathname + loc.search }} />;
  }
  if (!q.data) return <div className="vacio">No se pudo conectar con el servidor.</div>;
  return <SesionCtx.Provider value={q.data}>{children}</SesionCtx.Provider>;
}

/** Centros (cambian poco): caché compartida. */
export function useCentros() {
  return useQuery({ queryKey: ['centros'], queryFn: () => api.get<Centro[]>('/centros'), staleTime: 5 * 60_000 }).data ?? [];
}

/** Centro con el que trabaja el usuario (se recuerda en este navegador). */
export function centroPreferido(yo: Yo, centros: Centro[]): string {
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem('tl-centro');
  } catch {
    /* sin almacenamiento */
  }
  if (guardado && centros.some((c) => c.id === guardado)) return guardado;
  return yo.centroId ?? centros[0]?.id ?? '';
}
export function recordarCentro(id: string) {
  try {
    localStorage.setItem('tl-centro', id);
  } catch {
    /* sin almacenamiento */
  }
}

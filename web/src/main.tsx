import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './estilos.css';
import './estilos-crm.css';
import { Layout } from './Layout';
import { AlumnoDetalle, Alumnos } from './paginas/Alumnos';
import { Ajustes } from './paginas/Ajustes';
import { Analisis } from './paginas/Analisis';
import { Calendario } from './paginas/Calendario';
import { Flota } from './paginas/Flota';
import { Hoy } from './paginas/Hoy';
import { Imprimir } from './paginas/Imprimir';
import { Instructores } from './paginas/Instructores';
import { Login } from './paginas/Login';
import { PorAsignar } from './paginas/PorAsignar';
import { Productos } from './paginas/Productos';
import { Prospectos } from './paginas/Prospectos';
import { VentaRapida } from './paginas/VentaRapida';
import { RequiereSesion } from './sesion';
import { ToastProvider } from './ui';

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1, staleTime: 10_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<Login />} />
            <Route
              path="/imprimir"
              element={
                <RequiereSesion>
                  <Imprimir />
                </RequiereSesion>
              }
            />
            <Route
              element={
                <RequiereSesion>
                  <Layout />
                </RequiereSesion>
              }
            >
              <Route index element={<Navigate to="/hoy" replace />} />
              <Route path="/hoy" element={<Hoy />} />
              <Route path="/venta" element={<VentaRapida />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route path="/por-asignar" element={<PorAsignar />} />
              <Route path="/prospectos" element={<Prospectos />} />
              <Route path="/alumnos" element={<Alumnos />} />
              <Route path="/alumnos/:id" element={<AlumnoDetalle />} />
              <Route path="/analisis" element={<Analisis />} />
              <Route path="/flota" element={<Flota />} />
              <Route path="/instructores" element={<Instructores />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="*" element={<Navigate to="/hoy" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

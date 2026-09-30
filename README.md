# CRM — Tulicencia.com.pe

Sistema interno de la escuela de manejo: venta rápida, calendario de clases sin cruces, flota, instructores, alumnos, pagos y análisis. Fondos blancos y azul de la marca (#1e3a8a).

Diseño completo en [docs/](docs/especificacion.md).

## Qué incluye este MVP

| Módulo | Qué hace |
|---|---|
| **Hoy** | Inicio del día: seguimientos vencidos o de hoy, clases de hoy, saldos por cobrar, documentos de carros por vencer |
| **Prospectos (CRM)** | Tablero por etapas (Nuevo → Contactado → Interesado → Matriculado / Perdido) con arrastrar y soltar o botón "Avanzar". Cada prospecto muestra su próximo paso; vender lo matricula solo |
| **Ficha del alumno** | Seguimiento comercial (WhatsApp, llamada, visita, nota, tareas con fecha), historial de etapas, paquetes con progreso, ventas con saldo y clases |
| **Venta rápida (carrito)** | Varios productos en una venta (p. ej. paquete + examen médico) y **recarga de horas** a un paquete existente. Todo con teclado (`F2`, `F4`, `1`–`9`, `⌫`, `Alt+1`–`5`, `Ctrl+Enter`); una sola transacción |
| **Calendario** | Vistas **día** (columnas = carros, línea de la hora actual), **semana** y **mes** (clases y ocupación por día). Clases de 2 h. **Los cruces de carro, instructor o alumno los impide la base de datos**. Se actualiza solo cada 5 s |
| **Buscador global** | `Ctrl+K` desde cualquier pantalla; `?` muestra todos los atajos |
| **Por asignar instructor** | El horario se reserva primero; el instructor se asigna después (solo se ofrecen los libres a esa hora). No se puede marcar "realizada" sin instructor |
| **Imprimir / PDF** | Horarios del día o semana agrupados por día, carro o instructor. Se generan en el navegador |
| **Alumnos** | Ficha con paquetes, horas agendadas/compradas, saldo, cobros parciales e historial de clases |
| **Flota** | Agregar/editar carros, estado (activo, mantenimiento, baja), vencimiento de SOAT y revisión técnica con aviso a 30 días. Un carro vencido o en mantenimiento no se puede agendar |
| **Productos y ofertas** | Paquetes de 2 a 12 h, ofertas con vigencia. Solo Admin cambia precios; un vendedor no puede aplicar descuentos fuera de oferta |
| **Análisis (gráficos)** | Tres pestañas. **Ventas:** ventas y cobros por día, producto más vendido, regular vs oferta vs descuento, vendedores, centros, métodos de pago. **Comercial:** embudo de conversión, prospectos vs matrículas por semana, conversión por origen, motivos de pérdida, seguimiento por vendedor. **Operación:** uso de cada carro y mapa de calor de demanda (día × franja). Cada gráfico tiene tooltip y "Ver tabla" |
| **Usuarios y centros** | Roles: Propietario, Administrador, Vendedor, Instructor. Horario de cada centro. Auditoría de cambios |

Aún no incluye: WhatsApp (Entrega 3), importación del Excel (falta ver el archivo), retención temporal de horarios.

## Cómo correrlo

Requisitos: Node 22+ y pnpm.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Edita `SEED_OWNER_PASSWORD` en `.env`. Luego, en una terminal:

```bash
pnpm db
```

Y en otra (solo la primera vez):

```bash
pnpm db:migrate
```

```bash
pnpm seed --demo
```

Después, arranca la API y la web:

```bash
pnpm dev
```

(`pnpm dev` también levanta la base; si ya la tienes corriendo con `pnpm db`, usa `pnpm api` y `pnpm web` por separado.)

Abre http://localhost:3200 y entra con `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`. También existe `vendedor@tulicencia.com.pe` con la misma contraseña para probar el rol Vendedor.

`--demo` carga 8 alumnos con ventas y clases de ejemplo. Placas, instructores y precios distintos de 4 h (S/ 212) y 10 h (S/ 599) son **de ejemplo**: cámbialos desde la app.

### Cargar el horario real del Excel como datos de prueba

En Google Sheets: Archivo → Descargar → CSV de la hoja del mes. Luego, con la base vacía y `pnpm seed` (sin `--demo`):

```bash
pnpm importar:excel "C:\ruta\Horarios Tulicencia.com 2026 - Septiembre 2026.csv"
```

Eso solo simula y muestra lo que entendió. Para guardar, agrega `--guardar`. Lo que no pudo interpretar queda en `.data/importacion-reporte.txt` (esa carpeta no se sube a git: contiene datos de alumnos).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm test` | Pruebas de reglas (precios, reservas, roles) y la prueba de reservas simultáneas contra la base |
| `pnpm typecheck` | Revisión de tipos |
| `pnpm db:generate` | Tras cambiar `core/db/schema.ts` |
| `pnpm build` | Web estática en `dist/` |

## Estructura

```
core/      reglas de negocio (única fuente de verdad)
  domain/    roles, precios, agenda (validación de reservas), tiempo de Lima
  services/  ventas, clases, análisis (SQL)
  db/        esquema Drizzle y migraciones (0001 = restricciones sin cruces)
server/    API Hono (misma app para Node y Cloudflare Workers)
web/       React + Vite (SPA estática)
scripts/   Postgres embebido, migraciones, datos iniciales
docs/      diseño, permisos, costos, decisiones
```

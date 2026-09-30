# CRM Tulicencia — instrucciones para Claude

Lee `docs/especificacion.md` y `docs/decisiones.md` antes de cambiar comportamiento. Registra decisiones nuevas en `docs/decisiones.md`.

## Reglas

- Interfaz, mensajes y documentación en español (Perú). Montos en soles; horas en Lima (UTC-5, sin horario de verano) vía `core/domain/tiempo.ts`.
- Las reglas de negocio viven en `core/`. La API (`server/`) y la web solo las llaman; no dupliques permisos ni validaciones.
  - Permisos por rol: `core/domain/roles.ts` (se validan en el servidor; ocultar un botón no autoriza).
  - Validación de reservas: `core/domain/agenda.ts`. Los cruces los garantiza Postgres (`EXCLUDE` en `core/db/migrations/0001_sin_cruces.sql`), no el código.
  - Precios: `core/domain/precios.ts`. Cada venta guarda precio regular y cobrado.
- Venta + paquete + pago van en una sola transacción (`core/services/ventas.ts`).
- Costo de operación ≈ $0: nada de sondeos a la base más frecuentes que el calendario (5 s, solo con la pestaña visible); PDF y Excel en el navegador; análisis en SQL.
- Colores: fondo blanco, azul de marca `#1e3a8a` (variables en `web/src/estilos.css`).

## Comandos

- `pnpm db` (Postgres embebido, puerto 54330) · `pnpm api` (8787) · `pnpm web` (3200) · `pnpm dev` (los tres)
- `pnpm test` y `pnpm typecheck` deben pasar antes de dar un cambio por terminado.
- Tras cambiar `core/db/schema.ts`: `pnpm db:generate` y `pnpm db:migrate`.

## Windows

- El Postgres embebido se inicializa con `--encoding=UTF8 --locale=C`.
- `pnpm-workspace.yaml` autoriza los scripts de instalación de `@embedded-postgres/windows-x64` y `esbuild`.

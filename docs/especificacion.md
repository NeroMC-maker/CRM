# CRM — Escuela de manejo — Especificación

Documento de diseño. Todavía no hay código: esto define qué construimos y cómo se organiza.
Relacionados: [permisos.md](permisos.md) · [costos.md](costos.md) · [decisiones.md](decisiones.md)

## 1. Objetivo y alcance

Sistema interno para una **escuela de manejo en Perú**, con **máximo 5 usuarios** (vendedores y administración). Tiene 4 objetivos:

1. **WhatsApp en un solo lugar:** todos los mensajes de los 5 números llegan al CRM mediante la API de Meta, que es la **única API externa**. **No hay bot: siempre responde una persona.**
2. **Cuadrar horarios:** reemplazar el Excel actual con un calendario de clases (alumno + instructor + carro) que **no permite cruces**.
3. **Flota:** los carros disponibles, con la opción de agregar más, bloquearlos por mantenimiento y avisar vencimientos (SOAT, revisión técnica).
4. **Ventas y análisis:** qué producto se vende más, a precio regular o en oferta, ingresos, uso de la flota, ventas por vendedor y clientes.

Prioridad transversal: **costo mensual de operación lo más cercano a $0** (ver [costos.md](costos.md)).

Fuera de alcance por ahora: facturación electrónica SUNAT, app móvil nativa (la web es responsive), bot o respuestas automáticas.

## 2. Módulos

| # | Módulo | Qué hace | Fase |
|---|--------|----------|------|
| 1 | **Bandeja de WhatsApp** | Chats de los 5 números en tiempo real (texto, fotos, audios, documentos). Cada vendedor ve el suyo; se responde desde el CRM | MVP 3 |
| 2 | **Alumnos (contactos)** | Ficha: DNI, teléfono, categoría de licencia que busca, origen, vendedor, historial de chats, compras y clases | MVP 1 |
| 3 | **Flota** | Carros: placa, marca y modelo, **mecánico o automático**, categoría, estado (activo, mantenimiento, baja), vencimiento de **SOAT** y **revisión técnica** con aviso. **Agregar carros** desde la interfaz | MVP 1 |
| 4 | **Instructores** | Nombre, licencia, categorías que enseña, días y horas disponibles, vacaciones | MVP 1 |
| 5 | **Calendario de clases** | Vista por día y semana, por carro o por instructor. Se agenda una clase eligiendo alumno, horario, instructor y carro; el sistema **solo ofrece los libres**. Estados: programada, realizada, cancelada, no asistió. Clases del paquete: "3 de 10" | MVP 1 |
| 6 | **Imprimir horarios en PDF** | Horario del día o de la semana por carro, por instructor o general, listo para imprimir. Se genera **en el navegador** (sin costo de servidor) | MVP 1 |
| 7 | **Importar el Excel actual** | Cargar los calendarios, alumnos y carros que hoy están en Excel, con vista previa y detección de errores antes de guardar | MVP 1 |
| 8 | **Productos y ofertas** | Catálogo (curso completo, clases sueltas, examen simulacro, trámite de licencia…) con **precio regular**. Ofertas con precio y vigencia | MVP 2 |
| 9 | **Ventas y pagos** | Venta = alumno + producto + vendedor + **precio regular** + **precio cobrado** + oferta aplicada. Pagos en partes (efectivo, Yape, Plin, transferencia, tarjeta), saldo pendiente. Al vender un paquete se habilitan sus clases para agendar | MVP 2 |
| 10 | **Análisis** | Ver sección 3 | MVP 2 (básico) → Fase 2 |
| 11 | **Usuarios, roles y auditoría** | Alta y baja de usuarios, rol, registro de quién cambió qué (sobre todo precios y descuentos) | MVP 1 |
| 12 | **Control de costos de WhatsApp** | Respuestas gratis restantes por número, gasto del mes, tope | MVP 3 |
| 13 | Plantillas de WhatsApp | Recordatorio de clase para mañana, confirmación de pago, promociones | Fase 2 |
| — | Correo, IA, facturación SUNAT | Descartado por ahora | Futuro |

## 3. Análisis (tablero)

Todos los indicadores se filtran por rango de fechas y los calcula la base de datos (consultas SQL). Así el servidor trabaja poco y el costo se mantiene en $0.

| Pregunta | Indicadores |
|----------|-------------|
| **¿Qué producto se vende más?** | Unidades e ingresos por producto; ranking del mes; tendencia mensual |
| **¿Precio regular u oferta?** | % de ventas a precio regular / con oferta / con descuento manual; descuento promedio; ingreso "dejado de cobrar" frente al precio regular; qué oferta vendió más |
| **Ventas por vendedor** | Ventas, ingresos y ticket promedio por vendedor; **conversión de chats a ventas**; tiempo de primera respuesta en WhatsApp; % de ventas con descuento por vendedor |
| **Ingresos** | Cobrado vs vendido (saldo pendiente); por mes, producto y método de pago |
| **Uso de la flota** | **% de ocupación por carro** (horas con clase / horas disponibles); horas muertas; carros más y menos usados; mecánicos vs automáticos; días en mantenimiento |
| **Instructores** | Clases dictadas, cancelaciones, inasistencias de alumnos |
| **Clientes** | De dónde llegan (origen); alumnos nuevos por mes; alumnos que vuelven a comprar; **horarios y días con más demanda** (para decidir si conviene otro carro) |

Todos los reportes se pueden **imprimir o guardar en PDF** igual que los horarios.

## 4. Modelo de datos (borrador)

Todas las tablas llevan `id` (uuid), `created_at`, `updated_at` y, donde aplica, `deleted_at` (borrado lógico). Montos en soles (PEN) como `numeric(10,2)`.

```
-- Personas
usuarios         (nombre, email, rol, activo, ultimo_acceso)
alumnos          (nombres, apellidos, dni, telefono, whatsapp, fecha_nacimiento,
                  categoria_buscada, origen: whatsapp|referido|facebook|local|otro,
                  vendedor_id, consentimiento_marketing, notas)
instructores     (nombres, dni, telefono, licencia, categorias[], activo, usuario_id NULL)

-- Flota y calendario
vehiculos        (placa UNIQUE, marca, modelo, anio, transmision: mecanica|automatica,
                  categoria, color, estado: activo|mantenimiento|baja,
                  soat_vence, revision_tecnica_vence, foto_r2_key, notas)
disponibilidad   (instructor_id | vehiculo_id, dia_semana, hora_inicio, hora_fin)  -- horario base semanal
bloqueos         (instructor_id | vehiculo_id, inicio, fin, motivo: mantenimiento|vacaciones|otro)
clases           (alumno_id, venta_id, instructor_id, vehiculo_id, inicio, fin,
                  numero_en_paquete, estado: programada|realizada|cancelada|no_asistio,
                  observaciones_instructor, creada_por)
  -- Restricción en la base: EXCLUDE USING gist para que un carro o un instructor
  -- nunca tenga dos clases superpuestas (aunque dos vendedores agenden a la vez).

-- Productos y ventas
productos        (nombre, tipo: paquete|clase_suelta|simulacro|tramite|otro,
                  clases_incluidas, duracion_clase_min, precio_regular, activo)
ofertas          (producto_id, nombre, precio_oferta, vigente_desde, vigente_hasta, activa)
ventas           (alumno_id, producto_id, vendedor_id, fecha,
                  precio_regular   -- copiado al vender: el análisis no cambia si luego sube el precio,
                  precio_cobrado, oferta_id NULL,
                  tipo_precio: regular|oferta|descuento_manual, descuento_autorizado_por NULL,
                  conversacion_id NULL  -- chat de origen, para medir conversión,
                  estado: activa|anulada)
pagos            (venta_id, monto, metodo: efectivo|yape|plin|transferencia|tarjeta,
                  fecha, registrado_por, comprobante_r2_key NULL)

-- WhatsApp
numeros_whatsapp (phone_number_id, numero, nombre_visible, usuario_id, coexistencia, activo)
conversaciones   (numero_whatsapp_id, alumno_id, asignado_a, estado: abierta|pendiente|resuelta,
                  ultimo_mensaje_cliente_en, primera_respuesta_en, no_leidos)
mensajes         (conversacion_id, wa_message_id UNIQUE, direccion, origen: crm|app_celular|historial,
                  tipo, cuerpo, media_r2_key, estado, categoria_cobro, enviado_por, fecha_whatsapp)
plantillas       (nombre, idioma, categoria, cuerpo, variables[], estado_meta)

-- Control
uso_api          (servicio, numero_whatsapp_id, usuario_id, categoria, costo_estimado_usd, wa_message_id, fecha)
topes_api        (servicio, tope_mensual_usd, alerta_en_pct)
auditoria        (usuario_id, accion, entidad, entidad_id, antes jsonb, despues jsonb, fecha)
```

Reglas clave:
- **Sin cruces:** los choques de carro o de instructor los impide la propia base de datos, no solo la pantalla.
- Solo se agenda si el carro está activo, no está bloqueado y tiene **SOAT y revisión técnica vigentes** en la fecha de la clase.
- Cada venta guarda el **precio regular del momento** y el **precio cobrado**. Así el análisis de regular vs oferta es exacto.
- Un descuento fuera de una oferta vigente requiere autorización de un Admin o del Propietario y queda en la auditoría.
- Nunca se borra físicamente desde la interfaz: se anula o se usa `deleted_at`.

### Importación desde Excel

Primero hay que revisar el archivo actual para mapear sus columnas. El flujo:
1. Se sube el `.xlsx` y se lee en el navegador (sin costo de servidor).
2. Se relaciona cada columna con un campo del sistema (fecha, hora, alumno, instructor, placa…).
3. Vista previa con errores marcados: placa desconocida, cruce de horario, fecha inválida.
4. Se confirma y se guarda todo junto, o nada si hay errores.

## 5. Integración con WhatsApp (Meta Cloud API)

### Cómo llegan los mensajes

```
Cliente escribe ─► Meta ─► POST /api/webhooks/whatsapp (Cloudflare)
                              │ 1. verifica la firma X-Hub-Signature-256
                              │ 2. guarda el mensaje (idempotente por wa_message_id)
                              │ 3. si trae foto/audio/doc: lo descarga y lo sube a R2
                              ▼
                       Neon (Postgres) ─► bandeja del CRM se actualiza
```

- **Webhook, no sondeo.** Meta nos avisa de cada mensaje y de cada cambio de estado (enviado, entregado, leído). Así no hay procesos consultando cada minuto y Neon puede seguir en el plan gratis.
- **Archivos:** Meta entrega un `media_id` cuya URL de descarga expira en minutos, así que se descargan de inmediato y se guardan en R2.
- **Responder:** dentro de las 24 h desde el último mensaje del cliente se escribe texto libre. Fuera de esa ventana solo se pueden enviar **plantillas aprobadas**. El CRM debe mostrar la ventana abierta o cerrada en cada chat.

### Coexistencia: seguir usando el celular y traer el historial

Meta permite usar **el mismo número** en la app WhatsApp Business del celular y en la API ("coexistence"):

- Al conectar se pueden importar **hasta 6 meses de historial** de chats individuales (1:1). Es una sola vez y requiere aprobarlo desde el celular.
- Lo que se responda desde el celular también llega al CRM, porque Meta manda una copia por webhook (`smb_message_echoes`).
- **No se sincronizan:** grupos, llamadas, estados ni mensajes que desaparecen.
- Según los proveedores, hay que abrir la app del celular periódicamente para no perder la conexión. Hay que confirmar la regla exacta al conectar.
- La conexión se hace por **Embedded Signup** de Meta. Puede requerir registrarse como Tech Provider o usar un proveedor (BSP). Lo verificamos al implementar.

**Sin coexistencia**, el número pasa a ser solo API: se deja de usar en el celular y no se trae historial.

### Un número por vendedor

- Los 5 números se registran en **una sola cuenta de WhatsApp Business de la empresa**. Un solo webhook recibe todo, y cada mensaje trae el `phone_number_id` que indica a qué vendedor le llegó.
- Una conversación = un cliente + un número. Si un cliente le escribe a dos vendedores, aparecen dos conversaciones en la misma ficha de contacto, para que se vea que ya lo atiende otro.
- Cada vendedor ve y responde **solo los chats de su número**. El Admin y el Propietario ven todos.
- Si un vendedor falta o se va, sus chats se pueden reasignar a otra persona para que responda **desde el mismo número**, porque el número es de la empresa en Meta.
- Cada número usa la app **WhatsApp Business** en el celular del vendedor (coexistencia). Si hoy usan WhatsApp normal, primero hay que pasarlo a WhatsApp Business; los chats se conservan.

> ⚠️ **Números personales:** la importación de historial trae **todos** los chats individuales de los últimos 6 meses, también los personales (familia, amigos). A partir de ahí, cada chat nuevo también llega al CRM. Si los números son personales de cada vendedor, conviene usar **números nuevos de la empresa** o no importar el historial.

### Requisitos para conectar

1. Cuenta de **Meta Business** **verificada** (RUC y documentos de la empresa). Sin verificar solo se permiten 2 números.
2. Una **app en Meta for Developers** con el producto WhatsApp.
3. Los 5 números, cada uno en la app WhatsApp Business.
4. Un **dominio con HTTPS** para el webhook (lo da Cloudflare).
5. Un token de sistema permanente, guardado como variable de entorno.

## 6. Arquitectura propuesta

Objetivo: **$0/mes de alojamiento**. Por eso no usamos Next.js en el servidor. Usamos una app web estática y una API liviana, que caben en los planes gratuitos de Cloudflare (ver [costos.md](costos.md)).

```
CRM/
├─ apps/
│  ├─ web/                 React + Vite (SPA estática) — interfaz
│  │  └─ src/
│  │     ├─ paginas/       bandeja, alumnos, calendario, flota, instructores,
│  │     │                 productos, ventas, analisis, ajustes
│  │     ├─ pdf/           horarios y reportes en PDF (se generan en el navegador)
│  │     └─ importar/      lectura del Excel en el navegador
│  └─ api/                 Hono sobre Cloudflare Workers — API REST + webhook de Meta + cron diario
├─ packages/
│  └─ core/                Reglas de negocio (única fuente de verdad)
│     └─ src/
│        ├─ domain/        roles.ts, agenda.ts (disponibilidad y cruces), precios.ts, ventana-24h.ts
│        ├─ db/            schema.ts (Drizzle), migraciones
│        ├─ services/      clases, vehiculos, ventas, analisis, conversaciones, uso-api
│        └─ integrations/  whatsapp.ts (real + simulado), r2.ts
├─ docs/
├─ .env.example
└─ CLAUDE.md
```

Principios:
- La web **solo llama** a la API, y la API a `packages/core`. Ocultar un botón no es autorizar.
- Toda operación recibe un `Actor` (usuario + rol) y filtra según su alcance.
- **El trabajo pesado va al navegador o a la base de datos**, no al servidor: PDF y Excel en el navegador, análisis en SQL. Así la API sigue dentro del límite gratuito de CPU de Cloudflare.
- WhatsApp tiene un modo **simulado** para desarrollo. Nada se envía de verdad hasta configurar las credenciales.

## 7. Seguridad y datos

- Autenticación con email y contraseña más 2FA opcional (obligatorio para Propietario y Admin). Las sesiones viven en la base de datos y se pueden revocar.
- El token de Meta y el secreto de la app van en variables de entorno del servidor, nunca en el navegador ni en la base de datos.
- El webhook rechaza cualquier petición sin una firma válida de Meta.
- Copia de seguridad diaria de la base en R2, guardada 30 días.
- Datos personales: los clientes escriben por WhatsApp, así que hay que registrar el consentimiento antes de enviarles marketing y permitir exportar o eliminar sus datos a petición.

## 8. Roadmap sugerido

1. **MVP 1 — reemplazar el Excel:** flota (con agregar carros), instructores, alumnos, calendario sin cruces, PDF de horarios, importación del Excel, usuarios. *Es lo que más rápido ahorra trabajo.*
2. **MVP 2 — ventas:** productos, ofertas, ventas y pagos, análisis básico (producto más vendido, regular vs oferta, ingresos, ocupación de carros).
3. **MVP 3 — WhatsApp:** bandeja de los 5 números, conversión de chat a venta, control de costos.
4. **Fase 2:** plantillas (recordatorio de clase para mañana), análisis completo, exportaciones.
5. **Futuro:** facturación SUNAT, IA, Instagram y Messenger.

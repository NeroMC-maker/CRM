# CRM — Costos de operación y APIs

Precios en USD consultados en **septiembre de 2026**. Cambian a menudo: confírmalos antes de contratar.

## Supuestos

- **Escuela de manejo** en **Perú**, **máximo 5 usuarios** (vendedores), **cada uno con su propio número de WhatsApp**, ~5.000 contactos
- **Única API externa: WhatsApp Cloud API (Meta)**, para traer todos los mensajes al CRM y responder desde ahí
- Por ahora sin correo (Resend) ni IA (Claude). Ver "Descartado por ahora" al final

## 1. Infraestructura (costo fijo mensual) — objetivo $0

| Servicio | Uso | Costo |
|----------|-----|-------|
| **Cloudflare Pages / Workers (estáticos)** | La app web (React, archivos estáticos) | **$0**. Los archivos estáticos son gratis e ilimitados |
| **Cloudflare Workers Free** | API (Hono) + webhook de Meta + cron diario | **$0** hasta 100.000 peticiones/día. 5 usuarios + WhatsApp usan ~2–5 mil |
| **Neon Free** (Postgres) | Base de datos | **$0** (0,5 GB, 100 CU-h/mes) |
| **Cloudflare R2** | Fotos, audios y documentos de WhatsApp + fotos de carros + copias de seguridad | **$0** hasta 10 GB |
| PDF de horarios y reportes | Se generan en el navegador de cada usuario | **$0** |
| Lectura del Excel | En el navegador | **$0** |
| Dominio | `crm.tuescuela.pe` | Opcional: ~S/ 60–100/año. Sin dominio se usa `tuescuela.workers.dev` gratis |
| **Total** | | **$0/mes** (+ dominio opcional) |

### ¿Cómo se logra $0 y cuál es el riesgo?

- **El límite que importa** es el de Workers Free: **10 ms de CPU por petición**. El tiempo esperando a la base de datos o a Meta **no cuenta**, solo el cálculo propio.
- Por eso el diseño **no usa Next.js en el servidor**, que gasta mucha CPU renderizando páginas. La interfaz es una app estática y la API solo valida, consulta y responde. Típicamente usa 1–5 ms.
- Lo pesado se hace fuera del servidor: **PDF y Excel en el navegador**, **análisis en SQL** dentro de Neon.
- **Plan B si algún día no alcanza:** Workers de pago a **$5/mes**, con el mismo código y sin migrar nada.

### Opciones descartadas

| Opción | Costo | Por qué no |
|--------|-------|-----------|
| Vercel Hobby | $0 | Sus condiciones prohíben el **uso comercial** |
| Vercel Pro | $20/mes | Innecesario para 5 usuarios |
| Next.js en Cloudflare | $5/mes | Next.js necesita más CPU que la del plan gratis |
| VPS propio | ~$5–10/mes | Cuesta y hay que mantenerlo |

### ¿Por qué Neon Free alcanza?

- **Almacenamiento (0,5 GB):** en la base solo va texto. 5.000 alumnos (~20 MB) + clases (~5 MB/año) + mensajes (~10 MB/mes) dan para 2 años o más. Las fotos y audios van a R2.
- **Cómputo (100 CU-h/mes):** la base se apaga sola tras 5 minutos sin uso. El horario laboral de 5 personas gasta ≈ 45 CU-h.
- **Condición de diseño:** nada consulta la base cada minuto. Los mensajes llegan por webhook, y el cron (vencimientos de SOAT, copias de seguridad) corre **una vez al día**.
- **Limitaciones:** la primera consulta tras estar apagada tarda un poco más (< 1 s). Hacemos una copia diaria propia en R2.

## 2. WhatsApp Cloud API (Meta) — Perú

Contexto: **5 vendedores, cada uno con su propio número**. Todos los números van en una misma cuenta de WhatsApp Business de la empresa.

### Qué se paga y qué no (tarifas de Perú)

| Tipo de mensaje | Costo |
|-----------------|-------|
| **Mensajes que te envían los clientes** | **Gratis**. Confirmado en la documentación oficial de Meta |
| Respuestas libres dentro de las 24 h ("servicio") | Gratis hasta el 30/09/2026. **Desde el 1/10/2026**: **1.000 gratis al mes por número**; después, **~$0,030** cada una (tarifa de utilidad de Perú)* |
| Plantillas de utilidad (confirmaciones, avisos) | **~$0,030** por mensaje* |
| Plantillas de marketing (promociones) | **~$0,070** por mensaje* |
| Respuestas enviadas desde la app WhatsApp Business del celular (coexistencia) | Gratis según los proveedores*; el CRM recibe una copia |

\* Las tarifas de Perú desde el 1/10/2026 vienen de una sola fuente de terceros (SleekFlow), que indica que Perú **sube** la tarifa de utilidad. El cambio de las respuestas lo publican varios proveedores, pero aún no aparece en la página oficial de Meta. **Hay que confirmarlo** en el panel de facturación de Meta al conectar.

### Qué implica tener 5 números

- **Más respuestas gratis:** el cupo de 1.000 es **por número**, así que son **5.000 al mes en total**. Son ~45 respuestas por vendedor por día hábil.
- **Verificar la empresa en Meta es obligatorio:** sin verificar, Meta solo permite **2 números**. Con la verificación (RUC y documentos de la empresa) se permiten hasta 20.
- **Los límites de envío se comparten:** el tope de clientes nuevos que se pueden contactar al día con plantillas (250/día sin verificar) es de toda la empresa, no de cada número. Responder a quien te escribió no cuenta contra ese tope.

### Estimación mensual

| Escenario | Costo mensual Meta |
|-----------|-------------------|
| Cada vendedor responde ≤ 1.000 mensajes/mes desde el CRM | **$0** |
| Un vendedor llega a 1.500 → 500 × $0,030 | ≈ **$15** |
| Los 5 llegan a 1.500 cada uno → 2.500 × $0,030 | ≈ **$75** |
| + 300 plantillas de marketing | + ≈ **$21** |

## 3. Resumen mensual

| Escenario | Infra | Meta (WhatsApp) | **Total** |
|-----------|-------|------|-----------|
| Uso normal (cada vendedor ≤ 1.000 respuestas/mes desde el CRM) | $0 | $0 | **$0** |
| Algunos vendedores se pasan del cupo | $0 | $15–30 | **≈ $15–30** |
| Todos se pasan + campañas de marketing | $0–5 | $75–100 | **≈ $75–105** |

Para mantenerlo en $0: respuestas por encima de las 1.000 se pueden enviar desde la app del celular (gratis según los proveedores y se copian al CRM), y las promociones se evalúan antes de mandarlas por plantilla.

## 4. Control de costos dentro del CRM

- Cada mensaje saliente se registra en `uso_api` con su **número**, categoría y costo estimado. Meta informa la categoría real en el webhook de estado.
- En **Ajustes → Costos** se ven **las respuestas gratis que le quedan a cada número** (de 1.000), el gasto del mes y el desglose por vendedor (solo Propietario y Admin).
- Cada vendedor ve en su bandeja cuántas respuestas gratis le quedan este mes.
- Hay un tope mensual con aviso al 80 %. Al 100 % se bloquean las plantillas de marketing. Las respuestas a clientes nunca se bloquean.

## Descartado por ahora

Se pueden agregar después sin cambiar la arquitectura:

- **Correo (Resend):** Free 3.000/mes con tope de 100/día; Pro $20/mes.
- **IA (Claude API):** Haiku 4.5 a $1/$5 por millón de tokens (entrada/salida). ≈ $5/mes por 1.000 resúmenes de conversaciones.

## Fuentes

- [Meta — Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Wati — WhatsApp Service Message Pricing Changes (2026)](https://www.wati.io/en/blog/whatsapp-service-message-pricing/)
- [EngageLab — WhatsApp Business API Pricing 2026: Oct 1 Changes](https://www.engagelab.com/blog/whatsapp-business-api-pricing)
- [SleekFlow — WhatsApp Business API pricing por país (2026/2027)](https://sleekflow.io/blog/whatsapp-business-price)
- [Meta — WhatsApp Business Accounts (límite de números)](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts/) · [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [360dialog — WhatsApp Coexistence](https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence)
- [Vercel — Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) · [Vercel Pro Plan](https://vercel.com/docs/plans/pro-plan)
- [Cloudflare Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Límites](https://developers.cloudflare.com/workers/platform/limits) · [OpenNext](https://opennext.js.org/)
- [Neon — Pricing](https://neon.com/pricing)

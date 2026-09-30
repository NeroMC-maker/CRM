# Decisiones

## Tomadas

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-09-25 | **Escuela de manejo en Perú**, una sola empresa, máximo 5 usuarios | Uso interno |
| 2026-09-25 | Empezar por diseño (docs) antes de programar | Acordar módulos, permisos y costos primero |
| 2026-09-25 | **Costo de operación lo más cercano a $0** como prioridad transversal | Pedido explícito del dueño |
| 2026-09-25 | Stack: **React/Vite (estático) + Hono** (Node en desarrollo, Cloudflare Workers en producción) + Postgres (Neon) + Drizzle + R2 | Cabe en planes gratuitos con uso comercial permitido. Next.js descartado porque su render en servidor excede el límite de CPU gratuito. Plan B: Workers de pago ($5/mes) sin cambiar código |
| 2026-09-25 | PDF, lectura de Excel y trabajo pesado en el navegador; análisis en SQL | Mantiene la API dentro de 10 ms de CPU por petición |
| 2026-09-25 | Cruces de carro, instructor **y alumno** impedidos por la base de datos (restricciones `EXCLUDE`) | El Excel actual no lo impide; es el problema principal a resolver |
| 2026-09-25 | Cada venta guarda precio regular y precio cobrado; solo Admin cambia precios y ofertas | Análisis confiable de "regular vs oferta" |
| 2026-09-25 | Permisos por rol validados en `core/domain/roles.ts` | Una sola fuente de verdad; la interfaz no autoriza |
| 2026-09-25 | **Única API externa: WhatsApp Cloud API (Meta)**. No hay bot, responden personas | Es el canal principal con los alumnos |
| 2026-09-25 | 5 vendedores, cada uno con su número, en una sola cuenta de WhatsApp Business | Así trabaja hoy el equipo; son 5 × 1.000 respuestas gratis al mes |
| 2026-09-25 | Mensajes por webhook, sin sondeo; archivos en R2 | Mantiene Neon en el plan gratis |
| 2026-09-26 | Datos confirmados: **2 centros** (San Borja, Cercado de Lima), **4 carros**, **clases de 2 h**, paquetes de 2, 4, 6, 8, 10 y 12 h; varias clases el mismo día permitidas | Confirmado por la escuela |
| 2026-09-26 | **Venta rápida tipo punto de venta**, operable por teclado; venta + paquete + pago en una sola transacción | Prioridad 1 de la escuela |
| 2026-09-26 | El instructor se puede asignar después de reservar; **no se marca "realizada" sin instructor** | Así operan hoy; evita clases sin responsable |
| 2026-09-26 | "Tiempo real" del calendario = consulta de una huella cada 5 s (solo con la pestaña visible) | Sin servicio extra (Supabase Realtime descartado por ahora): mantiene $0 y un solo proveedor de base de datos |
| 2026-09-26 | Carro fijo por centro (cada carro pertenece a un centro) | Supuesto del MVP; ver pendientes |
| 2026-09-26 | Una clase "no asistió" consume las horas del paquete | Supuesto del MVP hasta definir la política de inasistencias |
| 2026-09-26 | Sesiones propias (cookie + tabla `sesiones`, PBKDF2 con Web Crypto) | Funciona igual en Node y Workers, sin dependencias |
| 2026-09-26 | **Horario como el Excel de la escuela**: un solo horario con los 4 carros (se comparten entre sedes), columnas día × carro, filas de 30 min, cabeceras fijas y tres tamaños | Así trabaja hoy el equipo (hoja "Horarios Tulicencia 2026") |
| 2026-09-26 | **Duración flexible** en tramos de 30 min (clase hasta 4 h, acompañamiento hasta 12 h), inicio a :00 o :30; el paquete descuenta lo que realmente dura | "A veces se demora el cliente o el instructor" |
| 2026-09-26 | **Turno** = instructor por carro y tramo del día (tabla `turnos`, sin cruces por carro ni por instructor). Las clases del tramo toman ese instructor; un cambio a medio día recorta el turno anterior | Fila de instructores del Excel |
| 2026-09-26 | **Breaks** como bloqueos del carro (tabla `bloqueos`); reservas y breaks del mismo carro se serializan bloqueando la fila del carro | Bloques amarillos del Excel |
| 2026-09-26 | Tipos de reserva: **clase** (descuenta del paquete) y **acompañamiento** (sin paquete) | Bloques naranjas del Excel |
| 2026-09-26 | **Punto de recojo** por clase: sedes, puntos de encuentro de la web o domicilio (la dirección se recuerda en la ficha) + nota libre | Columnas de dirección y notas del Excel |
| 2026-09-26 | **Siempre se paga completo al vender**: sin adelantos ni saldos. El pago por el total se registra en la misma transacción de la venta; solo se elige el método | Confirmado por la escuela |
| 2026-09-26 | Las clases se reprograman desde el calendario o la ficha del alumno; el selector marca las horas ocupadas y se puede deshacer una marca de realizada / no asistió | Reprogramar es frecuente |
| 2026-09-26 | **Venta = carrito** (`ventas` + `venta_items`); las horas viven en `paquetes`, que se pueden **recargar** | Pedido: varios productos en una venta y recarga de horas |
| 2026-09-26 | Prospectos y alumnos en la misma tabla con **etapa** (nuevo → contactado → interesado → matriculado / perdido), historial en `cambios_etapa` y actividades en `seguimientos` | CRM: medir conversión y que cada prospecto tenga un próximo paso (patrón de Pipedrive) |
| 2026-09-26 | Gráficos en SVG propio, paleta validada con el validador de dataviz (azul #2a78d6, naranja #eb6834, aqua #1baf7a; rampa azul para embudo y mapa de calor) y "Ver tabla" en cada gráfico | Sin librerías pesadas; accesible (el aqua no llega a 3:1 y la tabla lo compensa) |

## Pendientes

- [ ] **Revisar el Excel actual de calendarios** para construir la importación.
- [ ] Precios reales de los paquetes de 2, 6, 8 y 12 h (4 h y 10 h se tomaron de la web) y política de ofertas.
- [ ] Horario de atención de cada centro (hoy 7:00–21:00 para ambos) y si las clases empiezan solo a horas fijas.
- [ ] ¿Los carros se trasladan entre centros? ¿El alumno puede usar su paquete en ambos centros?
- [ ] Política de inasistencias, cancelaciones tardías, devoluciones y vencimiento de paquetes.
- [ ] ¿Se exige un pago mínimo antes de agendar?
- [ ] ¿Retener un horario unos minutos mientras se completa la reserva? (hoy la base impide el doble registro y avisa al segundo)
- [ ] ¿Los instructores tendrán usuario (rol Instructor ya existe) o solo reciben el PDF?
- [ ] **¿Los números de WhatsApp son de la empresa o personales?** Ver la nota de privacidad en la especificación.
- [ ] **Portafolio comercial de Meta** propio de la empresa, con 2 administradores, **verificado con RUC**.
- [ ] Coexistencia: ¿seguir usando cada número en el celular e importar 6 meses de historial?
- [ ] Despliegue en Cloudflare Workers: cambiar el driver de Postgres por el de Neon (HTTP) y activar `nodejs_compat`.

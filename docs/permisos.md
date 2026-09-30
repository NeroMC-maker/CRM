# CRM — Roles y permisos

Los permisos combinan dos cosas:

1. **Rol**: qué acciones puede hacer el usuario.
2. **Alcance**: sobre qué registros puede hacerlas: **propios** (sus alumnos, su número de WhatsApp, sus ventas) o **todos**.

Se validan siempre en el servidor (`packages/core/src/domain/roles.ts`), nunca solo en la interfaz.

## Roles

| Rol | Para quién |
|-----|-----------|
| **Propietario** | Dueño de la escuela. Hay exactamente uno y no se puede degradar a sí mismo |
| **Administrador** | Gestiona usuarios, flota, instructores, precios y ofertas; ve todo |
| **Vendedor** | Atiende su WhatsApp, registra alumnos y ventas, agenda clases |
| **Instructor** (opcional) | Solo ve **su** horario y marca las clases como realizadas o no asistió. Si no se usa, los instructores reciben el PDF impreso |

Con máximo 5 usuarios no hace falta un rol de Gerente aparte. Si más adelante se necesita, se agrega sin cambiar el diseño.

## Matriz de permisos

✅ permitido · 🔸 solo lo propio · ❌ no permitido

| Acción | Propietario | Admin | Vendedor | Instructor |
|--------|:--:|:--:|:--:|:--:|
| **WhatsApp** |
| Ver y responder chats | ✅ | ✅ | 🔸 su número | ❌ |
| Reasignar chats de otro número | ✅ | ✅ | ❌ | ❌ |
| Enviar plantillas de marketing | ✅ | ✅ | ❌ | ❌ |
| **Alumnos** |
| Ver alumnos | ✅ | ✅ | ✅ (para agendar) | 🔸 solo nombre y teléfono de sus alumnos |
| Crear / editar alumnos | ✅ | ✅ | ✅ | ❌ |
| **Calendario** |
| Ver calendario completo | ✅ | ✅ | ✅ | 🔸 su horario |
| Agendar / reprogramar / cancelar clases | ✅ | ✅ | ✅ | ❌ |
| Marcar clase realizada / no asistió | ✅ | ✅ | ✅ | 🔸 sus clases |
| Imprimir horarios en PDF | ✅ | ✅ | ✅ | 🔸 su horario |
| Importar Excel | ✅ | ✅ | ❌ | ❌ |
| **Flota e instructores** |
| Ver carros e instructores | ✅ | ✅ | ✅ | ❌ |
| Agregar / editar carros, bloquear por mantenimiento | ✅ | ✅ | ❌ | ❌ |
| Agregar / editar instructores y su disponibilidad | ✅ | ✅ | ❌ | ❌ |
| **Productos y ventas** |
| Ver productos y ofertas vigentes | ✅ | ✅ | ✅ | ❌ |
| Crear / cambiar **precios y ofertas** | ✅ | ✅ | ❌ | ❌ |
| Registrar venta a precio regular u oferta vigente | ✅ | ✅ | ✅ | ❌ |
| Aplicar **descuento manual** (fuera de oferta) | ✅ | ✅ | ❌ (lo pide y lo aprueba un Admin) | ❌ |
| Registrar pagos | ✅ | ✅ | 🔸 sus ventas | ❌ |
| Anular una venta | ✅ | ✅ | ❌ | ❌ |
| **Análisis** |
| Ver análisis completo (todos los vendedores, ingresos) | ✅ | ✅ | ❌ | ❌ |
| Ver sus propias ventas y conversión | ✅ | ✅ | 🔸 | ❌ |
| **Exportar datos** | ✅ | ✅ | ❌ | ❌ |
| **Sistema** |
| Gestionar usuarios y roles | ✅ | ✅ (no puede crear Propietarios) | ❌ | ❌ |
| Ver costos de WhatsApp y cambiar topes | ✅ | ✅ ver / ❌ cambiar tope | ❌ | ❌ |
| Ver auditoría | ✅ | ✅ | ❌ | ❌ |

## Reglas

- **Los precios solo los cambia Admin o Propietario.** Un vendedor solo puede vender a precio regular o con una oferta vigente. Cualquier otro descuento necesita aprobación y queda en la auditoría. Así el análisis "regular vs oferta" es confiable.
- **Exportar está restringido:** es la forma más común de que se vaya la base de alumnos con un empleado.
- Cada número de WhatsApp pertenece a un vendedor. Si otro cubre esos chats, lo hace desde ese mismo número y queda en la auditoría.
- Cuando un usuario se desactiva, sus alumnos, chats y ventas se reasignan. Nunca se borran.
- Un Admin no puede quitarle permisos al Propietario ni darse ese rol.

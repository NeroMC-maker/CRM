import type { DbOrTx } from '../db/client';
import { auditoria } from '../db/schema';
import type { Actor } from '../domain/roles';

export async function auditar(
  db: DbOrTx,
  actor: Actor | null,
  accion: string,
  entidad: string,
  entidadId: string | null,
  datos?: unknown,
): Promise<void> {
  await db.insert(auditoria).values({
    usuarioId: actor?.id ?? null,
    accion,
    entidad,
    entidadId,
    datos: datos === undefined ? null : (datos as object),
  });
}

-- Turnos sin cruces: un carro no puede tener dos instructores a la vez,
-- y un instructor no puede manejar dos carros a la vez.
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sin_cruce_vehiculo"
  EXCLUDE USING gist ("vehiculo_id" WITH =, tstzrange("inicio", "fin") WITH &&);
--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sin_cruce_instructor"
  EXCLUDE USING gist ("instructor_id" WITH =, tstzrange("inicio", "fin") WITH &&);
--> statement-breakpoint
-- Bloqueos (break, mantenimiento) del mismo carro no se superponen entre sí.
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_sin_cruce_vehiculo"
  EXCLUDE USING gist ("vehiculo_id" WITH =, tstzrange("inicio", "fin") WITH &&);
--> statement-breakpoint
-- Una clase de manejo siempre descuenta de un paquete; el acompañamiento puede ir sin paquete.
ALTER TABLE "clases" ADD CONSTRAINT "clases_paquete_si_es_clase"
  CHECK ("tipo" <> 'clase' OR "paquete_id" IS NOT NULL);

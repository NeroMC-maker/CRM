-- Sin cruces de horario, garantizado por la base de datos:
-- aunque dos personas guarden a la vez, un carro, un instructor o un alumno
-- nunca pueden tener dos clases superpuestas. Las clases canceladas no cuentan.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_sin_cruce_vehiculo"
  EXCLUDE USING gist ("vehiculo_id" WITH =, tstzrange("inicio", "fin") WITH &&)
  WHERE ("estado" <> 'cancelada');
--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_sin_cruce_instructor"
  EXCLUDE USING gist ("instructor_id" WITH =, tstzrange("inicio", "fin") WITH &&)
  WHERE ("estado" <> 'cancelada' AND "instructor_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_sin_cruce_alumno"
  EXCLUDE USING gist ("alumno_id" WITH =, tstzrange("inicio", "fin") WITH &&)
  WHERE ("estado" <> 'cancelada');

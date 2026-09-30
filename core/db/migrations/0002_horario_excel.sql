CREATE TYPE "public"."motivo_bloqueo" AS ENUM('break', 'mantenimiento', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_clase" AS ENUM('clase', 'acompanamiento');--> statement-breakpoint
CREATE TYPE "public"."tipo_punto" AS ENUM('sede', 'punto', 'domicilio');--> statement-breakpoint
CREATE TABLE "bloqueos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" "motivo_bloqueo" DEFAULT 'break' NOT NULL,
	"nota" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueos_fin_despues" CHECK ("bloqueos"."fin" > "bloqueos"."inicio")
);
--> statement-breakpoint
CREATE TABLE "puntos_recojo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"tipo" "tipo_punto" NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnos_fin_despues" CHECK ("turnos"."fin" > "turnos"."inicio")
);
--> statement-breakpoint
ALTER TABLE "clases" ALTER COLUMN "paquete_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alumnos" ADD COLUMN "direccion" text;--> statement-breakpoint
ALTER TABLE "clases" ADD COLUMN "tipo" "tipo_clase" DEFAULT 'clase' NOT NULL;--> statement-breakpoint
ALTER TABLE "clases" ADD COLUMN "punto_recojo_id" uuid;--> statement-breakpoint
ALTER TABLE "clases" ADD COLUMN "direccion_recojo" text;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD COLUMN "nombre" text;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD COLUMN "color_horario" text DEFAULT '#2563eb' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD COLUMN "orden" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_instructor_id_instructores_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueos_inicio_idx" ON "bloqueos" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "turnos_inicio_idx" ON "turnos" USING btree ("inicio");--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_punto_recojo_id_puntos_recojo_id_fk" FOREIGN KEY ("punto_recojo_id") REFERENCES "public"."puntos_recojo"("id") ON DELETE no action ON UPDATE no action;
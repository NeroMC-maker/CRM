CREATE TYPE "public"."estado_clase" AS ENUM('programada', 'realizada', 'cancelada', 'no_asistio');--> statement-breakpoint
CREATE TYPE "public"."estado_paquete" AS ENUM('activo', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."estado_vehiculo" AS ENUM('activo', 'mantenimiento', 'baja');--> statement-breakpoint
CREATE TYPE "public"."estado_venta" AS ENUM('activa', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."etapa" AS ENUM('nuevo', 'contactado', 'interesado', 'matriculado', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'yape', 'plin', 'transferencia', 'tarjeta');--> statement-breakpoint
CREATE TYPE "public"."origen_alumno" AS ENUM('whatsapp', 'web', 'referido', 'facebook', 'local', 'otro');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('propietario', 'admin', 'vendedor', 'instructor');--> statement-breakpoint
CREATE TYPE "public"."tipo_precio" AS ENUM('regular', 'oferta', 'descuento_manual');--> statement-breakpoint
CREATE TYPE "public"."tipo_producto" AS ENUM('paquete', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_seguimiento" AS ENUM('nota', 'llamada', 'whatsapp', 'visita', 'tarea');--> statement-breakpoint
CREATE TYPE "public"."transmision" AS ENUM('mecanica', 'automatica');--> statement-breakpoint
CREATE TABLE "alumnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombres" text NOT NULL,
	"apellidos" text DEFAULT '' NOT NULL,
	"dni" text,
	"telefono" text,
	"email" text,
	"categoria_buscada" text DEFAULT 'A-I',
	"origen" "origen_alumno" DEFAULT 'otro' NOT NULL,
	"vendedor_id" uuid,
	"etapa" "etapa" DEFAULT 'nuevo' NOT NULL,
	"motivo_perdida" text,
	"proximo_seguimiento" timestamp with time zone,
	"convertido_en" timestamp with time zone,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"datos" jsonb,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cambios_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"de" "etapa",
	"a" "etapa" NOT NULL,
	"usuario_id" uuid,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"telefono" text,
	"hora_apertura" integer DEFAULT 7 NOT NULL,
	"hora_cierre" integer DEFAULT 21 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paquete_id" uuid NOT NULL,
	"alumno_id" uuid NOT NULL,
	"vehiculo_id" uuid NOT NULL,
	"instructor_id" uuid,
	"centro_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"estado" "estado_clase" DEFAULT 'programada' NOT NULL,
	"notas" text,
	"creada_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clases_fin_despues_de_inicio" CHECK ("clases"."fin" > "clases"."inicio")
);
--> statement-breakpoint
CREATE TABLE "instructores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombres" text NOT NULL,
	"dni" text,
	"telefono" text,
	"licencia" text,
	"categorias" text[] DEFAULT '{A-I}'::text[] NOT NULL,
	"centro_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ofertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"precio" numeric(10, 2) NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_monto_positivo" CHECK ("pagos"."monto" > 0)
);
--> statement-breakpoint
CREATE TABLE "paquetes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"horas_compradas" integer NOT NULL,
	"centro_id" uuid NOT NULL,
	"estado" "estado_paquete" DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paquetes_horas_no_negativas" CHECK ("paquetes"."horas_compradas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_producto" DEFAULT 'paquete' NOT NULL,
	"horas" integer DEFAULT 0 NOT NULL,
	"precio_regular" numeric(10, 2) NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seguimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_seguimiento" NOT NULL,
	"texto" text NOT NULL,
	"vence_en" timestamp with time zone,
	"completado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" "rol" NOT NULL,
	"centro_id" uuid,
	"instructor_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehiculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placa" text NOT NULL,
	"marca" text NOT NULL,
	"modelo" text NOT NULL,
	"anio" integer,
	"transmision" "transmision" NOT NULL,
	"categoria" text DEFAULT 'A-I' NOT NULL,
	"color" text,
	"centro_id" uuid NOT NULL,
	"estado" "estado_vehiculo" DEFAULT 'activo' NOT NULL,
	"soat_vence" date,
	"revision_vence" date,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehiculos_placa_unique" UNIQUE("placa")
);
--> statement-breakpoint
CREATE TABLE "venta_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"precio_regular" numeric(10, 2) NOT NULL,
	"precio_cobrado" numeric(10, 2) NOT NULL,
	"oferta_id" uuid,
	"tipo_precio" "tipo_precio" NOT NULL,
	"horas" integer DEFAULT 0 NOT NULL,
	"paquete_id" uuid,
	"es_recarga" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"centro_id" uuid NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"total_regular" numeric(10, 2) NOT NULL,
	"total_cobrado" numeric(10, 2) NOT NULL,
	"motivo_descuento" text,
	"autorizado_por" uuid,
	"estado" "estado_venta" DEFAULT 'activa' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ventas_total_no_negativo" CHECK ("ventas"."total_cobrado" >= 0)
);
--> statement-breakpoint
ALTER TABLE "alumnos" ADD CONSTRAINT "alumnos_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_etapa" ADD CONSTRAINT "cambios_etapa_alumno_id_alumnos_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."alumnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cambios_etapa" ADD CONSTRAINT "cambios_etapa_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_alumno_id_alumnos_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."alumnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_instructor_id_instructores_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clases" ADD CONSTRAINT "clases_creada_por_usuarios_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructores" ADD CONSTRAINT "instructores_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas" ADD CONSTRAINT "ofertas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_alumno_id_alumnos_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."alumnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_alumno_id_alumnos_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."alumnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_oferta_id_ofertas_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_alumno_id_alumnos_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."alumnos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_centro_id_centros_id_fk" FOREIGN KEY ("centro_id") REFERENCES "public"."centros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_autorizado_por_usuarios_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alumnos_dni_idx" ON "alumnos" USING btree ("dni");--> statement-breakpoint
CREATE INDEX "alumnos_telefono_idx" ON "alumnos" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX "alumnos_etapa_idx" ON "alumnos" USING btree ("etapa");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "cambios_etapa_alumno_idx" ON "cambios_etapa" USING btree ("alumno_id");--> statement-breakpoint
CREATE INDEX "cambios_etapa_fecha_idx" ON "cambios_etapa" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "clases_inicio_idx" ON "clases" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "clases_paquete_idx" ON "clases" USING btree ("paquete_id");--> statement-breakpoint
CREATE INDEX "pagos_venta_idx" ON "pagos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "paquetes_alumno_idx" ON "paquetes" USING btree ("alumno_id");--> statement-breakpoint
CREATE INDEX "seguimientos_alumno_idx" ON "seguimientos" USING btree ("alumno_id");--> statement-breakpoint
CREATE INDEX "seguimientos_vence_idx" ON "seguimientos" USING btree ("vence_en");--> statement-breakpoint
CREATE INDEX "venta_items_venta_idx" ON "venta_items" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "ventas_alumno_idx" ON "ventas" USING btree ("alumno_id");
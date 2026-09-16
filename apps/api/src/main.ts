import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // CORS para el admin-web: origen exacto, credenciales, methods y headers restringidos
  const adminWebOrigins = process.env.ADMIN_WEB_ORIGINS?.split(",").map((o) => o.trim()) ?? [];
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (como curl o postman directo)
      if (!origin) {
        return callback(null, true);
      }
      if (adminWebOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Transmetro-Request"],
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // CORS simplificado para JWT stateless — no cookies
  app.enableCors({
    origin: "*", // Permitir todos los orígenes (JWT no tiene riesgo CSRF)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();

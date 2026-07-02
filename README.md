# Plataforma de Intercambio de Entradas DNJ (V2)

Sistema de emparejamiento (matchmaking) para intercambiar zonas de entradas para el concierto de Hakuna Group Music en el Día Nacional de la Juventud (DNJ) en la Diócesis de Ciudad Quesada.

## 🚀 Requisitos
- Docker y Docker Compose
- Procesador ARM64 (Apple Silicon M1/M2/M3/M4) soportado de forma nativa.

## 🛠️ Instalación y Ejecución

1. **Configurar el entorno:**
   Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. **Generar llaves VAPID (para notificaciones Push):**
   Si no tienes las llaves generadas, puedes usar el contenedor de Node temporalmente:
   ```bash
   docker run --rm -it node:20-alpine npx web-push generate-vapid-keys
   ```
   Copia las llaves generadas y pégalas en tu archivo `.env` (`VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`).

3. **Levantar los servicios:**
   ```bash
   docker compose up -d --build
   ```

4. **Acceso Local:**
   - La aplicación PWA estará disponible en: `http://localhost:80`
   - El Health Check del backend en: `http://localhost:3000/api/health`

## 🌍 Exposición a Internet (Cloudflare Tunnels)

El sistema está diseñado para exponerse mediante `cloudflared`. Puedes ejecutar el tunnel en tu Mac mini de la siguiente manera:

```bash
cloudflared tunnel --url http://localhost:80
```
O configurando un tunnel persistente a través del dashboard de Cloudflare Zero Trust.

## � Seguridad de acceso

La aplicación ahora restringe el acceso a usuarios ubicados en Costa Rica. El bloqueo se valida en el worker mediante el header `cf-ipcountry` y se puede ajustar con la variable de entorno `ALLOWED_COUNTRIES` (por defecto `CR`).

Para desplegarlo, asegúrate de que el worker tenga esa variable configurada y que el dominio esté protegido.

## �📂 Arquitectura

- **Frontend:** PWA Vainilla JS con diseño Glassmorphism (Mobile First). Servida mediante Nginx en Alpine.
- **Backend:** Node.js (Express) con cron jobs integrados para el matchmaking de intersección de conjuntos y Web Push VAPID notifications.
- **Base de Datos:** PostgreSQL 16 con almacenamiento de persistencia (Docker Volumes).

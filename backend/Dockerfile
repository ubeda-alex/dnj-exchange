FROM node:20-alpine
LABEL maintainer="DNJ Exchange"
LABEL description="Backend Node.js para la Plataforma de Intercambio DNJ"

WORKDIR /app

# Copiar manifiestos primero para aprovechar cache de capas
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm install --only=production && npm cache clean --force

# Copiar código fuente
COPY src/ ./src/

# Usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]

FROM nginx:alpine
LABEL maintainer="DNJ Exchange"
LABEL description="Frontend PWA para la Plataforma de Intercambio DNJ"

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos públicos y código fuente
COPY public/ /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/

EXPOSE 80

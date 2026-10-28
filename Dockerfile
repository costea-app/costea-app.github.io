# syntax=docker/dockerfile:1
# Costea — imagen multi-etapa. Todo (instalación, pruebas, compilación) ocurre dentro de Docker.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Etapa de desarrollo: `docker compose up web`
FROM deps AS dev
COPY . .
EXPOSE 4200
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--port", "4200", "--poll", "1000"]

# Etapa de compilación: genera public/config.js con la configuración PÚBLICA y compila.
FROM deps AS build
COPY . .
ARG SUPABASE_URL=""
ARG SUPABASE_PUBLISHABLE_KEY=""
ARG BASE_HREF=/
ENV SUPABASE_URL=${SUPABASE_URL} SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY} BASE_HREF=${BASE_HREF}
RUN npm run build:pages

# Etapa de producción local: nginx sirve la SPA en la raíz (fallback a index.html).
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/costea/browser /usr/share/nginx/html
EXPOSE 80

# Vista previa que imita GitHub Pages: la app vive en /costea/ y las rutas desconocidas reciben 404.html.
FROM nginx:1.27-alpine AS ghpages
COPY docker/nginx-github-pages.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/costea/browser /usr/share/nginx/html/costea
EXPOSE 80

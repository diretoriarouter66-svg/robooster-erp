# Robooster ERP — build de produção + nginx (SPA)
# Estágio 1: build do Vite (env VITE_* embutido em tempo de build)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
# .env (VITE_SUPABASE_URL / ANON_KEY) vem no contexto de build; VITE_BASE=/previa/ gera a build da prévia
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

# Estágio 2: nginx servindo o build estático
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

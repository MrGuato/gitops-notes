# syntax=docker/dockerfile:1

# Stage 1: build the static site.
# --platform=$BUILDPLATFORM runs the build once on the runner's native
# architecture. The output is plain HTML, CSS and JS, so it is copied into
# the amd64 and arm64 images alike instead of being rebuilt under emulation.
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The cluster serves the site at the root of its own hostname.
ARG ASTRO_BASE=/
ARG ASTRO_SITE=https://notes.deleontech.net
ENV ASTRO_BASE=$ASTRO_BASE \
    ASTRO_SITE=$ASTRO_SITE
RUN npm run build

# Stage 2: serve it with nginx as a non-root user on port 8080.
# nginx-unprivileged runs as uid 101, keeps its pid file and temp
# directories under /tmp and listens on 8080, so no root is needed anywhere.
FROM nginxinc/nginx-unprivileged:1.31-alpine
LABEL org.opencontainers.image.source="https://github.com/MrGuato/gitops-notes"
LABEL org.opencontainers.image.description="GitOps Notes, a static Astro site served by nginx"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
USER 101

# Build the static site and serve it with Caddy (auto-HTTPS in prod).
# Build context must be the repo root so the content/ symlink resolves.
#   docker build -f web/Dockerfile -t szych-web .
#
# Web alternative: skip this image entirely and deploy web/ to GitHub Pages
# instead — see the commented job in .github/workflows/deploy.yml.
#
# Base images are pinned by digest (supply-chain); the tag is kept for clarity.
# Refresh with: docker manifest inspect -v <image:tag>

FROM node:24-alpine@sha256:9e04e3f9c9164cb2c913593ba0733fbd0caf4e9bea474d743ca8a32aa36d98c9 AS build
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
# content/ must land first so the web/src/content -> ../../content symlink
# resolves during the Eleventy build (same as a local checkout).
COPY content /repo/content
COPY web /repo/web
# Wakapi stats are optional at build time (no key -> section is omitted).
RUN npm run build

FROM caddy:2-alpine@sha256:98eb57d882ccd5213d1688764db10c1ca2c58a1ca3a6717a3411ad798f7a423a
# Run as a non-root user. Pre-own the data/config dirs (Caddy writes certs and
# its autosave there) so the mounted volumes inherit writable ownership. The
# caddy binary ships with cap_net_bind_service, which can't be exec'd under
# `cap_drop: ALL`; we bind high ports instead, so strip the file capability.
RUN apk add --no-cache libcap \
    && addgroup -g 1000 web && adduser -D -u 1000 -G web web \
    && mkdir -p /data /config && chown -R 1000:1000 /data /config \
    && setcap -r /usr/bin/caddy \
    && apk del libcap
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=1000:1000 /repo/web/_site /srv
USER 1000:1000
EXPOSE 8080 8443

# Build the SSH TUI and bake in the markdown content.
# Build context must be the repo root so we can copy src/content.
#   docker build -f tui/Dockerfile -t szych-tui .

FROM golang:1.26-alpine AS build
WORKDIR /app
COPY tui/go.mod tui/go.sum ./
RUN go mod download
COPY tui/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /sztui .

FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /sztui /usr/local/bin/sztui
# Content is the single source of truth, shared with the web build.
COPY src/content /content
# Persist the SSH host key across restarts via a mounted volume (see compose).
RUN mkdir -p /data/.ssh && chown -R app:app /data
USER app
ENV CONTENT_DIR=/content \
    SSH_HOST=0.0.0.0 \
    SSH_PORT=2222 \
    SSH_HOST_KEY=/data/.ssh/id_ed25519
EXPOSE 2222
ENTRYPOINT ["sztui"]

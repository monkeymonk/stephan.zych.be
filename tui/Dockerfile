# Build the SSH TUI and bake in the markdown content.
# Build context must be the repo root so we can copy content/.
#   docker build -f tui/Dockerfile -t szych-tui .
#
# Base images are pinned by digest (supply-chain); the tag is kept for clarity.
# Refresh with: docker manifest inspect -v <image:tag>

FROM golang:1.26.5-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build
WORKDIR /app
COPY tui/go.mod tui/go.sum ./
RUN go mod download
COPY tui/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /sztui .
# Pre-create the host-key dir owned by the distroless nonroot uid (65532) so the
# mounted volume inherits writable ownership — distroless has no shell to chown.
RUN mkdir -p /data/.ssh && chown -R 65532:65532 /data

# Distroless: no shell, no package manager, nothing to pivot into but the TUI.
# tzdata is embedded in the binary (time/tzdata); CA certs ship with the image.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:b669b9df05a88a085fefed6520c6d2268aabacf3008b149ddf877e752ae89400
COPY --from=build /sztui /usr/local/bin/sztui
COPY --from=build --chown=65532:65532 /data /data
# Content is the single source of truth, shared with the web build.
COPY content /content
USER 65532:65532
ENV CONTENT_DIR=/content \
    SSH_HOST=0.0.0.0 \
    SSH_PORT=2222 \
    SSH_HOST_KEY=/data/.ssh/id_ed25519
EXPOSE 2222
ENTRYPOINT ["/usr/local/bin/sztui"]

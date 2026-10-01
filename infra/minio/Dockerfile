# MinIO community images are no longer distributed; build a pinned source release.
FROM golang:1.24.12-alpine AS builder
RUN apk add --no-cache git
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@RELEASE.2025-09-07T16-13-09Z
RUN go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM alpine:3.22.2
RUN apk add --no-cache ca-certificates curl
COPY --from=builder /go/bin/minio /usr/local/bin/minio
COPY --from=builder /go/bin/mc /usr/local/bin/mc
EXPOSE 9000 9001
ENTRYPOINT ["minio"]

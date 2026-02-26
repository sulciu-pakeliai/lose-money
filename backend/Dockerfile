FROM golang:1.24-alpine AS base
WORKDIR /app
# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy go.mod and optionally go.sum (if it exists)
# The asterisk ensures this doesn't fail if go.sum is missing
COPY go.mod go.sum* ./
RUN go mod download

# --- Development Stage ---
FROM base AS dev
# We don't COPY . . here because we rely on the volume mount in compose
# This allows hot-reloading (if you use tools like Air) or simple restarts
CMD ["go", "run", "."]

# --- Builder Stage ---
FROM base AS builder
COPY . .
# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /main .

# --- Production Stage ---
FROM gcr.io/distroless/static-debian12 AS prod
COPY --from=builder /main /main
EXPOSE 8080
USER nonroot:nonroot
CMD ["/main"]

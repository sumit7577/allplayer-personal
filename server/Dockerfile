FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o allplayer-server .

# --- Runtime ---
FROM alpine:3.21

RUN apk add --no-cache ca-certificates sqlite-libs

WORKDIR /app
COPY --from=builder /build/allplayer-server .

RUN mkdir -p /app/data

ENV DB_PATH=/app/data/allplayer.db

EXPOSE 3001

CMD ["./allplayer-server"]

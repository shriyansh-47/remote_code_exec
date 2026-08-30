FROM eclipse-temurin:17-jdk-alpine
RUN apk add --no-cache util-linux
RUN adduser -D -u 1729 sandboxed_user
USER sandboxed_user
WORKDIR /tmp
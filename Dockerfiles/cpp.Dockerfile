FROM alpine:3.18
RUN apk add --no-cache g++ libstdc++ util-linux
RUN adduser -D -u 1729 sandboxed_User
USER sandboxed_User
WORKDIR /tmp
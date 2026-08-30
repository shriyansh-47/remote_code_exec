FROM python:3.11-alpine
RUN apk add --no-cache util-linux
RUN adduser -D -u 1729 sandboxed_User
USER sandboxed_User
WORKDIR /tmp
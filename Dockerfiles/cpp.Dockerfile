FROM alpine:3.18

# download the following dependencies using package manager apk
RUN apk add --no-cache g++ libstdc++ util-linux

# by default Docker runs the user as root, this creates a new user
# -D means diablility of password functions
RUN adduser -D -u 1729 sandboxed_user

# This tells Docker to run the container not as root
# but as sandboxed_user
USER sandboxed_user

# opens a directory named /tmp when the container would run
WORKDIR /tmp

# Dockerfiles sepcify the details of the system
# build command on these files is used to create image
# this image is like snapshot of the system config
# docker run commands brings the system to life 
# while spinning the containers
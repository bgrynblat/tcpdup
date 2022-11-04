#!/bin/bash

APP="tcpdup"
IMAGE="tcpdup"
REPO="bgrynblat"
TAG=${TAG:-latest}
NO_CACHE=${NO_CACHE:-false}

CACHE=""
if [[ "$NO_CACHE" == "true" ]]; then
  CACHE="--no-cache"
fi

docker buildx ls | grep $APP > /dev/null 2>&1
if [ $? -ne 0 ]; then
    docker buildx create --name $APP
fi

docker buildx use $APP

docker buildx build \
  --platform linux/arm64,linux/amd64 \
  --push \
  $CACHE \
  -t $REPO/$IMAGE:$TAG \
  -t $REPO/$IMAGE:$TAG-node \
  -f ./Dockerfile.node .

#linux/amd64 doesn't compile for some reason
docker buildx build \
  --platform linux/arm64 \
  --push \
  $CACHE \
  -t $REPO/$IMAGE:$TAG-bun \
  -f ./Dockerfile.bun .

#!/bin/bash

# Terminate on errors
set -e


printf "Synchronising submodules... "
git submodule sync --recursive >> /dev/null
git submodule update --recursive --remote --init >> /dev/null
printf "DONE\n\n"

file="./protos/fishjam/peer_notifications.proto"

printf "Compiling: file $file\n"
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=./src/ $file
printf "DONE\n"

npm run format:fix
npm run lint:fix

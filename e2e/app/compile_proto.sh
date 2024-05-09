#!/bin/bash

# Terminate on errors
set -e


printf "Synchronising submodules... "
git submodule sync --recursive >> /dev/null
git submodule update --recursive --remote --init >> /dev/null
printf "DONE\n\n"

file="./protos/jellyfish/peer_notifications.proto"

printf "Compiling: file %s\n" "$file"
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=./src/ $file
printf "DONE\n"

cd ../..
npm run format:fix
npm run lint:fix

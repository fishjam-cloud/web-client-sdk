#!/bin/bash

# Terminate on errors
set -e

ROOTDIR=$(dirname $(dirname $(dirname "$(readlink -f $0)")))

cd $ROOTDIR

file="./protos/fishjam/peer_notifications.proto"

printf "Compiling: file %s\n" "$file"
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=./e2e/app/src/ $file
printf "DONE\n"

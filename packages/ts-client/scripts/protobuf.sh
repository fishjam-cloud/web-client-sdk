#!/bin/sh

set -e

ROOTDIR=$(dirname $(dirname "$(readlink -f $0)"))

cd $ROOTDIR

printf "Synchronising submodules... "
git submodule sync --recursive >> /dev/null
git submodule update --recursive --remote --init >> /dev/null
printf "DONE\n"

file="./protos/fishjam/peer_notifications.proto"

printf "Compiling file $file... "
protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=./src/ $file
printf "DONE\n"

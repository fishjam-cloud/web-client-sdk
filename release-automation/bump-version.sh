#!/bin/bash
set -euo pipefail

# Usage: ./bump-version-web-sdk.sh <version>
VERSION="$1"
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

# Install asdf dependencies if .tool-versions exists
if [ -f .tool-versions ]; then
    echo "Installing asdf dependencies..."
    # add plugins from .tool-versions
    while read -r line; do
        PLUGIN_NAME=$(echo "$line" | awk '{print $1}')
        if ! asdf plugin list | grep -q "^$PLUGIN_NAME$"; then
            echo "Adding asdf plugin: $PLUGIN_NAME"
            asdf plugin add "$PLUGIN_NAME"
        else
            echo "asdf plugin $PLUGIN_NAME already added"
        fi
    done < .tool-versions

    asdf install
else
    echo ".tool-versions file not found!"
    exit 1
fi

# Create branch
BRANCH_NAME="release-$VERSION"
git checkout -b "$BRANCH_NAME"

echo "Updating version in package.json files..."

# Update root package.json
if [ -f package.json ]; then
    echo "Enabling corepack..."
    corepack enable

    corepack yarn version "$VERSION"
    echo "Updated root package.json to $VERSION"
else
    echo "Root package.json not found!"
    exit 1
fi

# Update specific sub-packages
corepack yarn workspace @fishjam-cloud/webrtc-client version "$VERSION"
echo "Updated webrtc-client to $VERSION"

corepack yarn workspace @fishjam-cloud/ts-client version "$VERSION"
echo "Updated ts-client to $VERSION"

corepack yarn workspace @fishjam-cloud/react-client version "$VERSION"
echo "Updated react-client to $VERSION"

corepack yarn workspace @fishjam-cloud/react-native-client version "$VERSION"
echo "Updated react-native-client to $VERSION"

# Run proto generation
if corepack yarn gen:proto; then
    echo "Protos generated."
else
    echo "Proto generation failed!"
    exit 1
fi

echo "✅ Version bump complete for $VERSION"
echo "BRANCH_NAME:$BRANCH_NAME"

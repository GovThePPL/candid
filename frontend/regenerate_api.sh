#!/bin/bash
# Resolve the directory this script lives in (frontend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$SCRIPT_DIR/api"
APP_DIR="$SCRIPT_DIR/app"

echo "Removing existing api directory..."
rm -rf "$API_DIR"

echo "Rebuilding api from defintion..."
openapi-generator-cli generate -i "$PROJECT_ROOT/docs/api.yaml" -g javascript -o "$API_DIR"

cd "$API_DIR"

# Fix discriminator validation in CardItem models
# The OpenAPI generator doesn't properly validate enum values in oneOf discriminators
echo "Patching CardItem models for proper discriminator validation..."

patch_card_item() {
    local file=$1
    local expected_type=$2
    # Use sed for the replacement (only first match)
    sed -i "s|// ensure the json data is a string|// ensure the json data matches the expected enum value|" "$file"
    sed -i "s|if (data\['type'\] \&\& !(typeof data\['type'\] === 'string' || data\['type'\] instanceof String)) {|if (data['type'] !== '$expected_type') {|" "$file"
    sed -i "s|throw new Error(\"Expected the field \\\`type\\\` to be a primitive type in the JSON string but got \" + data\['type'\]);|throw new Error(\"Expected type to be '$expected_type' but got '\" + data['type'] + \"'\");|" "$file"
}

[ -f src/model/PositionCardItem.js ] && patch_card_item src/model/PositionCardItem.js "position"
[ -f src/model/SurveyCardItem.js ] && patch_card_item src/model/SurveyCardItem.js "survey"
[ -f src/model/ChatRequestCardItem.js ] && patch_card_item src/model/ChatRequestCardItem.js "chat_request"
[ -f src/model/KudosCardItem.js ] && patch_card_item src/model/KudosCardItem.js "kudos"
[ -f src/model/DemographicCardItem.js ] && patch_card_item src/model/DemographicCardItem.js "demographic"
[ -f src/model/PairwiseCardItem.js ] && patch_card_item src/model/PairwiseCardItem.js "pairwise"

# Remove User-Agent default header — browsers forbid setting it (causes
# "Refused to set unsafe header" console errors on every API call)
echo "Patching ApiClient.js to remove User-Agent default header..."
sed -i "s|'User-Agent': 'OpenAPI-Generator/0.1.0/Javascript'||" src/ApiClient.js

echo "Installing api dependencies..."
cd "$API_DIR" && npm install
cd "$API_DIR" && npm run build
echo "Re-linking api in app (file: dependency)..."
cd "$APP_DIR" && npm install
echo "Done"

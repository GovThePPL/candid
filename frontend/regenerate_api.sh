#!/bin/bash
echo "Removing existing api directory..."
rm -rf api/
cd ../
echo "Rebuilding api from defintion..."
openapi-generator-cli generate -i docs/api.yaml -g javascript -o frontend/api
cd frontend/api/

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

echo "Packaging and linking to app..."
npm install
npm link
echo "Linking in app..."
cd ../app/
npm link ../api/
cd ../api/
npm run build
cd ../
echo "Done"


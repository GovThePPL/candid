#!/bin/bash
echo "Removing existing api directory..."
rm -rf api/
cd ../
echo "Rebuilding api from defintion..."
openapi-generator-cli generate -i docs/api.yaml -g javascript -o frontend/api
cd frontend/api/
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


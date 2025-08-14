#!/bin/bash
# Needed packages: pip, openapi-generator-cli

# Check if npm exists, install if not
dpkg -s python3-pip >> /dev/null
if [ $? -ne 0 ]; then
	apt install -y python3-pip
fi

# Check if openapi-generator-cli is available, install if not
if ! command -v openapi-generator-cli >/dev/null 2>&1; then
	pip install openapi-generator-cli
fi

openapi-generator-cli generate -i ../../docs/api.yaml -g python-flask -o ./generated -c openapi-config.json
cp ./controllers/* generated/candid/controllers/
docker build -t candid ./generated/

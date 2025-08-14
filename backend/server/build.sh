#!/bin/bash
# Needed packages: pip, openapi-generator-cli

# Check if npm exists, install if not
dpkg -s python3-pip >> /dev/null
if [ $? -ne 0 ]; then
	echo "python3-pip is required"
fi

# Check if openapi-generator-cli is available, install if not
if ! command -v openapi-generator-cli >/dev/null 2>&1; then
	echo "openapi generator is required, install with:"
	echo "	pip install openapi-generator-cli"
fi

openapi-generator-cli generate -i ../../docs/api.yaml -g python-flask -o ./generated -c openapi-config.json
if [ $? -ne 0 ]; then
	echo "Generation Failed"
	exit 1
fi
echo "Generation completed successfully"

cp ./controllers/* generated/candid/controllers/
echo "Copied controllers from ./controllers/"

echo "Build and run the container:"
echo "	sudo docker build -t candid ./generated/ && sudo docker run -p 8080:8080 candid"
echo ""
echo "Then access the API UI:"
echo "	http://127.0.0.1:8080/api/v1/ui"

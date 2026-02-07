#!/bin/bash
# Needed packages: pip, openapi-generator-cli, pipreqs

# Check if npm exists, install if not
reqs_met=0
dpkg -s python3-pip >> /dev/null
if [ $? -ne 0 ]; then
	echo "python3-pip is required, install with:"
	echo "	apt install python3-pip"
	reqs_met=1
fi

# Check if openapi-generator-cli is available, install if not
if ! command -v openapi-generator-cli >/dev/null 2>&1; then
	echo "openapi generator is required, install with:"
	echo "	pip install openapi-generator-cli"
	reqs_met=1
fi

# Check if pipreqs is available, install if not
if ! command -v pipreqs >/dev/null 2>&1; then
	echo "pipreqs is required, install with:"
	echo "  pip install pipreqs"
	reqs_met=1
fi

if [ $reqs_met -ne 0 ]; then
	exit 1
fi

openapi-generator-cli generate -i ../../docs/api.yaml -g python-flask -o ./generated -c openapi-config.json
if [ $? -ne 0 ]; then
	echo "Generation Failed"
	exit 1
fi
echo "Generation completed successfully"

cp -r ./controllers/* generated/candid/controllers/
echo "Copied controllers from ./controllers/"

# Copy custom __main__.py with CORS configuration
cp ./controllers/__main__.py generated/candid/__main__.py
echo "Copied custom __main__.py with CORS"

pipreqs --force ./generated/
# Add gunicorn (not detected by pipreqs since it's a CLI entrypoint, not imported)
if ! grep -q 'gunicorn' ./generated/requirements.txt; then
    echo "gunicorn==23.0.0" >> ./generated/requirements.txt
fi
echo "generated requirements.txt"

echo "Build and run the container:"
echo "	sudo docker build -t candid ./generated/ && sudo docker run -p 8000:8000 candid"
echo ""
echo "Then access the API UI:"
echo "	http://127.0.0.1:8000/api/v1/ui"

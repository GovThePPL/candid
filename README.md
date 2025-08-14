# candid
Candid is a chat platform for peaceful and productive discussion of issues of public concern

# Getting Started
Run the server container:

`$ sudo docker build -f backend/server/Dockerfile -t candid-server .`
`$ sudo docker run -p 8080:8080 candid-server`
Navigate to 127.0.0.1:8080/api/v1/ui to use the Swagger UI to test endpoints

Download OpenAPI Generator:

`$ pip install openapi-generator-cli`

Use the generator for the backend:

Run `backend/server/build.sh` to build the server locally, then run it from the docker container in `backend/server/generated`

Use the generator for the frontend:

`$ openapi-generator-cli generate -i docs/api.yaml -g typescript -o frontend/src/generated`


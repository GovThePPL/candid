# candid
Candid is a chat platform for peaceful and productive discussion of issues of public concern

# Getting Started
Start the development environment:
`$ docker compose up -d`

Connect to the database:
`$ psql -h localhost -p 5432 -U user -d candid`

Reset the database:
`$ docker compose down --volumes`

Navigate to 127.0.0.1:8080/api/v1/ui to use the Swagger UI to test endpoints

Run `backend/server/build.sh` to build the server locally, then run it from the docker container in `backend/server/generated`

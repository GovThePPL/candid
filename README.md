# candid
Candid is a chat platform for peaceful and productive discussion of issues of public concern

# Getting Started
You'll need the most recent version of docker from docker's website.

Download sysbox (for polis docker-in-docker):

`$ wget https://downloads.nestybox.com/sysbox/releases/v0.6.7/sysbox-ce_0.6.7-0.linux_amd64.deb`

Stop running Docker containers:

`$ docker rm $(docker ps -a -q) -f`

Install Sysbox:

`$ sudo apt-get install jq`

`$ sudo apt-get install ./sysbox-ce_0.6.7-0.linux_amd64.deb`

Update docker config (`/etc/docker/daemon.json`):
```
{
  "runtimes": {
    "sysbox-runc": {
      "path": "/usr/bin/sysbox-runc"
    }
  }
}
```

Restart Docker: `$ sudo systemctl restart docker`

Start the development environment: `$ docker compose up -d`

# Useful things
Connect to the database: `$ psql -h localhost -p 5432 -U user -d candid`

Password is `postgres`

Reset the database: `$ docker volume rm candid_postgres_data`

Reset polis and rebuild: `$ docker volume rm candid_polis_docker_data`

Navigate to `127.0.0.1:8000/api/v1/ui` to use the Swagger UI to test endpoints

Pol.is frontend is running on dev mode on localhost:8080, the default login is:

Username: `admin@polis.test`

Password: `Te$tP@ssw0rd*`

If you get stuck at the "sign in" button, navigate to `https://localhost:3000/` and accept the security risk from the self signed certificate.
This should allow you to reach the sign in page.

Run `backend/server/build.sh` to build the server locally, then run it from the docker container in `backend/server/generated`

Start the frontend in candid/frontend: `$ frontend/start.sh`

Download Expo Go on your phone and scan the QR code to open the live version of the frontend.

Rebuild the API used in the frontend: `$ frontend/regenerate_api.sh`

# Running Tests

Integration tests run against the live API, so make sure the Docker environment is up first:

`$ docker compose up -d`

Install test dependencies:

`$ pip install pytest requests`

Run all tests:

`$ pytest backend/tests/ -v`

Run only quick smoke tests:

`$ pytest backend/tests/ -v -m smoke`

Run only non-mutating tests (skip tests that write to the database):

`$ pytest backend/tests/ -v -m "not mutation"`

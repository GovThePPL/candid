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
Restart Docker:
`$ sudo systemctl restart docker`

Start the development environment:
`$ docker compose up -d`

Connect to the database:
`$ psql -h localhost -p 5432 -U user -d candid`
Password is 'postgres'

Reset the database:
`$ docker compose down --volumes`

Navigate to 127.0.0.1:8000/api/v1/ui to use the Swagger UI to test endpoints

Pol.is frontend is running on dev mode on localhost:8080, the default login is:
Username:
`admin@polis.test`
Password:
`Te$tP@ssw0rd*`

If you get stuck at the "sign in" button, navigate to `https://localhost:3000/` and accept the security risk from the self signed certificate.
This should allow you to reach the sign in page.

Run `backend/server/build.sh` to build the server locally, then run it from the docker container in `backend/server/generated`

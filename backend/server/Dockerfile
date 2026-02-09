FROM ubuntu:24.04
RUN apt -y update
RUN apt install -y postgresql-common
RUN /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

RUN apt -y install default-jre python3 python3-pip postgresql-client-17
RUN pip3 install openapi-generator-cli pipreqs psycopg2-binary "PyJWT[crypto]" cryptography camel-converter redis python-dateutil requests flask-cors gunicorn --break-system-packages
RUN mkdir -p /usr/src/docs

COPY ./docs/api.yaml /usr/src/docs/
COPY ./backend/server/openapi-config.json /usr/src/docs/

RUN mkdir -p /usr/src/app
WORKDIR /usr/src
RUN openapi-generator-cli generate -i docs/api.yaml -g python-flask -o app/ -c docs/openapi-config.json

# Fix UUID type annotations in generated models - replace UUID with str since the
# OpenAPI generator's deserializer doesn't handle UUID properly
RUN find app/candid/models -name "*.py" -exec sed -i 's/-> UUID:/-> str:/g; s/: UUID/: str/g; s/List\[UUID\]/List[str]/g' {} \;

COPY ./backend/server/controllers/ app/candid/controllers/
COPY ./backend/server/controllers/__main__.py app/candid/__main__.py

WORKDIR /usr/src/app/

#RUN pipreqs --force .
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

EXPOSE 8000

# Use gunicorn for production with configurable workers
# Each worker is a separate process with its own DB/Redis connection pools
# Default: 4 workers, override via GUNICORN_WORKERS env var
CMD gunicorn \
    --bind 0.0.0.0:8000 \
    --workers ${GUNICORN_WORKERS:-4} \
    --timeout 120 \
    --access-logfile - \
    "candid.__main__:create_wsgi_app()"

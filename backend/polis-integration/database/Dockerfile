FROM postgres:17

ENV POSTGRES_DB=polis-dev
ENV POSTGRES_USER=user
ENV POSTGRES_PASSWORD=postgres

# Copy Polis schema migrations (from the polis submodule)
COPY polis/server/postgres/migrations/0*.sql /polis-migrations/

# Copy init script that applies migrations
COPY database/init-polis-db.sh /docker-entrypoint-initdb.d/01-init-polis.sh
RUN chmod +x /docker-entrypoint-initdb.d/01-init-polis.sh

EXPOSE 5432

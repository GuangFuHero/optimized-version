FROM postgis/postgis:16-3.4

# Bullseye's PGDG packages moved to the official archive.
RUN sed -i 's|http://apt.postgresql.org|https://apt-archive.postgresql.org|g' /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-h3 \
    && rm -rf /var/lib/apt/lists/*

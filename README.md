# heroku cloudnative

## Overview

Sample application which would include following features to make this app so-called **Cloud Native** like with **Heroku**.

- **Environment values driven** as cloud native application.

- **Multi-instance** enabled from zero.

- **Session enabled** Login/Logout.

- **Reconnectable** DB/session memory.

- **Search engine** enabled with Japanese.

- **Scheduler** enabled for up-to-date search engine data.

- **Log** management.

- **Health** check.

- **Containerizable** if needed.


## Environment values

- AUTH0_CALLBACK_URL : Callback URL for Auth0 authentication

- AUTH0_CLIENT_ID : ClientID for Auth0 authentication

- AUTH0_CLIENT_SECRET : ClientSecret for Auth0 authentication

- AUTH0_DOMAIN : Domain name for Auth0 authentication

- BONSAI_URL : URL for Bonsai Elasticsearch server

- DATABASE_URL : URL connection string for PostgreSQL

- PGSSLMODE : 'no-verify'

- REDIS_URL : URL connection string for Redis


## Files

- app.js : web application which implements following features:

  - Authentication / Online sign-up

  - Multi-instance from zero

  - Search engine / search data auto update by scheduler

  - Reconnectable RDB

  - Log / Health check

- update_bonsai.js : CLI application which supposed to be called by scheduler and update search engine data

- items.ddl : DDL for items table

- items_index.json : Index definition for search engine


## Licensing

This code is licensed under MIT.


## Copyright

2021 K.Kimura @ Juge.Me all rights reserved.

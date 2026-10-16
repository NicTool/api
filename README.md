[![Build Status](https://github.com/NicTool/api/actions/workflows/ci.yml/badge.svg)](https://github.com/NicTool/api/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/NicTool/api/badge.svg)](https://coveralls.io/github/NicTool/api)

# NicTool API v3

A RESTful JSON web service that exposes DNS management functions to users.

## Install

1. Install [Node.js](https://nodejs.org/en/download/)
2. Download the NicTool v3 API

```
mkdir nictool && cd nictool
git clone https://github.com/NicTool/api.git
cd api
npm install
```

## Configure

Edit the files in conf.d to reflect your local settings.

Each config file has a default section which lists all available config settings. Below the `default` section are optional deployment environments such as `production`, `development`, and `test`. When a deployment environment is detected, overrides in the matching deployment section are applied.

## Start the service

Running one of these commands:

`npm run start (production)`

or

`npm run develop (development)`

will start up the HTTP service on the port specified in `conf.d/http.yml`. The default URL for the service is [http://localhost:3000](http://localhost:3000) and the API methods have documentation at [http://localhost:3000/documentation#/](http://localhost:3000/documentation#/).

## Using the API service

Until the NicTool 3.0 HTTP client is written, using a web browser (in Developer mode) or a CLI HTTP utility like curl can be used. Here's a quick tutorial:

### Start a New Session

`curl -X POST http://localhost:3000/session`

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Invalid request payload input" }
```

The request was rejected because it's missing the required parameters, as shown in the documentation. Create a file called nt-auth.json and store the credentials of a NicTool user therein, with the username qualified by the user's group name:

```json
{ "username": "unit-test@example.com", "password": "Wh@tA-Decent#P6ssw0rd" }
```

Then try the auth request again:

`curl -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json | json_pp`

```json
{
  "group": {
    "id": 4096,
    "name": "example.com"
  },
  "meta": {
    "api": {
      "version": "3.0.3"
    },
    "msg": "you are logged in"
  },
  "session": {
    "id": 1,
    "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ1cm46YXVkaWVuY2U6dGVzdCIs..."
  },
  "user": {
    "email": "unit-test@example.com",
    "first_name": "Unit",
    "id": 4096,
    "is_admin": false,
    "last_name": "Test",
    "username": "unit-test"
  }
}
```

`session.token` is a JWT, valid for 8 hours. Send it as a Bearer token in the `Authorization` header of every other request. With [jq](https://jqlang.org/), save it to a shell variable:

```sh
TOKEN=$(curl -s -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json | jq -r .session.token)
```

and then use it:

```sh
curl -s http://localhost:3000/user/4096 --header "Authorization: Bearer $TOKEN" | json_pp
```

```json
{
  "group": {
    "id": 4096
  },
  "meta": {
    "api": {
      "version": "3.0.3"
    },
    "msg": "here's your user"
  },
  "user": [
    {
      "deleted": false,
      "email": "unit-test@example.com",
      "first_name": "Unit",
      "id": 4096,
      "inherit_group_permissions": true,
      "is_admin": false,
      "last_name": "Test",
      "permissions": { "...": "..." },
      "username": "unit-test"
    }
  ]
}
```

Without the header, the API answers `401`:

```json
{ "statusCode": 401, "error": "Unauthorized", "message": "Missing authentication" }
```

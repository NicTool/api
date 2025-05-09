[![Build Status](https://github.com/NicTool/api/actions/workflows/ci.yml/badge.svg)](https://github.com/NicTool/api/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/NicTool/api/badge.svg)](https://coveralls.io/github/NicTool/api)

# NicTool API v3


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
{"statusCode":400,"error":"Bad Request","message":"Invalid request payload input"}
```

The request was rejected because it's missing the required parameters, as shown in the documentation. Create a file called nt-auth.json and store the credentials of a NicTool user therein. Then try the auth request again:

`curl -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json`

```json
{"user":{"id":4096,"first_name":"Unit","last_name":"Test","username":"unit-test","email":"unit-test@example.com"},"group":{"id":4096,"name":"example.com"},"session":{"id":162},"meta":{"api":{"version":"3.0.0"},"msg":"you are logged in"}
```

That's not the easiest to read so lets pipe it through `json_pp`:

`curl -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json | json_pp`

```json
{
   "group" : {
      "id" : 4096,
      "name" : "example.com"
   },
   "meta" : {
      "api" : {
         "version" : "3.0.0"
      },
      "msg" : "you are logged in"
   },
   "session" : {
      "id" : 162
   },
   "user" : {
      "email" : "unit-test@example.com",
      "first_name" : "Unit",
      "id" : 4096,
      "last_name" : "Test",
      "username" : "unit-test"
   }
}
```

Now we're talking. But we're missing something. The point of sending `POST /session` is to establish a session we can use with subsequent requests. Let's also take a look at the HTTP response headers with the `-i` option to curl.

```
~ curl -i -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
cache-control: no-cache
set-cookie: sid-nictool=Fe26.2**19f7d4f243faa77b048119b4a2bcbdcaa7826cdd853d8bdd3110f330ac6932c8*pzn_-OSy1SfoNpWbNvY3xw*RZQ8EgV2IGphwBz-Fb0AvBGofBwct-GnExEdxW-P-mtc1CWLuBJF0IyI7da_tMtp**07d92c1e89978b270fbdd449adcecbab3078b746c4167fe586f417be866c54d8*nDSOqzX79qmsztrHHjub7FgC7XiAxqGNdB-txLq8L84; Max-Age=3600; Expires=Sun, 25 Feb 2024 21:51:20 GMT; HttpOnly; SameSite=Strict; Path=/
content-length: 237
Date: Sun, 25 Feb 2024 20:51:20 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"user":{"id":4096,"first_name":"Unit","last_name":"Test","username":"unit-test","email":"unit-test@example.com"},"group":{"id":4096,"name":"example.com"},"session":{"id":162},"meta":{"api":{"version":"3.0.0"},"msg":"you are logged in"}}
```

Notice the `set-cookie` header. We can add that cookie to each CLI request, making the requests very long, or save the cookie to a `cookie-jar` file, and then tell curl to sent that cookie with future requests:

```
curl --cookie-jar nt-session -X POST http://localhost:3000/session --header "Content-Type: application/json" -d @nt-auth.json
{"user":{"id":4096,"first_name":"Unit","last_name":"Test","username":"unit-test","email":"unit-test@example.com"},"group":{"id":4096,"name":"example.com"},"session":{"id":162},"meta":{"api":{"version":"3.0.0"},"msg":"you are logged in"}}
```

and if we peek inside the cookie jar:

```sh
➜  ~ cat nt-session
# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# This file was generated by libcurl! Edit at your own risk.

#HttpOnly_localhost	FALSE	/	FALSE	1708898204	sid-nictool	Fe26.2**7a4db1aa0d250c5ba5dda0560ef6cb2c33652f412ee385ebe022313f4fd206f1*g8kgix2HyZUvCKdc60ITMA*Pk3tlc4lYvDAs2J_ZyVHOhYyKWAsGZzbkMdHleLxNPQ55EDmO0vfZWTSILzhceQn**46883c6f21a76dddc10d7c1b0bc3a82302b989057bed459fe61f00eba7d7cacd*bBpV_eKE8VJEz-IDDobcI0nmJT54IndUmoWfE1Eu4fM
```

We can see that our session cookie has been saved. Now we can make other requests to the API using that session cookie:

```sh
curl -b nt-session -X GET http://localhost:3000/user/4096 --header "Content-Type: application/json" | json_pp
{
   "group" : {
      "id" : 4096
   },
   "meta" : {
      "api" : {
         "version" : "3.0.0"
      },
      "msg" : "here's your user"
   },
   "user" : {
      "email" : "unit-test@example.com",
      "first_name" : "Unit",
      "id" : 4096,
      "last_name" : "Test",
      "username" : "unit-test"
   }
}
```


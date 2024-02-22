[![Build Status](https://github.com/NicTool/api/actions/workflows/ci.yml/badge.svg)](https://github.com/NicTool/api/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/NicTool/api/badge.svg)](https://coveralls.io/github/NicTool/api)

# nt-api

nictool api v3


## Install

1. Install [Node.js](https://nodejs.org/en/download/) on your system
2. Download the NicTool v3 API


```
git clone https://github.com/NicTool/api.git nictool-api
cd nictool-api
npm install
```

## Configure

Edit the files in conf.d to reflect your local settings. Each config file has a default section which lists all available config settings. Below the `default` section are optional deployment environments such as `production`, `development`, and `test`. When a config file is loaded, the environment variable `NODE_ENV` is checked and if defined, any overrides in the matching deployment section are applied.

## Start the service

Running one of these commands:

`npm run start (production)`

or 

`npm run develop (development)`

will start up the HTTP service on the port specified in conf.d/http.yml.


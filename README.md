# knot-cloud-protocol-adapter-websocket

KNoT Cloud WebSocket protocol adapter.

## Installation and usage

This service is part of the KNoT Cloud and requires a subset of its service to work. It is a websocket service that provides the API for registering and interacting with devices.

### Configuration

Configuration is made via a JSON file placed into config folder (see [config](https://www.npmjs.com/package/config) package documentation for more info), but also it is possible to configure via environment variables. The parameters are:

* `PORT` **Number** Server port number. (Default: 80)
* `MESHBLU_NAMESPACE` **String** Meshblu's namespace on Redis. (Default: **meshblu**)
* `MESHBLU_MESSAGES_NAMESPACE` **String** Meshblu's messages namespace on Redis. (Default: **messages**)
* `MESHBLU_REDIS_URI` **String** URI of Redis server used by Meshblu.
* `MESHBLU_FIREHOSE_REDIS_URI` **String** URI of Redis server used by Meshblu Firehose.
* `MESHBLU_CACHE_REDIS_URI` **String** URI of Redis server used by Meshblu cache.
* `MESHBLU_ALIAS_LOOKUP_SERVER_URI` **String** Alias lookup service base URI.
* `MESHBLU_ALIAS_SERVER_URI` **String** Alias service base URI.
* `MESHBLU_JOB_TIMEOUT_SECONDS` **Number** Job timeout in seconds (Default: 30)
* `MESHBLU_JOB_LOG_SAMPLE_RATE` **Number** Job sample rate (Default: 0)
* `MESHBLU_REQUEST_QUEUE_NAME` **String** Meshblu's request queue name (Default: **v2:request:queue**)
* `MESHBLU_RESPONSE_QUEUE_NAME` **String** Meshblu's response queue name (Default: **v2:response:queue**)
* `LOGGER_LEVEL` **String** Log level (Default: **debug**/**info**)

Only change the `MESHBLU_` parameters that have a default value if you know what you are doing.

### Build and run (local)

First, install the dependencies:

```
npm i
```

Then:

```
npm run build
npm start
```

### Build and run (local, development)

First, install the dependencies:

```
npm i
```

Then, start the server with auto-reload:

```
npm start:watch
```

Or, start the server in debug mode:

```
npm start:debug
```

### Run (Docker)

Containers built from the master branch and the published tags in this repository are available on [DockerHub](https://hub.docker.com/r/cesarbr/knot-cloud-protocol-adapter-websocket/).

1. Create a file containining the configuration as environment variables.
1. Run the container:

```
docker run --env-file adapter.env -p 4000:80 -ti cesarbr/knot-cloud-protocol-adapter-websocket
```
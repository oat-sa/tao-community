# Provide package name

Provide package description

# Running instructions

Since k6 does not support NodeJS modules directly. It is required to create a bundle for the tests.

The test file will be created in the same relative path, but in the `dist` folder.

### 1) Create the test bundles

```
npm run bundle
```

or in case you want to bundle automatically in the background: 

```
npm run bundle:watch
```

### 2) Run the tests

Replace `{MY-APP-DIRECTORY}` with your test app name shared in the [k6-stack](https://github.com/oat-sa/k6-stack/tree/feature/stack).

```shell script
docker exec -it k6_stack k6 run --out influxdb=http://k6_stack_influxdb:8086/k6 \
app/my-test-app/dist/src/tests/testTemplate.js \
--env APPLICATION_FILE=/app/{MY-APP-DIRECTORY}/config/application.json.sample \
--env OPTIONS_FILE=/app/{MY-APP-DIRECTORY}/config/options.json.sample \
--env CUSTOM_FILE=/app/{MY-APP-DIRECTORY}/config/custom.yaml.sample
```

# Code Syntax and Standard validation

Check standards:

````shell
npm run prettier-check
````

Fix code / apply standards:

````shell
npm run prettier-write
````

Check syntax:

````shell
npm run lint
````

# Api authentication 

Create user inside the container (php and nginx) in order to use the API to test tao (use a proper login/password):

```shell
export PHP_AUTH_USER=admin
export PHP_AUTH_PWD=Admin.12345
```
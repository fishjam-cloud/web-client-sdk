# Jellyfish React Client Demo - Dashboard

## Run

```shell
# Build `react-client-sdk`. Run following command in the project root directory
npm install
npm run build

# Change directory
cd examples/dashboard

# Start development server
npm install
npm run dev
```

```shell
yarn run dev
# or

npm run dev
```

# Generate Server SDK client

```shell
npx @openapitools/openapi-generator-cli generate -i http://localhost:4000/openapi.json -g typescript-axios -o ./src/server-sdk --skip-validate-spec
```

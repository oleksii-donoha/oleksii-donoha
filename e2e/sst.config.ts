// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'rds-port-forward-e2e-tester',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage),
      home: 'aws',
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc('rds-port-forward-e2e-tester-vpc');
    const cluster = new sst.aws.Cluster('rds-port-forward-e2e-tester-cluster', {
      vpc,
    });

    const database = new sst.aws.Postgres('rds-port-forward-e2e-tester-db', {
      vpc,
    });
    new sst.aws.Service('rds-port-forward-e2e-tester-task', {
      cluster,
      link: [database],
      image: 'nginx:alpine-slim',
      architecture: 'arm64',
      capacity: {
        spot: { weight: 1, base: 1 },
      },
      dev: false,
      environment: {
        DB_HOST: database.host,
        DB_PORT: $interpolate`${database.port}`,
        DB_NAME: database.database,
      },
    });
    return {
      database: {
        host: database.host,
        port: database.port,
      },
      cluster: {
        id: cluster.id,
      },
      vpc: {
        id: vpc.id,
      },
    };
  },
});

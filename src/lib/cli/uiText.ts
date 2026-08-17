export const argKeys = [
  'cluster',
  'service',
  'container',
  'db-host',
  'db-host-from-container-env',
  'port',
  'local-port',
  'profile',
  'region',
] as const;

export type ArgKey = (typeof argKeys)[number];

export const cliOptions: {
  [K in ArgKey | 'verbose']: {
    describe: string;
    type: K extends 'verbose' ? 'boolean' : 'string';
  };
} = {
  cluster: {
    describe: 'Name of the ECS cluster where target resides',
    type: 'string',
  },
  service: {
    describe:
      'Name (fuzzy) of the service that hosts target task\nRecommended to use when dealing with big clusters with lots of tasks',
    type: 'string',
  },
  container: {
    describe:
      'Name (fuzzy) of the container that will be used to forward the port',
    type: 'string',
  },
  'db-host': {
    describe:
      'Hostname (or IP address) of the DB instance to which the local port will be forwarded',
    type: 'string',
  },
  'db-host-from-container-env': {
    describe:
      "Target container's environment variable whose value points to the DB hostname (or IP)",
    type: 'string',
  },
  port: {
    describe: 'Remote port to forward traffic to',
    type: 'string',
  },
  'local-port': {
    describe: 'Port on your machine that will listen to requests',
    type: 'string',
  },
  verbose: {
    describe: 'Prints more logs for debugging',
    type: 'boolean',
  },
  profile: {
    describe: 'AWS CLI profile to use',
    type: 'string',
  },
  region: {
    describe: 'AWS region for the request',
    type: 'string',
  },
};

export const conflictingCliOptions = [
  'db-host',
  'db-host-from-container-env',
] as const;

export const awsCliSpecificOptions = ['profile', 'region'] as const;

export const scriptName = 'rds-port-forward';

export const NO_RESOLVER_DATA =
  'There is no collected argument data from resolvers';

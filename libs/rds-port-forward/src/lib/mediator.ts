import { Arg, ArgKey } from './cli.js';

export type Mediator = {
  processedArgs: Partial<Record<ArgKey, Arg>>;
  rawArgs: Partial<Record<ArgKey, string | undefined>>;
  target: {
    taskId: string | undefined;
    taskDefinition: string | undefined;
    containerName: string | undefined;
    clusterName: string | undefined;
  };
  forwardingParams: {
    dbHost: string | undefined;
    port: string | undefined;
    localPort: string | undefined;
  };
  verbose: boolean;
};

export const mediator: Mediator = {
  processedArgs: {},
  rawArgs: {},
  target: {
    taskId: undefined,
    taskDefinition: undefined,
    containerName: undefined,
    clusterName: undefined,
  },
  forwardingParams: {
    dbHost: undefined,
    port: undefined,
    localPort: undefined,
  },
  verbose: false,
};

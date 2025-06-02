import { Arg, ArgKey } from './cli/index.js';

/**
 * Sort-of Mediator pattern
 * Manages interactions between resolvers, CLI, and Logger, since they're not fully sequential
 */
export type Mediator = {
  /**
   * Resulting CLI args that can be provided on repeat invocations
   */
  processedArgs: Partial<Record<ArgKey, Arg>>;
  /**
   * CLI args of interest supplied by user
   */
  rawArgs: Partial<Record<ArgKey, string | undefined>>;
  /**
   * ECS target identifiers
   */
  target: {
    taskId: string | undefined;
    taskDefinition: string | undefined;
    containerName: string | undefined;
    clusterName: string | undefined;
  };
  /**
   * Sets logger level to `debug` when set
   */
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
  verbose: false,
};

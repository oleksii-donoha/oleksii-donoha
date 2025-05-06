import { DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { Logger } from 'winston';
import { CliManager, CliOptionType } from '../cli.js';
import { TargetResolver } from '../targetResolver.js';
import { Mediator } from '../mediator.js';
import { paginate } from '../client/index.js';

type ForwardingParams = {
  host: string;
  portNumber: string;
  localPortNumber: string;
};

export class ForwardingParamsResolver {
  private readonly ecsClient: ECSClient;
  private readonly logger: Logger;
  private readonly mediator: Mediator;
  private dbHost: string | undefined;
  private port: string | undefined;
  private localPort: string | undefined;

  constructor(ecsClient: ECSClient, logger: Logger, mediator: Mediator) {
    this.ecsClient = ecsClient;
    this.logger = logger;
    this.mediator = mediator;
    this.dbHost = undefined;
    this.port = undefined;
    this.localPort = undefined;
  }

  // get forwardingParams() {

  // }
  public async resolveDbHost(): Promise<ForwardingParamsResolver> {
    const { rawArgs, target } = this.mediator;
    if (rawArgs['db-host']) {
      this.logger.debug('Using the DB host specified in the CLI parameters');
      this.dbHost = rawArgs['db-host'];
      this.mediator.processedArgs['db-host'] = {
        skippable: false,
        value: this.dbHost,
      };
      return new Promise((resolve) => resolve(this));
    }
    if (rawArgs['db-host-from-container-env']) {
      const varToLookup = rawArgs['db-host-from-container-env'];
      if (!target.clusterName) {
        throw new Error(
          'Cluster name was not resolved prior to resolving the DB host through container ENV'
        );
      }
      if (!target.containerName) {
        throw new Error(
          'Container name was not resolved prior to resolving the DB host through container ENV'
        );
      }
      if (!target.taskDefinition || !target.taskId) {
        throw new Error(
          'Task definition or ID were not resolved prior to resolving the DB host through container ENV'
        );
      }
      const command = new DescribeTaskDefinitionCommand({
        taskDefinition: target.taskDefinition,
      });
      const containerEnv = (
        await this.ecsClient.send(command)
      ).taskDefinition?.containerDefinitions
        ?.find((container) => container.name === target.containerName)
        ?.environment?.reduce((acc, pair) => {
          acc[pair.name as string] = pair.value as string;
          return acc;
        }, {} as { [name: string]: string });
      const envOverrides = (
        await paginate(this.ecsClient, {
          taskArns: [target.taskId],
          clusterName: target.clusterName,
        })
      )[0].overrides?.containerOverrides
        ?.find((override) => override.name === target.containerName)
        ?.environment?.reduce((acc, pair) => {
          acc[pair.name as string] = pair.value as string;
          return acc;
        }, {} as { [name: string]: string });
      const finalContainerEnv = {
        ...containerEnv,
        ...envOverrides,
      };
      if (!finalContainerEnv[varToLookup]) {
        throw new Error(
          `Container ENV (and ENV overrides) doesn't have an ENV variable with the name '${varToLookup}'`
        );
      }
    }
  }
}

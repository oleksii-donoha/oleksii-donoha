import { DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { confirm, input, number, select, Separator } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import { Logger } from 'winston';
import { paginate } from '../client/index.js';
import { Mediator } from '../mediator.js';

type ForwardingParams = {
  host: string[];
  portNumber: string[];
  localPortNumber: string[];
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

  get forwardingParams() {
    if (!this.dbHost) {
      throw new Error(
        'DB host is not set. Did you run `resolveDbHost()` first?'
      );
    }
    if (!this.port) {
      throw new Error(
        'DB port is not set. Did you run `resolveRemotePort()` first?'
      );
    }
    if (!this.localPort) {
      throw new Error(
        'Local port is not set. Did you run `resolveLocalPort()` first?'
      );
    }
    return JSON.stringify({
      host: [this.dbHost],
      portNumber: [this.port],
      localPortNumber: [this.localPort],
    } as ForwardingParams);
  }
  protected async getContainerEnv(): Promise<{ [x: string]: string }> {
    const { target } = this.mediator;
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
      ?.environment?.reduce((acc, { name, value }) => {
        acc[name as string] = value as string;
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
    return {
      ...containerEnv,
      ...envOverrides,
    };
  }

  public async resolveDbHost(): Promise<ForwardingParamsResolver> {
    const { rawArgs } = this.mediator;
    if (rawArgs['db-host']) {
      this.logger.debug('Using the DB host specified in the CLI parameters');
      this.dbHost = rawArgs['db-host'];
      this.mediator.processedArgs['db-host'] = {
        skippable: false,
        value: this.dbHost,
      };
      return this;
    }
    if (rawArgs['db-host-from-container-env']) {
      this.logger.debug('Resolving the DB host using container ENV');
      const varToLookup = rawArgs['db-host-from-container-env'];
      const containerEnv = await this.getContainerEnv();
      if (!containerEnv[varToLookup]) {
        throw new Error(
          `Container ENV (and ENV overrides) doesn't have an ENV variable with the name '${varToLookup}'`
        );
      }
      this.dbHost = containerEnv[varToLookup];
      this.mediator.processedArgs['db-host'] = {
        value: this.dbHost,
        skippable: false,
      };
      return this;
    }
    const proceedWithEnv = await confirm({
      message:
        '🤔 No DB host for forwarding was supplied. Should we try to look it up in the container ENV?',
    });
    if (proceedWithEnv) {
      const containerEnv = await this.getContainerEnv();
      if (Object.keys(containerEnv).length === 0) {
        this.logger.info(`😿 The target container doesn't have ENV defined`);
      } else {
        const sortedEnv = new Fuse(Object.keys(containerEnv), {
          threshold: 1,
          shouldSort: true,
          isCaseSensitive: false,
        }).search('HOST');
        this.dbHost = await select({
          message: '🌐 Select ENV variable to use as DB host',
          choices: sortedEnv.map(({ item }) => ({
            value: containerEnv[item],
            description: `${item}: ${containerEnv[item]}`,
            name: item,
          })),
        });
        this.mediator.processedArgs['db-host'] = {
          value: this.dbHost,
          skippable: false,
        };
        this.logger.debug('Resolved DB host to', this.dbHost);
        return this;
      }
    }
    this.dbHost = await input({
      message: `✍️ Type in or paste the DB host address`,
      required: true,
    });
    this.mediator.processedArgs['db-host'] = {
      value: this.dbHost,
      skippable: false,
    };
    return this;
  }

  public async resolveRemotePort(): Promise<ForwardingParamsResolver> {
    if (this.mediator.rawArgs.port) {
      this.logger.debug('Using the DB port specified in the CLI parameters');
      this.port = this.mediator.rawArgs.port;
      this.mediator.processedArgs.port = { value: this.port, skippable: false };
      return this;
    }
    const answer = await select({
      message: '📇 Select a target port of your DB host',
      choices: [
        {
          value: '3306',
          name: 'MySQL (3306)',
        },
        {
          value: '5432',
          name: 'PostgreSQL (5432)',
        },
        {
          value: '27017',
          name: 'MongoDB (27017)',
        },
        {
          value: '5439',
          name: 'Redshift (5439)',
        },
        new Separator(),
        {
          value: 'custom',
          name: 'Other (type in)',
        },
      ],
    });
    if (answer !== 'custom') {
      this.port = answer;
      this.mediator.processedArgs.port = { value: this.port, skippable: false };
      return this;
    }
    this.port = `${await number({
      message: '✍️ Type in or paste the DB port',
    })}`;
    this.mediator.processedArgs.port = { value: this.port, skippable: false };
    return this;
  }

  public async resolveLocalPort(): Promise<ForwardingParamsResolver> {
    if (this.mediator.rawArgs['local-port']) {
      this.logger.debug('Using the local port specified in the CLI parameters');
      this.localPort = this.mediator.rawArgs['local-port'];
      this.mediator.processedArgs['local-port'] = {
        value: this.localPort,
        skippable: false,
      };
      return this;
    }
    if (!this.port) {
      throw new Error(
        'Remote port is not defined. Did you run `resolveRemotePort()` first?'
      );
    }
    if (
      await confirm({
        message: `🤔 Use the same local port (${this.port}) as the DB port?`,
      })
    ) {
      this.localPort = this.port;
      this.mediator.processedArgs['local-port'] = {
        value: this.localPort,
        skippable: false,
      };
      return this;
    }
    this.localPort = `${await number({
      message: '✍️ Type in or paste the local port',
    })}`;
    this.mediator.processedArgs['local-port'] = {
      value: this.localPort,
      skippable: false,
    };
    return this;
  }
}

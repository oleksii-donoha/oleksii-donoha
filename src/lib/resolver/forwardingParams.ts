import { DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';
import { confirm, input, number, select, Separator } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import { Logger } from 'winston';

import { paginate } from '../client/index.js';
import { Mediator } from '../mediator.js';
import { dbPortChoiceMap, forwarderText } from './uiText.js';

/**
 * Forwarding params JSON expected by the SSM plugin
 */
type ForwardingParams = {
  host: string[];
  portNumber: string[];
  localPortNumber: string[];
};

/**
 * Resolves forwarding parameters required to start the forwarding session
 */
export class ForwardingParamsResolver {
  protected readonly ecsClient: ECSClient;
  protected readonly logger: Logger;
  protected readonly mediator: Mediator;
  protected dbHost: string | undefined;
  protected port: string | undefined;
  protected localPort: string | undefined;

  constructor(ecsClient: ECSClient, logger: Logger, mediator: Mediator) {
    this.ecsClient = ecsClient;
    this.logger = logger;
    this.mediator = mediator;
    this.dbHost = undefined;
    this.port = undefined;
    this.localPort = undefined;
  }

  /**
   * Returns formatted forwarding parameters string that SSM session plugin expects as input
   */
  get forwardingParams() {
    if (!this.dbHost) {
      throw new Error(forwarderText.DB_HOST_NOT_SET);
    }
    if (!this.port) {
      throw new Error(forwarderText.DB_PORT_NOT_SET);
    }
    if (!this.localPort) {
      throw new Error(forwarderText.LOCAL_PORT_NOT_SET);
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
      throw new Error(forwarderText.CLUSTER_NOT_RESOLVED);
    }
    if (!target.containerName) {
      throw new Error(forwarderText.CONTAINER_NOT_RESOLVED);
    }
    if (!target.taskDefinition || !target.taskId) {
      throw new Error(forwarderText.TASKDEF_NOT_RESOLVED);
    }
    const command = new DescribeTaskDefinitionCommand({
      taskDefinition: target.taskDefinition,
    });
    // Container overrides take precedence
    const containerEnv = (
      await this.ecsClient.send(command)
    ).taskDefinition?.containerDefinitions
      ?.find((container) => container.name === target.containerName)
      ?.environment?.reduce(
        (acc, { name, value }) => {
          acc[name as string] = value as string;
          return acc;
        },
        {} as { [name: string]: string },
      );
    const envOverrides = (
      await paginate(this.ecsClient, {
        taskArns: [target.taskId],
        clusterName: target.clusterName,
      })
    )[0].overrides?.containerOverrides
      ?.find((override) => override.name === target.containerName)
      ?.environment?.reduce(
        (acc, pair) => {
          acc[pair.name as string] = pair.value as string;
          return acc;
        },
        {} as { [name: string]: string },
      );
    return {
      ...containerEnv,
      ...envOverrides,
    };
  }

  /**
   * Resolves DB host address
   * @returns self for further chaining
   */
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
        throw new Error(forwarderText.ENV_VAR_MISSING);
      }
      this.dbHost = containerEnv[varToLookup];
      this.mediator.processedArgs['db-host'] = {
        value: this.dbHost,
        skippable: false,
      };
      return this;
    }
    const proceedWithEnv = await confirm({
      message: forwarderText.DB_HOST_LOOKUP,
    });
    if (proceedWithEnv) {
      const containerEnv = await this.getContainerEnv();
      if (Object.keys(containerEnv).length === 0) {
        this.logger.info(forwarderText.ENV_NOT_DEFINED);
      } else {
        const sortedEnv = new Fuse(Object.keys(containerEnv), {
          threshold: 1,
          shouldSort: true,
          isCaseSensitive: false,
        }).search('HOST'); // Look for ENV vars with 'HOST' in them and display them on top
        this.dbHost = await select({
          message: forwarderText.ENV_VAR_SELECTION,
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
        this.logger.debug(`Resolved DB host to ${this.dbHost}`);
        return this;
      }
    }
    this.dbHost = await input({
      message: forwarderText.DB_HOST_INPUT_PROMPT,
      required: true,
    });
    this.mediator.processedArgs['db-host'] = {
      value: this.dbHost,
      skippable: false,
    };
    return this;
  }

  /**
   * Resolves the port on the DB host that should be targeted
   * @returns self for further chaining
   */
  public async resolveRemotePort(): Promise<ForwardingParamsResolver> {
    if (this.mediator.rawArgs.port) {
      this.logger.debug('Using the DB port specified in the CLI parameters');
      this.port = this.mediator.rawArgs.port;
      this.mediator.processedArgs.port = { value: this.port, skippable: false };
      return this;
    }
    const answer = await select({
      message: forwarderText.PORT_SELECTION_PROMPT,
      choices: [
        ...Object.entries(dbPortChoiceMap).map(([port, dbDisplayName]) => ({
          value: port,
          name: `${dbDisplayName} (${port})`,
        })),
        new Separator(),
        {
          value: 'custom',
          name: forwarderText.PORT_INPUT_PROMPT,
        },
      ],
    });
    if (answer !== 'custom') {
      this.port = answer;
      this.mediator.processedArgs.port = { value: this.port, skippable: false };
      return this;
    }
    this.port = `${await number({
      message: forwarderText.PORT_INPUT_PROMPT,
    })}`;
    this.mediator.processedArgs.port = { value: this.port, skippable: false };
    return this;
  }

  /**
   * Resolves the local port that should be listened to by the plugin
   * @returns self for further chaining
   */
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
      throw new Error(forwarderText.DB_PORT_NOT_SET);
    }
    if (
      await confirm({
        message: forwarderText.USE_SAME_PORT_PROMPT,
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
      message: forwarderText.LOCAL_PORT_INPUT_PROMPT,
    })}`;
    this.mediator.processedArgs['local-port'] = {
      value: this.localPort,
      skippable: false,
    };
    return this;
  }
}

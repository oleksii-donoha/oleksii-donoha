import { DesiredStatus, ECSClient } from '@aws-sdk/client-ecs';
import { confirm, select } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import { type Logger } from 'winston';

import { paginate } from '../client/index.js';
import { type RawDescribeTasksInput } from '../client/util.js';
import { type Mediator } from '../mediator.js';
import { targetText } from './uiText.js';

/**
 * Resolves the ECS target that needs to be passed to the SSM session plugin
 */
export class TargetResolver {
  protected readonly ecsClient: ECSClient;
  protected readonly logger: Logger;
  protected clusterName: string | undefined;
  protected taskId: string | undefined;
  protected containerRuntimeId: string | undefined;
  protected serviceName: string | undefined;
  protected mediator: Mediator;

  constructor(ecsClient: ECSClient, logger: Logger, mediator: Mediator) {
    this.ecsClient = ecsClient;
    this.clusterName = undefined;
    this.taskId = undefined;
    this.containerRuntimeId = undefined;
    this.serviceName = undefined;
    this.logger = logger;
    this.mediator = mediator;
  }

  protected failIfClusterNameIsNotSet() {
    if (!this.clusterName) {
      throw new Error(targetText.CLUSTER_NOT_RESOLVED);
    }
  }

  protected failIfTaskIdIsNotSet() {
    if (!this.taskId) {
      throw new Error(targetText.TASK_ID_NOT_RESOLVED);
    }
  }

  /**
   * Returns a formatted string describing target in a format expected by the SSM session plugin
   */
  get target() {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();
    if (!this.containerRuntimeId) {
      throw new Error(targetText.CONTAINER_NOT_RESOLVED);
    }
    return `ecs:${this.clusterName}_${this.taskId}_${this.containerRuntimeId}`;
  }

  /**
   * Resolves the name of the cluster that hosts the target task
   * @returns self for further chaining
   */
  async resolveCluster(): Promise<TargetResolver> {
    const allClusterArns = await paginate(this.ecsClient, {});
    if (allClusterArns.length === 0) {
      throw new Error(targetText.NO_CLUSTERS);
    }
    const clusterNames = allClusterArns.map((arn) => arn.split('/')[1]);
    if (clusterNames.length === 1) {
      this.logger.debug(
        `There is only one cluster ${clusterNames[0]}, using it`,
      );
      this.clusterName = clusterNames[0];
      this.mediator.processedArgs.cluster = {
        skippable: true,
        value: this.clusterName,
      };
      this.mediator.target.clusterName = this.clusterName;
      return this;
    }
    this.logger.debug(`Found clusters: ${clusterNames}`);
    this.clusterName = await select({
      message: targetText.SELECT_CLUSTER_PROMPT,
      choices: clusterNames.map((value) => ({ value })),
    });
    this.mediator.processedArgs.cluster = {
      skippable: false,
      value: this.clusterName,
    };
    this.mediator.target.clusterName = this.clusterName;
    return this;
  }

  /**
   * Resolves the name of the service that manages the target task
   * Does this only if `--service` parameter was supplied, because service has limited implication for the further steps
   * Service can help narrow down potential tasks for big clusters, so it's still recommended to use.
   * @returns self for further chaining
   */
  async resolveService(serviceNameLike?: string): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    if (!serviceNameLike) {
      this.logger.debug(
        'Service name not provided, skipping service resolution',
      );
      this.mediator.processedArgs.service = {
        skippable: true,
        value: undefined,
      };
      return this;
    }

    const serviceNames = (
      await paginate(this.ecsClient, {
        cluster: this.clusterName,
      })
    ).map((arn) => arn.split('/').pop());
    if (serviceNames.length === 0) {
      throw new Error(targetText.NO_SERVICES);
    }
    const exactMatch = serviceNames.find((name) => name === serviceNameLike);
    if (exactMatch) {
      this.logger.debug('Service name matched exactly');
      this.serviceName = exactMatch;
      this.mediator.processedArgs.service = {
        skippable: serviceNames.length === 1,
        value: this.serviceName,
      };
      return this;
    }

    const potentialServices = new Fuse(serviceNames, {
      shouldSort: true,
    })
      .search(serviceNameLike)
      .map((match) => match.item);
    if (potentialServices.length === 0) {
      throw new Error(targetText.SERVICE_NOT_MATCHED);
    }
    if (potentialServices.length === 1) {
      if (
        !(await confirm({
          message:
            targetText.CONFIRM_FUZZY_SERVICE +
            ` (service: ${potentialServices[0]})`,
        }))
      ) {
        throw new Error(targetText.FUZZY_SERVICE_NOT_CONFIRMED);
      }
      this.serviceName = potentialServices[0];
      this.mediator.processedArgs.service = {
        skippable: false,
        value: this.serviceName as string,
      };
      return this;
    }
    this.serviceName = await select({
      message: targetText.MULTIPLE_FUZZY_SERVICES_FOUND_PROMPT,
      choices: potentialServices.map((s) => {
        return { value: s };
      }),
    });
    this.logger.debug(`Resolved service name to ${this.serviceName}`);
    this.mediator.processedArgs.service = {
      skippable: false,
      value: this.serviceName as string,
    };
    return this;
  }

  /**
   * Resolves the ID and definition ARN of the target task
   * @returns self for further chaining
   */
  async resolveTask(): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    const allTaskArns = await paginate(this.ecsClient, {
      cluster: this.clusterName,
      serviceName: this.serviceName,
      desiredStatus: DesiredStatus.RUNNING,
    });

    if (allTaskArns.length === 0) {
      throw new Error(targetText.NO_TASKS);
    }

    const detailedTasks = await paginate(this.ecsClient, {
      taskArns: allTaskArns,
      clusterName: this.clusterName,
    } as RawDescribeTasksInput);

    if (
      allTaskArns.length === 1 ||
      (this.serviceName && allTaskArns.length > 0)
    ) {
      this.logger.debug(
        this.serviceName
          ? 'Service name is set, selecting the first task as target'
          : 'Only one task found, using it as target',
      );
      this.taskId = allTaskArns[0].split('/').pop();
      this.mediator.target.taskId = this.taskId;
      this.mediator.target.taskDefinition = detailedTasks[0].taskDefinitionArn;
      return this;
    }

    const { taskId, taskDefinition } = await select({
      message: targetText.SELECT_TASK_PROMPT,
      choices: detailedTasks.map((task) => {
        const def = task.taskDefinitionArn?.split('/').pop();
        return {
          value: {
            taskId: task.taskArn?.split('/').pop(),
            taskDefinition: task.taskDefinitionArn,
          },
          name: def,
          description: [
            `Tags.Name: ${task.tags?.find((tag) => tag.key === 'Name')?.value}`,
            'Containers:',
            ...(task.containers?.map((c) => `- ${c.name}; ${c.image}`) || []),
          ].join('\n'),
        };
      }),
    });
    this.taskId = taskId;
    this.logger.debug(`Resolved the task to ${this.taskId}`);
    this.mediator.target.taskId = this.taskId;
    this.mediator.target.taskDefinition = taskDefinition;
    return this;
  }

  /**
   * Resolves the name and runtime ID of the container that will be used for forwarding
   * @returns self for further chaining
   */
  async resolveContainer(): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();

    const taskDetails = await paginate(this.ecsClient, {
      taskArns: [this.taskId as string],
      clusterName: this.clusterName,
    } as RawDescribeTasksInput);
    if (taskDetails.length === 0) {
      throw new Error(targetText.TASK_NOT_FOUND);
    }
    const task = taskDetails[0];
    if (!task.containers || task.containers.length === 0) {
      throw new Error(targetText.NO_CONTAINERS_IN_TASK);
    }
    if (task.containers.length === 1) {
      this.logger.debug('Task has a single container, using it as target');
      this.containerRuntimeId = task.containers[0].runtimeId;
      this.mediator.target.containerName = task.containers[0].name;
      this.mediator.processedArgs.container = {
        value: task.containers[0].name,
        skippable: true,
      };
      return this;
    }
    const { runtimeId, name } = await select({
      message: targetText.SELECT_CONTAINER_PROMPT,
      choices: task.containers.map((c) => {
        return {
          value: { runtimeId: c.runtimeId, name: c.name },
          name: `${c.name} (${c.image})`,
        };
      }),
    });
    this.containerRuntimeId = runtimeId;
    this.logger.debug(`Resolved runtime ID to ${this.containerRuntimeId}`);
    this.mediator.target.containerName = name;
    this.mediator.processedArgs.container = {
      value: name as string,
      skippable: false,
    };
    return this;
  }
}

import { DesiredStatus, ECSClient } from '@aws-sdk/client-ecs';
import { confirm, select } from '@inquirer/prompts';
import Fuse from 'fuse.js';
import { paginate } from './client/index.js';
import { type RawDescribeTasksInput } from './client/util.js';
import { type Logger } from 'winston';

export class TargetResolver {
  private readonly ecsClient: ECSClient;
  private readonly logger: Logger;
  private clusterName: string | undefined;
  private taskId: string | undefined;
  private containerRuntimeId: string | undefined;
  private serviceName: string | undefined;

  constructor(ecsClient: ECSClient, logger: Logger) {
    this.ecsClient = ecsClient;
    this.clusterName = undefined;
    this.taskId = undefined;
    this.containerRuntimeId = undefined;
    this.serviceName = undefined;
    this.logger = logger;
  }

  private failIfClusterNameIsNotSet() {
    if (!this.clusterName) {
      throw new Error(
        'Cluster name is not set. Did you run `resolveCluster()` first?'
      );
    }
  }

  private failIfTaskIdIsNotSet() {
    if (!this.taskId) {
      throw new Error('Task ID is not set. Did you run `resolveTask()` first?');
    }
  }

  get target(): string {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();
    if (!this.containerRuntimeId) {
      throw new Error('Target container runtime ID was not resolved');
    }
    return `ecs:${this.clusterName}_${this.taskId}_${this.containerRuntimeId}`;
  }

  async resolveCluster(): Promise<TargetResolver> {
    const allClusterArns = await paginate(this.ecsClient, {});
    if (allClusterArns.length === 0) {
      throw new Error('No ECS clusters found');
    }
    const clusterNames = allClusterArns.map((arn) => arn.split('/')[1]);
    if (clusterNames.length === 1) {
      this.logger.debug(
        `There is only one cluster ${clusterNames[0]}, using it`
      );
      this.clusterName = clusterNames[0];
      return this;
    }
    this.logger.debug('Found clusters', clusterNames);
    this.clusterName = await select({
      message: '🌍 Select the target ECS cluster',
      choices: clusterNames.map((value) => ({ value })),
    });
    return this;
  }

  async resolveService(serviceNameLike?: string): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    if (!serviceNameLike) {
      this.logger.debug(
        'Service name not provided, skipping service resolution'
      );
      return this;
    }

    const serviceNames = (
      await paginate(this.ecsClient, {
        cluster: this.clusterName,
      })
    ).map((arn) => arn.split('/').pop());
    if (serviceNames.length === 0) {
      throw new Error('No services found in the cluster');
    }
    const exactMatch = serviceNames.find((name) => name === serviceNameLike);
    if (exactMatch) {
      this.logger.debug('Service name matched exactly');
      this.serviceName = exactMatch;
      return this;
    }

    const potentialServices = new Fuse(serviceNames, {
      shouldSort: true,
    })
      .search(serviceNameLike)
      .map((match) => match.item);
    if (potentialServices.length === 0) {
      throw new Error(
        `No services matching or similar to '${serviceNameLike}' were found`
      );
    }
    if (potentialServices.length === 1) {
      if (
        !(await confirm({
          message: `❔ Found a similarly named service '${potentialServices[0]}', is it OK to use it?`,
        }))
      ) {
        throw new Error('Cannot use the only potential matching service');
      }
      this.serviceName = potentialServices[0];
      return this;
    }
    this.serviceName = await select({
      message:
        '🤔 Multiple similarly named services found, select the one to use',
      choices: potentialServices.map((s) => {
        return { value: s };
      }),
    });
    this.logger.debug('Resolved service name', this.serviceName);
    return this;
  }

  async resolveTask(): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    const allTaskArns = await paginate(this.ecsClient, {
      cluster: this.clusterName,
      serviceName: this.serviceName,
      desiredStatus: DesiredStatus.RUNNING,
    });

    if (allTaskArns.length === 0) {
      throw new Error(
        'No running tasks matching the input parameters were found'
      );
    }

    if (
      allTaskArns.length === 1 ||
      (this.serviceName && allTaskArns.length > 0)
    ) {
      this.logger.debug(
        'Service name is set, selecting the first task as target'
      );
      this.taskId = allTaskArns[0].split('/').pop();
      return this;
    }

    const detailedTasks = await paginate(this.ecsClient, {
      taskArns: allTaskArns,
      clusterName: this.clusterName,
    } as RawDescribeTasksInput);
    this.taskId = await select({
      message: '🤔 Select a matching task',
      choices: detailedTasks.map((task) => {
        return {
          value: task.taskArn?.split('/').pop(),
          description: [
            `Name (tag): ${
              task.tags?.find((tag) => tag.key === 'Name')?.value
            }`,
            `Task definition: ${task.taskDefinitionArn?.split('/').pop()}`,
            'Containers:',
            ...(task.containers?.map((c) => `- ${c.name}; ${c.image}`) || []),
          ].join('\n'),
        };
      }),
    });
    this.logger.debug('Resolved the task to', this.taskId);
    return this;
  }

  async resolveContainer(): Promise<TargetResolver> {
    this.failIfClusterNameIsNotSet();
    this.failIfTaskIdIsNotSet();

    const taskDetails = await paginate(this.ecsClient, {
      taskArns: [this.taskId as string],
      clusterName: this.clusterName,
    } as RawDescribeTasksInput);
    if (taskDetails.length === 0) {
      throw new Error(
        `Task with ID '${this.taskId}' was not found. Did it get evicted in the meantime?`
      );
    }
    const task = taskDetails[0];
    if (!task.containers || task.containers.length === 0) {
      throw new Error(`No containers found inside the task ${this.taskId}`);
    }
    if (task.containers.length === 1) {
      this.logger.debug('Task only has one container, using it as target');
      this.containerRuntimeId = task.containers[0].runtimeId;
      return this;
    }
    this.containerRuntimeId = await select({
      message: '🤔 Select the container that will be used for port forwarding',
      choices: task.containers.map((c) => {
        return {
          value: c.runtimeId,
          name: `${c.name} (${c.image})`,
        };
      }),
    });
    this.logger.debug('Resolved runtime ID to', this.containerRuntimeId);
    return this;
  }
}

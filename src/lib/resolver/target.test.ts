import { ECSClient } from '@aws-sdk/client-ecs';
import { confirm, select } from '@inquirer/prompts';
import { Logger } from 'winston';

import { paginate } from '../client/index.js';
import { mediator } from '../mediator.js';
import { TargetResolver } from './index.js';
import { targetText } from './uiText.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../client/index.js', () => ({
  paginate: vi.fn(),
}));

describe('TargetResolver', () => {
  let ecsClientMock: ECSClient;
  let winstonMock: Logger;
  let targetResolver: TargetResolver;

  beforeEach(() => {
    ecsClientMock = {
      send: vi.fn(),
    } as unknown as ECSClient;
    winstonMock = {
      debug: vi.fn(),
    } as unknown as Logger;
    targetResolver = new TargetResolver(ecsClientMock, winstonMock, mediator);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('target', () => {
    it('should throw an error if clusterName is not set', () => {
      expect(() => targetResolver.target).toThrowError(
        targetText.CLUSTER_NOT_RESOLVED,
      );
    });

    it('should throw an error if taskId is not set', () => {
      targetResolver['clusterName'] = 'test-cluster';
      expect(() => targetResolver.target).toThrowError(
        targetText.TASK_ID_NOT_RESOLVED,
      );
    });

    it('should throw an error if containerRuntimeId is not resolved', () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      expect(() => targetResolver.target).toThrowError(
        targetText.CONTAINER_NOT_RESOLVED,
      );
    });

    it('should return the correct target string', () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      targetResolver['containerRuntimeId'] = 'test-runtime-id';
      expect(targetResolver.target).toBe(
        'ecs:test-cluster_test-task_test-runtime-id',
      );
    });
  });

  describe('resolveCluster', () => {
    it('should resolve and set the cluster name', async () => {
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:cluster/test-cluster',
      ]);
      vi.mocked(select).mockResolvedValueOnce('test-cluster');

      await targetResolver.resolveCluster();

      expect(targetResolver['clusterName']).toBe('test-cluster');
    });

    it('should throw an error if no ECS clusters are found', async () => {
      vi.mocked(paginate).mockResolvedValueOnce([]);

      await expect(targetResolver.resolveCluster()).rejects.toThrowError(
        targetText.NO_CLUSTERS,
      );
    });

    it('should set the cluster name if only one cluster is found', async () => {
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:cluster/test-cluster',
      ]);

      await targetResolver.resolveCluster();

      expect(targetResolver['clusterName']).toBe('test-cluster');
    });

    it('should prompt the user to select a cluster if multiple clusters are found', async () => {
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:cluster/cluster-1',
        'arn:aws:ecs:region:123456789012:cluster/cluster-2',
      ]);
      vi.mocked(select).mockResolvedValueOnce('cluster-2');

      await targetResolver.resolveCluster();

      expect(select).toBeCalledWith({
        message: targetText.SELECT_CLUSTER_PROMPT,
        choices: [{ value: 'cluster-1' }, { value: 'cluster-2' }],
      });
      expect(targetResolver['clusterName']).toBe('cluster-2');
    });
  });

  describe('resolveService', () => {
    it('should throw an error if clusterName is not set', async () => {
      await expect(
        targetResolver.resolveService('test-service'),
      ).rejects.toThrowError(targetText.CLUSTER_NOT_RESOLVED);
    });

    it('should return if no service name was provided to match', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      await expect(targetResolver.resolveService()).resolves.toBe(
        targetResolver,
      );
    });

    it('should resolve and set the service name when an exact match is found', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:service/test-service',
      ]);

      await targetResolver.resolveService('test-service');

      expect(targetResolver['serviceName']).toBe('test-service');
    });
    it('should throw an error if no services are found in the cluster', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([]);

      await expect(
        targetResolver.resolveService('test-service'),
      ).rejects.toThrowError(targetText.NO_SERVICES);
    });

    it('should throw an error if no services match or are similar to the input', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:service/other-unrelated-app',
      ]);

      await expect(
        targetResolver.resolveService('test-service'),
      ).rejects.toThrowError(targetText.SERVICE_NOT_MATCHED);
    });

    it('should resolve and set the service name when a similar match is confirmed', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:service/test-service-similar',
      ]);
      vi.mocked(confirm).mockResolvedValueOnce(true);

      await targetResolver.resolveService('test-service');

      expect(confirm).toBeCalledWith({
        message:
          targetText.CONFIRM_FUZZY_SERVICE + ' (service: test-service-similar)',
      });
      expect(targetResolver['serviceName']).toBe('test-service-similar');
    });

    it('should throw an error if a similar match is not confirmed', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:service/test-service-similar',
      ]);
      vi.mocked(confirm).mockResolvedValueOnce(false);

      await expect(
        targetResolver.resolveService('test-service'),
      ).rejects.toThrowError(targetText.FUZZY_SERVICE_NOT_CONFIRMED);
    });

    it('should resolve and set the service name when multiple similar matches are found and one is selected', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([
        'arn:aws:ecs:region:123456789012:service/test-service-1',
        'arn:aws:ecs:region:123456789012:service/test-service-2',
      ]);
      vi.mocked(select).mockResolvedValueOnce('test-service-2');

      await targetResolver.resolveService('test-service');

      expect(targetResolver['serviceName']).toBe('test-service-2');
    });
  });

  describe('resolveTask', () => {
    it('should throw an error if clusterName is not set', async () => {
      await expect(targetResolver.resolveTask()).rejects.toThrowError(
        targetText.CLUSTER_NOT_RESOLVED,
      );
    });

    it('should resolve and set the task ID', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate)
        .mockResolvedValueOnce([
          'arn:aws:ecs:region:123456789012:task/test-task',
        ])
        .mockResolvedValueOnce([{ taskDefinitionArn: 'foo' }]);

      await targetResolver.resolveTask();

      expect(targetResolver['taskId']).toBe('test-task');
    });

    it('should throw an error if no running tasks are found', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate).mockResolvedValueOnce([]);

      await expect(targetResolver.resolveTask()).rejects.toThrowError(
        targetText.NO_TASKS,
      );
    });

    it('should resolve and set the task ID when serviceName is set and multiple tasks are found', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['serviceName'] = 'test-service';
      vi.mocked(paginate)
        .mockResolvedValueOnce([
          'arn:aws:ecs:region:123456789012:task/test-task-1',
          'arn:aws:ecs:region:123456789012:task/test-task-2',
        ])
        .mockResolvedValueOnce([
          { taskDefinitionArn: 'foo' },
          { taskDefinitionArn: 'bar' },
        ]);

      await targetResolver.resolveTask();

      expect(targetResolver['taskId']).toBe('test-task-1');
    });

    it('should resolve and set the task ID when multiple tasks are found and one is selected', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      vi.mocked(paginate)
        .mockResolvedValueOnce([
          'arn:aws:ecs:region:123456789012:task/test-task-1',
          'arn:aws:ecs:region:123456789012:task/test-task-2',
        ])
        .mockResolvedValueOnce([
          {
            taskArn: 'arn:aws:ecs:region:123456789012:task/test-task-1',
            tags: [{ key: 'Name', value: 'Task 1' }],
            taskDefinitionArn:
              'arn:aws:ecs:region:123456789012:task-def/task-def-1',
            containers: [{ name: 'container-1', image: 'image-1' }],
          },
          {
            taskArn: 'arn:aws:ecs:region:123456789012:task/test-task-2',
            tags: [{ key: 'Name', value: 'Task 2' }],
            taskDefinitionArn:
              'arn:aws:ecs:region:123456789012:task-def/task-def-2',
            containers: [{ name: 'container-2', image: 'image-2' }],
          },
        ]);
      vi.mocked(select).mockResolvedValueOnce({
        taskId: 'test-task-2',
        taskDefinition: 'foo',
      });

      await targetResolver.resolveTask();

      expect(targetResolver['taskId']).toBe('test-task-2');
    });
  });

  describe('resolveContainer', () => {
    it('should throw an error if the task is not found', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      vi.mocked(paginate).mockResolvedValueOnce([]);

      await expect(targetResolver.resolveContainer()).rejects.toThrowError(
        targetText.TASK_NOT_FOUND,
      );
    });

    it('should throw an error if no containers are found in the task', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          containers: [],
        },
      ]);

      await expect(targetResolver.resolveContainer()).rejects.toThrowError(
        targetText.NO_CONTAINERS_IN_TASK,
      );
    });

    it('should resolve and set the container runtime ID when only one container is found', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          containers: [
            {
              runtimeId: 'test-runtime-id',
              name: 'test-container',
              image: 'test-image',
            },
          ],
        },
      ]);

      await targetResolver.resolveContainer();

      expect(targetResolver['containerRuntimeId']).toBe('test-runtime-id');
    });

    it('should resolve and set the container runtime ID when multiple containers are found and one is selected', async () => {
      targetResolver['clusterName'] = 'test-cluster';
      targetResolver['taskId'] = 'test-task';
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          containers: [
            {
              runtimeId: 'runtime-id-1',
              name: 'container-1',
              image: 'image-1',
            },
            {
              runtimeId: 'runtime-id-2',
              name: 'container-2',
              image: 'image-2',
            },
          ],
        },
      ]);
      vi.mocked(select).mockResolvedValueOnce({
        runtimeId: 'runtime-id-2',
        name: 'web',
      });

      await targetResolver.resolveContainer();

      expect(targetResolver['containerRuntimeId']).toBe('runtime-id-2');
    });
  });
});

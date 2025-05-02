import { describe, it, expect, vi } from 'vitest';
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
} from '@aws-sdk/client-ecs';
import {
  paginateClientCommand,
  PaginatedCommandInput,
  paginateDescribeTasksRequest,
} from './util';

vi.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: vi.fn(),
  ListClustersCommand: vi.fn(),
  ListServicesCommand: vi.fn(),
  ListTasksCommand: vi.fn(),
  DescribeTasksCommand: vi.fn(),
}));

describe('clientUtil', () => {
  const mockSend = vi.fn();
  const mockClient = {
    send: mockSend,
  } as unknown as ECSClient;

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('paginateClientCommand', () => {
    it('should paginate ListTasksCommand', async () => {
      mockSend
        .mockResolvedValueOnce({
          taskArns: ['task1', 'task2'],
          nextToken: 'token1',
        })
        .mockResolvedValueOnce({ taskArns: ['task3'], nextToken: undefined });

      const result = await paginateClientCommand(mockClient, {
        desiredStatus: 'RUNNING',
      });

      expect(result).toEqual(['task1', 'task2', 'task3']);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(ListTasksCommand).toHaveBeenCalledWith({
        desiredStatus: 'RUNNING',
        nextToken: undefined,
      });
      expect(ListTasksCommand).toHaveBeenCalledWith({
        desiredStatus: 'RUNNING',
        nextToken: 'token1',
      });
    });

    it('should paginate ListServicesCommand', async () => {
      mockSend.mockResolvedValueOnce({
        serviceArns: ['service1'],
        nextToken: undefined,
      });

      const result = await paginateClientCommand(mockClient, {
        cluster: 'cluster1',
      });

      expect(result).toEqual(['service1']);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListServicesCommand).toHaveBeenCalledWith({
        cluster: 'cluster1',
        nextToken: undefined,
      });
    });

    it('should paginate ListClustersCommand', async () => {
      mockSend.mockResolvedValueOnce({
        clusterArns: ['cluster1', 'cluster2'],
        nextToken: undefined,
      });

      const result = await paginateClientCommand(mockClient, {});

      expect(result).toEqual(['cluster1', 'cluster2']);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListClustersCommand).toHaveBeenCalledWith({
        nextToken: undefined,
      });
    });

    it('should throw an error for unknown input type', async () => {
      await expect(
        paginateClientCommand(mockClient, {
          unknownKey: 'value',
        } as unknown as PaginatedCommandInput)
      ).rejects.toThrow('Unknown ECS client input type');
    });
  });

  describe('paginateDescribeTasksRequest', () => {
    it('should paginate DescribeTasksCommand in batches', async () => {
      mockSend
        .mockResolvedValueOnce({ tasks: [{ taskArn: 'task1' }], failures: [] })
        .mockResolvedValueOnce({ tasks: [{ taskArn: 'task2' }], failures: [] });

      const result = await paginateDescribeTasksRequest(
        mockClient,
        ['task1', 'task2'],
        1
      );

      expect(result).toEqual([{ taskArn: 'task1' }, { taskArn: 'task2' }]);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(DescribeTasksCommand).toHaveBeenCalledWith({ tasks: ['task1'] });
      expect(DescribeTasksCommand).toHaveBeenCalledWith({ tasks: ['task2'] });
    });

    it('should throw an error if there are failures', async () => {
      mockSend.mockResolvedValueOnce({
        failures: [{ arn: 'task1', reason: 'Some error' }],
      });

      await expect(
        paginateDescribeTasksRequest(mockClient, ['task1'])
      ).rejects.toThrow('Failed to describe some tasks:');
    });

    it('should throw an error if no tasks are returned', async () => {
      mockSend.mockResolvedValueOnce({ tasks: [], failures: [] });

      await expect(
        paginateDescribeTasksRequest(mockClient, ['task1'])
      ).rejects.toThrow('No tasks were returned by AWS API');
    });
  });
});

import { ECSClient, Task } from '@aws-sdk/client-ecs';
import { describe, expect, it, Mock, vi } from 'vitest';
import { paginate } from './index';
import { paginateClientCommand, paginateDescribeTasksRequest } from './util';

vi.mock('./util', () => ({
  paginateDescribeTasksRequest: vi.fn(),
  paginateClientCommand: vi.fn(),
}));

describe('paginate', () => {
  const mockClient = {} as ECSClient;

  it('should call paginateDescribeTasksRequest when input is an array of strings', async () => {
    const input = ['task1', 'task2'];
    const mockTasks: Task[] = [{ taskArn: 'task1' }, { taskArn: 'task2' }];
    (paginateDescribeTasksRequest as Mock).mockResolvedValue(mockTasks);

    const result = await paginate(mockClient, input);

    expect(paginateDescribeTasksRequest).toHaveBeenCalledWith(
      mockClient,
      input
    );
    expect(result).toEqual(mockTasks);
  });

  it('should call paginateClientCommand when input is a PaginatedCommandInput', async () => {
    const input = { cluster: 'cluster1' };
    const mockResponse = ['response1', 'response2'];
    (paginateClientCommand as Mock).mockResolvedValue(mockResponse);

    const result = await paginate(mockClient, input);

    expect(paginateClientCommand).toHaveBeenCalledWith(mockClient, input);
    expect(result).toEqual(mockResponse);
  });
});

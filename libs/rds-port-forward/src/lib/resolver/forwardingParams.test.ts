import { Task, type ECSClient } from '@aws-sdk/client-ecs';
import { confirm, input, number, select } from '@inquirer/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from 'winston';
import { paginate } from '../client/index.js';
import { Mediator } from '../mediator.js';
import { ForwardingParamsResolver } from './forwardingParams.js';

vi.mock('../client/index.js', () => ({
  paginate: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  number: vi.fn(),
  select: vi.fn(),
  Separator: vi.fn(),
}));

describe('ForwardingParamsResolver', () => {
  let ecsClient: ECSClient;
  let logger: Logger;
  let mediator: Mediator;
  let resolver: ForwardingParamsResolver;

  beforeEach(() => {
    ecsClient = {
      send: vi.fn(),
    } as unknown as ECSClient;
    logger = { debug: vi.fn(), info: vi.fn() } as unknown as Logger;
    mediator = {
      rawArgs: {},
      processedArgs: {},
      forwardingParams: {},
      target: {},
    } as unknown as Mediator;
    resolver = new ForwardingParamsResolver(ecsClient, logger, mediator);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('forwardingParams', () => {
    it('should return forwarding params if all fields are set', () => {
      resolver['dbHost'] = 'localhost';
      resolver['port'] = '5432';
      resolver['localPort'] = '5432';

      expect(resolver.forwardingParams).toEqual(
        JSON.stringify({
          host: 'localhost',
          portNumber: '5432',
          localPortNumber: '5432',
        })
      );
    });

    it('should throw an error if dbHost is not set', () => {
      resolver['port'] = '5432';
      resolver['localPort'] = '5432';

      expect(() => resolver.forwardingParams).toThrow(
        'DB host is not set. Did you run `resolveDbHost()` first?'
      );
    });

    it('should throw an error if port is not set', () => {
      resolver['dbHost'] = 'localhost';
      resolver['localPort'] = '5432';

      expect(() => resolver.forwardingParams).toThrow(
        'DB port is not set. Did you run `resolveRemotePort()` first?'
      );
    });

    it('should throw an error if localPort is not set', () => {
      resolver['dbHost'] = 'localhost';
      resolver['port'] = '5432';

      expect(() => resolver.forwardingParams).toThrow(
        'Local port is not set. Did you run `resolveLocalPort()` first?'
      );
    });
  });

  describe('resolveDbHost', () => {
    it('should use db-host from CLI parameters', async () => {
      mediator.rawArgs['db-host'] = 'localhost';

      await resolver.resolveDbHost();

      expect(resolver['dbHost']).toBe('localhost');
      expect(mediator.processedArgs['db-host']).toEqual({
        skippable: false,
        value: 'localhost',
      });
    });

    it('should resolve db-host from container ENV', async () => {
      mediator.rawArgs['db-host-from-container-env'] = 'DB_HOST';
      mediator.target = {
        clusterName: 'test',
        containerName: 'foo',
        taskDefinition: 'test',
        taskId: 'test',
      };
      vi.mocked(ecsClient.send).mockImplementationOnce(() => ({
        taskDefinition: {
          containerDefinitions: [
            {
              name: 'foo',
              environment: [
                {
                  name: 'DB_HOST',
                  value: 'localhost',
                },
              ],
            },
          ],
        },
      }));
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          overrides: [],
        },
      ] as Task[]);

      await resolver.resolveDbHost();

      expect(resolver['dbHost']).toBe('localhost');
      expect(mediator.processedArgs['db-host']?.value).toBe('localhost');
    });

    it('should throw an error if ENV variable is not found', async () => {
      mediator.rawArgs['db-host-from-container-env'] = 'DB_HOST';
      mediator.target = {
        clusterName: 'test',
        containerName: 'foo',
        taskDefinition: 'test',
        taskId: 'test',
      };
      vi.mocked(ecsClient.send).mockImplementationOnce(() => ({
        taskDefinition: {
          containerDefinitions: [
            {
              name: 'foo',
              environment: [
                {
                  name: 'FOO',
                  value: 'bar',
                },
              ],
            },
          ],
        },
      }));
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          overrides: [],
        },
      ] as Task[]);

      await expect(resolver.resolveDbHost()).rejects.toThrow(
        "Container ENV (and ENV overrides) doesn't have an ENV variable with the name 'DB_HOST'"
      );
    });

    it('should prompt user to input db-host if not provided', async () => {
      vi.mocked(input).mockResolvedValue('localhost');

      await resolver.resolveDbHost();

      expect(resolver['dbHost']).toBe('localhost');
      expect(mediator.processedArgs['db-host']?.value).toBe('localhost');
    });

    it('should prompt user to select a DB host from container ENV variables', async () => {
      mediator.rawArgs = {};
      mediator.target = {
        clusterName: 'test-cluster',
        containerName: 'test-container',
        taskDefinition: 'test-task',
        taskId: 'test-task-id',
      };
      vi.mocked(ecsClient.send).mockImplementationOnce(() => ({
        taskDefinition: {
          containerDefinitions: [
            {
              name: 'test-container',
              environment: [
                { name: 'DB_HOST', value: 'localhost' },
                { name: 'ANOTHER_ENV', value: 'value' },
              ],
            },
          ],
        },
      }));
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          overrides: [],
        },
      ] as Task[]);
      vi.mocked(confirm).mockResolvedValueOnce(true);
      vi.mocked(select).mockResolvedValueOnce('localhost');

      await resolver.resolveDbHost();

      expect(resolver['dbHost']).toBe('localhost');
      expect(select).toHaveBeenCalledWith({
        message: '🌐 Select ENV variable to use as DB host',
        choices: [
          {
            value: 'localhost',
            description: 'DB_HOST: localhost',
            name: 'DB_HOST',
          },
          {
            value: 'value',
            description: 'ANOTHER_ENV: value',
            name: 'ANOTHER_ENV',
          },
        ],
      });
      expect(mediator.processedArgs['db-host']?.value).toBe('localhost');
    });

    it('should log a message if container ENV is empty', async () => {
      mediator.rawArgs = {};
      mediator.target = {
        clusterName: 'test-cluster',
        containerName: 'test-container',
        taskDefinition: 'test-task',
        taskId: 'test-task-id',
      };
      vi.mocked(ecsClient.send).mockImplementationOnce(() => ({
        taskDefinition: {
          containerDefinitions: [
            {
              name: 'test-container',
              environment: [],
            },
          ],
        },
      }));
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          overrides: [],
        },
      ] as Task[]);
      vi.mocked(confirm).mockResolvedValueOnce(true);

      await resolver.resolveDbHost();

      expect(logger.info).toHaveBeenCalledWith(
        `😿 The target container doesn't have ENV defined`
      );
    });

    it('should throw an error if cluster name is missing', async () => {
      mediator.target = {
        clusterName: undefined,
        containerName: 'test-container',
        taskDefinition: 'test-task',
        taskId: 'test-task-id',
      };
      vi.mocked(confirm).mockResolvedValueOnce(true);
      await expect(resolver.resolveDbHost()).rejects.toThrow(
        'Cluster name was not resolved prior to resolving the DB host through container ENV'
      );
    });

    it('should throw an error if container name is missing', async () => {
      mediator.target = {
        clusterName: 'test-cluster',
        containerName: undefined,
        taskDefinition: 'test-task',
        taskId: 'test-task-id',
      };
      vi.mocked(confirm).mockResolvedValueOnce(true);
      await expect(resolver.resolveDbHost()).rejects.toThrow(
        'Container name was not resolved prior to resolving the DB host through container ENV'
      );
    });

    it('should throw an error if task definition or ID is missing', async () => {
      mediator.target = {
        clusterName: 'test-cluster',
        containerName: 'test-container',
        taskDefinition: undefined,
        taskId: undefined,
      };
      vi.mocked(confirm).mockResolvedValueOnce(true);
      await expect(resolver.resolveDbHost()).rejects.toThrow(
        'Task definition or ID were not resolved prior to resolving the DB host through container ENV'
      );
    });

    it('should take container overrides into account when gathering ENV data', async () => {
      mediator.rawArgs['db-host-from-container-env'] = 'DB_HOST';
      mediator.target = {
        clusterName: 'test',
        containerName: 'foo',
        taskDefinition: 'test',
        taskId: 'test',
      };
      vi.mocked(ecsClient.send).mockImplementationOnce(() => ({
        taskDefinition: {
          containerDefinitions: [
            {
              name: 'foo',
              environment: [
                {
                  name: 'DB_HOST',
                  value: 'localhost',
                },
              ],
            },
          ],
        },
      }));
      vi.mocked(paginate).mockResolvedValueOnce([
        {
          overrides: {
            containerOverrides: [
              {
                name: 'foo',
                environment: [
                  {
                    name: 'DB_HOST',
                    value: 'not.localhost',
                  },
                ],
              },
            ],
          },
        },
      ] as Task[]);

      await resolver.resolveDbHost();

      expect(resolver['dbHost']).toBe('not.localhost');
      expect(mediator.processedArgs['db-host']?.value).toBe('not.localhost');
    });
  });

  describe('resolveRemotePort', () => {
    it('should use port from CLI parameters', async () => {
      mediator.rawArgs.port = '5432';

      await resolver.resolveRemotePort();

      expect(resolver['port']).toBe('5432');
      expect(mediator.processedArgs.port?.value).toBe('5432');
    });

    it('should prompt user to select a port', async () => {
      vi.mocked(select).mockResolvedValue('5432');

      await resolver.resolveRemotePort();

      expect(resolver['port']).toBe('5432');
      expect(mediator.processedArgs.port?.value).toBe('5432');
    });

    it('should prompt user to input a custom port', async () => {
      vi.mocked(select).mockResolvedValue('custom');
      vi.mocked(number).mockResolvedValue(1234);

      await resolver.resolveRemotePort();

      expect(resolver['port']).toBe('1234');
      expect(mediator.processedArgs.port?.value).toBe('1234');
    });
  });

  describe('resolveLocalPort', () => {
    it('should use local-port from CLI parameters', async () => {
      mediator.rawArgs['local-port'] = '5432';

      await resolver.resolveLocalPort();

      expect(resolver['localPort']).toBe('5432');
      expect(mediator.processedArgs['local-port']?.value).toBe('5432');
    });

    it('should use the same local port as the remote port', async () => {
      resolver['port'] = '5432';
      vi.mocked(confirm).mockResolvedValue(true);

      await resolver.resolveLocalPort();

      expect(resolver['localPort']).toBe('5432');
      expect(mediator.processedArgs['local-port']?.value).toBe('5432');
    });

    it('should prompt user to input a custom local port', async () => {
      resolver['port'] = '5432';
      vi.mocked(confirm).mockResolvedValue(false);
      vi.mocked(number).mockResolvedValue(1234);

      await resolver.resolveLocalPort();

      expect(resolver['localPort']).toBe('1234');
      expect(mediator.processedArgs['local-port']?.value).toBe('1234');
    });
  });

  it('should throw an error if remote port is not defined', async () => {
    resolver['port'] = undefined;

    await expect(resolver.resolveLocalPort()).rejects.toThrow(
      'Remote port is not defined. Did you run `resolveRemotePort()` first?'
    );
  });
});

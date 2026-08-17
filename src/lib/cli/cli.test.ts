import { beforeEach, describe, expect, it } from 'vitest';

import { Mediator } from '../mediator.js';
import { CliManager } from './index.js';

describe('CliManager', () => {
  let argv: string[];
  let mediator: Mediator;

  beforeEach(() => {
    mediator = {
      rawArgs: {},
      processedArgs: {},
      forwardingParams: {},
      target: {},
    } as unknown as Mediator;
  });

  describe('constructor', () => {
    it('should parse CLI arguments and initialize incoming args', () => {
      argv = [
        'node',
        'script.js',
        '--cluster',
        'test-cluster',
        '--region',
        'fake',
        '--profile',
        'fake',
      ];
      new CliManager(argv, mediator);

      expect(mediator.rawArgs).toEqual({
        cluster: 'test-cluster',
        service: undefined,
        container: undefined,
        'db-host': undefined,
        'db-host-from-container-env': undefined,
        profile: 'fake',
        region: 'fake',
      });
    });
  });

  describe('equivalent', () => {
    it('should throw an error if equivalent is not set', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      const cliManager = new CliManager(argv, mediator);

      expect(() => cliManager.equivalent).toThrow(
        'There is no collected argument data from resolvers',
      );
    });

    it('should return the equivalent CLI args if set', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      mediator.processedArgs.cluster = {
        value: 'test-cluster',
        skippable: true,
      };
      const cliManager = new CliManager(argv, mediator);

      expect(cliManager.equivalent).toEqual({
        cluster: { value: 'test-cluster', skippable: true },
      });
    });

    it('equivalent args should differ from initial ones when overwritten', () => {
      argv = ['node', 'script.js', '--service', 'test-service'];
      mediator.processedArgs.service = {
        value: 'other-service',
        skippable: false,
      };
      const cliManager = new CliManager(argv, mediator);

      expect(cliManager.equivalent).toEqual({
        service: { value: 'other-service', skippable: false },
      });
    });
  });
  describe('formatCliArgs', () => {
    it('should format all CLI arguments when format is "full"', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      mediator.processedArgs = {
        cluster: { value: 'test-cluster', skippable: false },
        service: { value: 'test-service', skippable: true },
        port: { value: '5432', skippable: false },
      };
      const cliManager = new CliManager(argv, mediator);

      const result = cliManager.formatCliArgs('full');
      expect(result).toMatchSnapshot();
    });

    it('should format only required CLI arguments when format is "only-required"', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      mediator.processedArgs = {
        cluster: { value: 'test-cluster', skippable: false },
        service: { value: 'test-service', skippable: true },
        port: { value: '5432', skippable: false },
      };
      const cliManager = new CliManager(argv, mediator);

      const result = cliManager.formatCliArgs('only-required');
      expect(result).toMatchSnapshot();
    });

    it('should skip arguments with undefined values', () => {
      argv = ['node', 'script.js'];
      mediator.processedArgs = {
        cluster: { value: undefined, skippable: true },
        service: { value: 'test-service', skippable: true },
      };
      const cliManager = new CliManager(argv, mediator);

      const result = cliManager.formatCliArgs('full');
      expect(result).toMatchSnapshot();
    });
  });
});

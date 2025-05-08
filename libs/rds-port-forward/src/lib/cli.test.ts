import { CliManager } from './cli.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { Mediator } from './mediator.js';

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
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      new CliManager(argv, mediator);

      expect(mediator.rawArgs).toEqual({
        cluster: 'test-cluster',
        service: undefined,
        container: undefined,
        'db-host': undefined,
        'db-host-from-container-env': undefined,
      });
    });
  });

  describe('equivalent', () => {
    it('should throw an error if equivalent is not set', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      const cliManager = new CliManager(argv, mediator);

      expect(() => cliManager.equivalent).toThrow(
        'There is no collected argument data from resolvers'
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
});

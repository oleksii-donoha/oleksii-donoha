import { CliManager, CliOptionType } from './cli.js';
import { Logger } from 'winston';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('CliManager', () => {
  let logger: Logger;
  let argv: string[];

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
  });

  describe('constructor', () => {
    it('should parse CLI arguments and initialize incoming args', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      const cliManager = new CliManager(logger, argv);

      expect(cliManager['incoming']).toEqual({
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
      const cliManager = new CliManager(logger, argv);

      expect(() => cliManager.equivalent).toThrow(
        'The equivalent CLI args are not set. Did you forget to set them while processing the target?'
      );
    });

    it('should return the equivalent CLI args if set', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      const cliManager = new CliManager(logger, argv);
      cliManager.markCliOptionAs(
        CliOptionType.Skippable,
        'cluster',
        'test-cluster'
      );

      expect(cliManager.equivalent).toEqual({
        cluster: { value: 'test-cluster', skippable: true },
      });
    });

    it('equivalent args should differ from initial ones when overwritten', () => {
      argv = ['node', 'script.js', '--service', 'test-service'];
      const cliManager = new CliManager(logger, argv);
      cliManager.markCliOptionAs(
        CliOptionType.Required,
        'service',
        'other-service'
      );

      expect(cliManager.equivalent).toEqual({
        service: { value: 'other-service', skippable: false },
      });
    });
  });
  describe('markAs', () => {
    it('should correctly set the skippable flag based on the option type', () => {
      argv = ['node', 'script.js', '--cluster', 'test-cluster'];
      const cliManager = new CliManager(logger, argv);
      cliManager.markCliOptionAs(
        CliOptionType.Skippable,
        'cluster',
        'test-cluster'
      );
      cliManager.markCliOptionAs(
        CliOptionType.Required,
        'container',
        'test-container'
      );

      expect(cliManager.equivalent).toEqual({
        container: { value: 'test-container', skippable: false },
        cluster: { value: 'test-cluster', skippable: true },
      });
    });
  });
});

#!/usr/bin/env node
import { ECSClient } from '@aws-sdk/client-ecs';
import { createLogger, format, transports } from 'winston';

import { CliManager } from './lib/cli.js';
import { mediator } from './lib/mediator.js';
import { OsManager } from './lib/os.js';
import {
  ForwardingParamsResolver,
  TargetResolver,
} from './lib/resolver/index.js';

const main = async () => {
  const cli = new CliManager(process.argv, mediator);
  const logger = createLogger({
    level: mediator.verbose ? 'debug' : 'info',
    transports: new transports.Console({
      format: format.combine(
        format.timestamp(),
        format.colorize({
          colors: { debug: 'yellow', info: 'blue' },
        }),
        format.printf(
          ({ level, message, timestamp }) =>
            `${timestamp} [${level}] ${message}`,
        ),
      ),
    }),
  });
  const osManager = new OsManager(logger);
  const client = new ECSClient({});
  const targetResolver = new TargetResolver(client, logger, mediator);
  let target: string;
  let params: string;
  try {
    target = await targetResolver
      .resolveCluster()
      .then((cluster) => cluster.resolveService())
      .then((service) => service.resolveTask())
      .then((task) => task.resolveContainer())
      .then((container) => container.target);
    const forwardingParamsResolver = new ForwardingParamsResolver(
      client,
      logger,
      mediator,
    );
    params = await forwardingParamsResolver
      .resolveDbHost()
      .then((dbHost) => dbHost.resolveRemotePort())
      .then((port) => port.resolveLocalPort())
      .then((port) => port.forwardingParams);
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      logger.info('👋 Input was interrupted, bye');
      process.exit(0);
    }
    throw error;
  }
  const message = [
    'You can start an identical session next time by running:',
    `\x1b[32m[Required args only]\x1b[0m npx @oleksii-donoha/rds-port-forward -y \\\n ${cli.formatCliArgs(
      'only-required',
    )}`,
    `\x1b[34m[Full command]\x1b[0m npx @oleksii-donoha/rds-port-forward -y \\\n ${cli.formatCliArgs(
      'full',
    )}`,
  ];
  logger.info(message.join('\n\n'));
  const exitCode = await osManager.runSession(target, params);
  process.exit(exitCode ?? 0);
};

main().then();

/* c8 ignore file */
import { ECSClient } from '@aws-sdk/client-ecs';
import { TargetResolver } from './lib/resolver/target.js';
import { createLogger, format, transports } from 'winston';
import { mediator } from './lib/mediator.js';
import { CliManager } from './lib/cli.js';
import { ForwardingParamsResolver } from './lib/resolver/forwardingParams.js';
import { OsManager } from './lib/os.js';

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
            `${timestamp} [${level}] ${message}`
        )
      ),
    }),
  });
  const osManager = new OsManager(logger);
  const client = new ECSClient({});
  const targetResolver = new TargetResolver(client, logger, mediator);
  const target = await targetResolver
    .resolveCluster()
    .then((cluster) => cluster.resolveService())
    .then((service) => service.resolveTask())
    .then((task) => task.resolveContainer())
    .then((container) => container.target);
  const forwardingParamsResolver = new ForwardingParamsResolver(
    client,
    logger,
    mediator
  );
  const params = await forwardingParamsResolver
    .resolveDbHost()
    .then((dbHost) => dbHost.resolveRemotePort())
    .then((port) => port.resolveLocalPort())
    .then((port) => port.forwardingParams);

  const message = [
    'You can start an identical session next time by running:',
    `\x1b[32m[Required args only]\x1b[0m npx @oleksii-donoha/rds-port-forward \\\n ${cli.formatCliArgs(
      'only-required'
    )}`,
    `\x1b[34m[Full command]\x1b[0m npx @oleksii-donoha/rds-port-forward \\\n ${cli.formatCliArgs(
      'full'
    )}`,
  ];
  logger.info(message.join('\n\n'));
  const exitCode = await osManager.runSession(target, params);
  process.exit(exitCode ?? 0);
};

main().then();

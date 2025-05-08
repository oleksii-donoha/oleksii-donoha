/* c8 ignore file */
import { ECSClient } from '@aws-sdk/client-ecs';
import { TargetResolver } from './lib/resolver/target.js';
import { createLogger, format, transports } from 'winston';
import { mediator } from './lib/mediator.js';
import { CliManager } from './lib/cli.js';
import { ForwardingParamsResolver } from './lib/resolver/forwardingParams.js';

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
  const client = new ECSClient({});
  const targetResolver = new TargetResolver(client, logger, mediator);
  const target = await targetResolver
    .resolveCluster()
    .then((cluster) => cluster.resolveService())
    .then((service) => service.resolveTask())
    .then((task) => task.resolveContainer())
    .then((container) => container.target);
  logger.info(target);
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
  logger.info(params);
  logger.info(cli.formatCliArgs('full'));
  logger.info(cli.formatCliArgs('only-required'));
};

main().then();

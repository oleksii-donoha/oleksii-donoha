import { ECSClient } from '@aws-sdk/client-ecs';
import { TargetResolver } from './lib/resolver/target.js';
import { createLogger, format, transports } from 'winston';
import { mediator } from './lib/mediator.js';

const main = async () => {
  const logger = createLogger({
    level: 'debug',
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
  const resolver = new TargetResolver(new ECSClient({}), logger, mediator);
  const target = await resolver
    .resolveCluster()
    .then((cluster) => cluster.resolveService())
    .then((service) => service.resolveTask())
    .then((task) => task.resolveContainer())
    .then((container) => container.target);
  logger.info(target);
};

main().then();

export const enum forwarderText {
  CLUSTER_NOT_RESOLVED = 'Cluster name was not resolved prior to resolving the DB host through container ENV',
  CONTAINER_NOT_RESOLVED = 'Container name was not resolved prior to resolving the DB host through container ENV',
  DB_HOST_INPUT_PROMPT = '✍️ Type in or paste the DB host address',
  DB_HOST_LOOKUP = '🤔 No DB host for forwarding was supplied. Should we try to look it up in the container ENV?',
  DB_HOST_NOT_SET = 'DB host is not set. Did you run `resolveDbHost()` first?',
  DB_PORT_NOT_SET = 'DB port is not set. Did you run `resolveRemotePort()` first?',
  ENV_NOT_DEFINED = "😿 The target container doesn't have ENV defined",
  ENV_VAR_MISSING = "Container ENV (and ENV overrides) doesn't have an ENV variable with such name",
  ENV_VAR_SELECTION = '🌐 Select ENV variable to use as DB host',
  LOCAL_PORT_INPUT_PROMPT = '✍️ Type in or paste the local port',
  LOCAL_PORT_NOT_SET = 'Local port is not set. Did you run `resolveLocalPort()` first?',
  PORT_INPUT_PROMPT = '✍️ Type in or paste the DB port number',
  PORT_SELECTION_PROMPT = '📇 Select a target port of your DB host',
  TASKDEF_NOT_RESOLVED = 'Task definition or ID were not resolved prior to resolving the DB host through container ENV',
  USE_SAME_PORT_PROMPT = '🤔 Use the same local port as the DB port?',
}

export const enum targetText {
  CLUSTER_NOT_RESOLVED = 'Cluster name is not set. Did you run `resolveCluster()` first?',
  CONFIRM_FUZZY_SERVICE = '❔ Found a similarly named service, should we use it?',
  CONTAINER_NOT_RESOLVED = 'Target container runtime ID was not resolved',
  FUZZY_SERVICE_NOT_CONFIRMED = 'Cannot use the only potentially matching service',
  MULTIPLE_FUZZY_SERVICES_FOUND_PROMPT = '🤔 Multiple similarly named services found, select the one to use',
  NO_CLUSTERS = 'No ECS clusters found',
  NO_CONTAINERS_IN_TASK = 'No containers were found inside the specified task',
  NO_SERVICES = 'No services found in the cluster',
  NO_TASKS = 'No running tasks matching the input parameters were found',
  SELECT_CLUSTER_PROMPT = '🌍 Select the target ECS cluster',
  SELECT_CONTAINER_PROMPT = '🤔 Select the container that will be used for port forwarding',
  SELECT_TASK_PROMPT = '🤔 Select a matching task',
  SERVICE_NOT_MATCHED = 'No services with matching or similar name were found',
  TASK_ID_NOT_RESOLVED = 'Task ID is not set. Did you run `resolveTask()` first?',
  TASK_NOT_FOUND = 'Task with the provided ID was not found. Did it get evicted in the meantime?',
}

export const dbPortChoiceMap = {
  '3306': 'MySQL',
  '5432': 'PostgreSQL',
  '27017': 'MongoDB',
  '5439': 'Redshift',
} as const;

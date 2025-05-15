# rds-port-forward

A streamlined way to forward AWS RDS ports locally for ECS-based applications.

![demo.webp](./demo.webp)

## What problem does it solve?

Sometimes developers need to access an RDS database for debugging or development. Unless you have a VPN connection to your VPC or another advanced networking setup, this can be a hassle. It's even more challenging if you don't have persistent infrastructure and run your apps in ECS with Fargate or container instances.

However, hidden in the depths of the [AWS documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding) lies the solution: the already familiar `aws ssm start-session`.

Chances are, you already have an ECS app that has network connectivity to the desired RDS or Redshift instance. So you can run this CLI command:

```sh
aws ssm start-session \
    --target ecs:<ECS_cluster_name>_<ECS_container_ID>_<container_runtime_ID> \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":["URL"],"portNumber":["port_number"], "localPortNumber":["port_number"]}'
```

But wait, how do you get the information needed to construct the correct `target`? Won't these parameters change frequently as tasks are recreated?

You can follow [this article](https://aws.plainenglish.io/using-ecs-fargate-with-local-port-forwarding-to-aws-resources-in-private-subnet-9ed2e3f4c5fb) to see the steps required each time to set up a port forwarding session. In my opinion, this is fairly discouraging when done on a daily basis.

## What does it offer?

`rds-port-forward` wraps the process of retrieving the necessary parameters in an interactive session. Based on user input (or lack thereof), it will query the ECS service and provide choices where necessary.

In the end, it will print an equivalent CLI command that can be used to start an identical port forwarding session again. Some volatile parts of the target (container ID, runtime ID) will be resolved based on higher-level inputs (where possible), producing replayable sessions.

Additionally, this tool can help look up the DB hostname: it is not uncommon to have the DB host listed in a container's environment variables, so the script can prompt the user to select a matching environment variable. It is also possible to specify that environment variable name as a CLI parameter if it is known beforehand.

## CLI interface

All arguments are optional. If an argument is not defined, the tool will prompt for input or a choice where multiple options are available.

```sh
Options:
  --help                        Show help                                                                                  [boolean]
  --cluster                     Name of the ECS cluster where the target resides                                            [string]
  --service                     Name (fuzzy) of the service that hosts the target task
                                Recommended when dealing with large clusters
                                with many tasks                                                                             [string]
  --container                   Name (fuzzy) of the container that will be used to forward the port                         [string]
  --db-host                     Hostname (or IP address) of the DB instance to which the local port will be forwarded       [string]
  --db-host-from-container-env  Target container's environment variable whose value points to the DB hostname (or IP)       [string]
  --port                        Remote port to forward traffic to                                                           [string]
  --local-port                  Port on your machine that will listen for requests                                           [string]
  --verbose                     Prints more logs for debugging                                                             [boolean]
  --profile                     AWS CLI profile to use                                                                      [string]
  --region                      AWS region for the request                                                                  [string]
```

### Fuzzy options

Service and container arguments are fuzzy, meaning the tool will try to match them, but if the name doesn't match exactly, it will prompt for a choice. So if your naming convention results in `very-long-service-names-that-are-hard-to-remember-prod`, you can try a more human-friendly `remember-prod` and `rds-port-forward` will try to guide you.

### A note on `service`

The service name plays a smaller role in determining the target, but it is very helpful in narrowing down the options. If your cluster is highly populated, it is recommended to specify `--service`; otherwise, you will be prompted to select from many running tasks.

## Intended use case

This tool was designed with development and debugging tasks in mind. Due to the nature of the solution, keep the following in mind:

- Port forwarding consumes some (not much) resources of the target container. I don't have specific numbers, and it might depend on the data transfer rate. Be aware of this if your task is on a tight CPU budget (Fargate).

- Tasks can die at any point; it is the nature of container-based applications. Your port forwarding session could be interrupted.

Take appropriate precautions if you intend to use this tool for any sort of critical application where data loss is not acceptable.

### Port forwarding to services other than RDS

As long as your ECS task has network connectivity to a remote host, it should be possible to forward the port of that host. So you can potentially use this tool (and AWS CLI, naturally) to initiate such a connection. This type of use was not tested as it wasn't in scope.

## Security and permissions

`rds-port-forward` uses AWS CLI and AWS SDK v3 for JavaScript to make calls, and uses a typical AWS credential provider chain. In other words, it will use the credentials available in the environment and will have as many permissions as the AWS CLI profile it is allowed to use.

### User IAM permissions

An administrative role to invoke and manage all port forwarding sessions would look like this:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "ssm:StartSession",
                "ssm:TerminateSession",
                "ssm:ResumeSession",
                "ssm:DescribeSessions",
                "ssm:GetConnectionStatus"
            ],
            "Effect": "Allow",
            "Resource": [
                "*"
            ]
        }
    ]
}
```

To limit the permissions, take a look at the [AWS Documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-restrict-access-quickstart.html).

### ECS task role permissions

Make sure the task role of your target task includes the following permissions:

```json
{
   "Version": "2012-10-17",
   "Statement": [
       {
       "Effect": "Allow",
       "Action": [
            "ssmmessages:CreateControlChannel",
            "ssmmessages:CreateDataChannel",
            "ssmmessages:OpenControlChannel",
            "ssmmessages:OpenDataChannel"
       ],
      "Resource": "*"
      }
   ]
}
```

## Development

Run `nx run @oleksii-donoha/rds-port-forward:cli` to build and run the CLI. Provide CLI arguments by adding `--args=--<arg> ...`.

Run `nx build rds-port-forward` to only build the library.

Run `npx nx test rds-port-forward` to run the unit tests.

# rds-port-forward

A more streamlined way to forward AWS RDS port locally for ECS-based applications.

## What problem does it solve?

Sometimes developers need to access RDS DB for debugging or coding. Unless you have a VPN connection to your VPC or any other advanced networking setup, it can be a hassle to achieve. Even more so if you don't have persistent infrastructure and run your apps in ECS with Fargate or container instances.

But hidden in the depths of [AWS documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding) lies the solution: the already familiar `aws ssm start-session`.

Chances are, you already have an ECS app that has network connection to the desired RDS or Redshift instance. So you can call this CLI command:

```sh
aws ssm start-session \
    --target ecs:<ECS_cluster_name>_<ECS_container_ID>_<container_runtime_ID> \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":["URL"],"portNumber":["port_number"], "localPortNumber":["port_number"]}'
```

But wait, how do we get the info we need to compile the correct `target`? Won't these parameters change all the time as tasks get recreated?

You can follow along [this article](https://aws.plainenglish.io/using-ecs-fargate-with-local-port-forwarding-to-aws-resources-in-private-subnet-9ed2e3f4c5fb) to see the steps you would need to take every time to set up a port forwarding session. In my opinion, fairly discouraging when done on a daily basis.

## What does it offer?

`rds-port-forward` wraps the process of retrieving the necessary parameters in an interactive session. Based on user's input (or lack thereof), it will query ECS service and provide user with some choices where necessary.

In the end, it will print an equivalent CLI command that will start an identical port forwarding session again. Some volatile parts of the target (container ID, runtime ID) will be resolved based on more high-level inputs (where possible), producing replay-able sessions.

In addition to the above, this tool can help look up the DB hostname: it is not uncommon to have the DB host listed in container ENV, so the script can prompt user to select a matching ENV var. It is also possible to specify that ENV variable name as a CLI parameter if it is known beforehand.

## Building

Run `nx build rds-port-forward` to build the library.

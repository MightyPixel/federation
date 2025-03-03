---
title: Federated trace data
description: Reporting fine-grained performance metrics
---

One of the many benefits of using GraphQL as an API layer is that it enables fine-grained, field-level [tracing](/graphos/metrics/#resolver-level-traces) of every executed operation. The [GraphOS platform](/graphos/) can consume and aggregate these traces to provide detailed insights into your supergraph's usage and performance.

Your supergraph's router can generate **federated traces** and [report them to GraphOS](/graphos/metrics/sending-operation-metrics). A federated trace is assembled from timing and error information provided by each subgraph that helps resolve a particular operation.

## Reporting flow

The overall flow of a federated trace is as follows:

1. The router receives an operation from a client.
2. The router generates a [query plan](./query-plans/) for the operation and delegates sub-queries to individual subgraphs.
3. Each queried subgraph returns response data to the router.
    - The [`extensions`](/resources/graphql-glossary/#extensions) field of each response includes trace data for the corresponding sub-query.
    - **The subgraph must support the federated trace format to include trace data in its response!** See [this section](#in-your-subgraphs).
4. The router collects the set of sub-query traces from subgraphs and arranges them in the shape of the query plan.
5. The router [reports the federated trace to GraphOS](/graphos/metrics/sending-operation-metrics/) for processing.

In summary, subgraphs report timing and error information to the router, and the router is responsible for aggregating those metrics and reporting them to GraphOS.

## Enabling federated tracing

### In your subgraphs

For a subgraph to include trace data in its responses to your router, it must use a subgraph-compatible library that supports the trace format.

To check whether your subgraph library supports federated tracing, see the `FEDERATED TRACING` entry for the library on [this page](./building-supergraphs/supported-subgraphs/).

If your library _does_ support federated tracing, see its documentation to learn how to enable the feature.

> If your subgraph uses Apollo Server with `@apollo/subgraph`, federated tracing is enabled by default. You can customize this behavior with Apollo Server's [inline trace plugin](/apollo-server/api/plugin/inline-trace).

### In the Apollo Router

See [Sending Apollo Router usage data to GraphOS](/router/configuration/telemetry/apollo-telemetry).

### In `@apollo/gateway`

You can use the `@apollo/server` package's [built-in usage reporting plugin](/apollo-server/api/plugin/usage-reporting) to enable federated tracing for your gateway. Provide an API key to your gateway via the `APOLLO_KEY` environment variable for the gateway to report metrics to the default ingress. To ensure that subgraphs do not report metrics as well, either do not provide them with an `APOLLO_KEY` or install the [`ApolloServerPluginUsageReportingDisabled` plugin](https://www.apollographql.com/docs/apollo-server/api/plugin/usage-reporting/) in your `ApolloServer`.

These options will cause the Apollo gateway to collect tracing information from the underlying subgraphs and pass them on, along with the query plan, to the Apollo metrics ingress.

> **Note:** By default, metrics are reported to the `current` GraphOS variant. To change the variant for reporting, set the `APOLLO_GRAPH_VARIANT` environment variable.

## How tracing data is exposed from a subgraph

> **Note:** This section explains how your router communicates with subgraphs around encoded tracing information. It is not necessary to understand in order to enable federated tracing.

Your router inspects the `extensions` field of all subgraph responses for the presence of an `ftv1` field. This field contains a representation of the tracing information for the sub-query that was executed against the subgraph, sent as the Base64 encoding of the [protobuf representation](https://github.com/apollographql/apollo-server/blob/main/packages/usage-reporting-protobuf/src/reports.proto) of the trace.

To obtain this information from a subgraph, the router includes the header pair `'apollo-federation-include-trace': 'ftv1'` in its request (if it's [configured to collect trace data](#in-the-apollo-router)). If the subgraph [supports federated traces](#in-your-subgraphs), it attaches tracing information in the `extensions` field of its response.

## How traces are constructed and aggregated

Your router constructs traces in the shape of the [query plan](./query-plans/), embedding an individual `Trace` for each fetch that is performed in the query plan. This indicates the sub-query traces, as well as which order they were fetched from the underlying subgraphs.

The field-level statistics that Apollo aggregates from these traces are collected for the fields over which the operation was executed **in the subgraphs**. In other words, field stats are collected based on the operations the query planner makes, instead of the operations that the clients make. On the other hand, operation-level statistics are aggregated over the operations executed **by the client**, which means that even if query-planning changes, statistics still correspond to the same client-delivered operation.

## How errors work

The Apollo Platform provides functionality to modify error details for the client, via the [`formatError`](/apollo-server/data/errors#for-client-responses) option. Additionally, there is functionality to support modifying error details for the metrics ingress, via the [`sendErrors`](/apollo-server/data/errors#for-apollo-studio-reporting) option to the [inline trace plugin](/apollo-server/api/plugin/inline-trace/).

When modifying errors for the client, you might want to use this option to hide implementation details, like database errors, from your users. When modifying errors for reporting, you might want to obfuscate or redact personal information, like user IDs or emails.

Since federated metrics collection works by collecting latency and error information from a set of distributed subgraphs, **these options are respected from those subgraphs** as well as from the router. Subgraphs embed errors in their `ftv1` extension after the `rewriteError` method (passed to the inline trace plugin in the subgraph, not the usage reporting plugin in the gateway!) is applied, and the gateway only reports the errors that are sent via that extension, ignoring the format that downstream errors are reported to end users. This functionality enables subgraph implementers to determine how error information should be displayed to both users and in metrics without needing the gateway to contain any logic that might be subgraph-specific.

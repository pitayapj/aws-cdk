import { Construct } from 'constructs';
import { KinesisMetrics } from './kinesis-fixed-canned-metrics';
import { CfnStream } from './kinesis.generated';
import { ResourcePolicy } from './resource-policy';
import * as cloudwatch from '../../aws-cloudwatch';
import * as iam from '../../aws-iam';
import * as kms from '../../aws-kms';
import { ArnFormat, Aws, CfnCondition, Duration, Fn, IResolvable, IResource, RemovalPolicy, Resource, ResourceProps, Stack, Token, ValidationError } from '../../core';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

const READ_OPERATIONS = [
  'kinesis:DescribeStreamSummary',
  'kinesis:GetRecords',
  'kinesis:GetShardIterator',
  'kinesis:ListShards',
  'kinesis:SubscribeToShard',
  'kinesis:DescribeStream',
  'kinesis:ListStreams',
  'kinesis:DescribeStreamConsumer',
];

const UNSUPPORTED_RESOURCE_POLICY_READ_OPERATIONS = new Set<string>([
  'kinesis:DescribeStreamConsumer',
  'kinesis:ListStreams',
  'kinesis:SubscribeToShard',
]);

const WRITE_OPERATIONS = [
  'kinesis:ListShards',
  'kinesis:PutRecord',
  'kinesis:PutRecords',
];

/**
 * A Kinesis Stream
 */
export interface IStream extends IResource {
  /**
   * The ARN of the stream.
   *
   * @attribute
   */
  readonly streamArn: string;

  /**
   * The name of the stream
   *
   * @attribute
   */
  readonly streamName: string;

  /**
   * Optional KMS encryption key associated with this stream.
   */
  readonly encryptionKey?: kms.IKey;

  /**
   * Adds a statement to the IAM resource policy associated with this stream.
   *
   * If this stream was created in this stack (`new Stream`), a resource policy
   * will be automatically created upon the first call to `addToResourcePolicy`. If
   * the stream is imported (`Stream.import`), then this is a no-op.
   */
  addToResourcePolicy(statement: iam.PolicyStatement): iam.AddToResourcePolicyResult;

  /**
   * Grant read permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to ues the key to decrypt the
   * contents of the stream will also be granted.
   */
  grantRead(grantee: iam.IGrantable): iam.Grant;

  /**
   * Grant write permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to ues the key to encrypt the
   * contents of the stream will also be granted.
   */
  grantWrite(grantee: iam.IGrantable): iam.Grant;

  /**
   * Grants read/write permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to use the key for
   * encrypt/decrypt will also be granted.
   */
  grantReadWrite(grantee: iam.IGrantable): iam.Grant;

  /**
   * Grant the indicated permissions on this stream to the provided IAM principal.
   */
  grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant;

  /**
   * Return stream metric based from its metric name
   *
   * @param metricName name of the stream metric
   * @param props properties of the metric
   */
  metric(metricName: string, props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of bytes retrieved from the Kinesis stream, measured over the specified time period. Minimum, Maximum,
   * and Average statistics represent the bytes in a single GetRecords operation for the stream in the specified time
   * period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricGetRecordsBytes(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The age of the last record in all GetRecords calls made against a Kinesis stream, measured over the specified time
   * period. Age is the difference between the current time and when the last record of the GetRecords call was written
   * to the stream. The Minimum and Maximum statistics can be used to track the progress of Kinesis consumer
   * applications. A value of zero indicates that the records being read are completely caught up with the stream.
   *
   * The metric defaults to maximum over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricGetRecordsIteratorAgeMilliseconds(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The time taken per GetRecords operation, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricGetRecordsLatency(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of records retrieved from the shard, measured over the specified time period. Minimum, Maximum, and
   * Average statistics represent the records in a single GetRecords operation for the stream in the specified time
   * period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricGetRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of successful GetRecords operations per stream, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricGetRecordsSuccess(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of bytes successfully put to the Kinesis stream over the specified time period. This metric includes
   * bytes from PutRecord and PutRecords operations. Minimum, Maximum, and Average statistics represent the bytes in a
   * single put operation for the stream in the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricIncomingBytes(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of records successfully put to the Kinesis stream over the specified time period. This metric includes
   * record counts from PutRecord and PutRecords operations. Minimum, Maximum, and Average statistics represent the
   * records in a single put operation for the stream in the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricIncomingRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of bytes put to the Kinesis stream using the PutRecord operation over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordBytes(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The time taken per PutRecord operation, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordLatency(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of successful PutRecord operations per Kinesis stream, measured over the specified time period. Average
   * reflects the percentage of successful writes to a stream.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordSuccess(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of bytes put to the Kinesis stream using the PutRecords operation over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsBytes(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The time taken per PutRecords operation, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsLatency(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   *  The number of PutRecords operations where at least one record succeeded, per Kinesis stream, measured over the
   *  specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsSuccess(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The total number of records sent in a PutRecords operation per Kinesis data stream, measured over the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsTotalRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of successful records in a PutRecords operation per Kinesis data stream, measured over the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsSuccessfulRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of records rejected due to internal failures in a PutRecords operation per Kinesis data stream,
   * measured over the specified time period. Occasional internal failures are to be expected and should be retried.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsFailedRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of records rejected due to throttling in a PutRecords operation per Kinesis data stream, measured over
   * the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordsThrottledRecords(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of GetRecords calls throttled for the stream over the specified time period. The most commonly used
   * statistic for this metric is Average.
   *
   * When the Minimum statistic has a value of 1, all records were throttled for the stream during the specified time
   * period.
   *
   * When the Maximum statistic has a value of 0 (zero), no records were throttled for the stream during the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties
   *
   * @param props properties of the metric
   *
   */
  metricReadProvisionedThroughputExceeded(props?: cloudwatch.MetricOptions): cloudwatch.Metric;

  /**
   * The number of records rejected due to throttling for the stream over the specified time period. This metric
   * includes throttling from PutRecord and PutRecords operations.
   *
   * When the Minimum statistic has a non-zero value, records were being throttled for the stream during the specified
   * time period.
   *
   * When the Maximum statistic has a value of 0 (zero), no records were being throttled for the stream during the
   * specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricWriteProvisionedThroughputExceeded(props?: cloudwatch.MetricOptions): cloudwatch.Metric;
}

/**
 * A reference to a stream. The easiest way to instantiate is to call
 * `stream.export()`. Then, the consumer can use `Stream.import(this, ref)` and
 * get a `Stream`.
 */
export interface StreamAttributes {
  /**
   * The ARN of the stream.
   */
  readonly streamArn: string;

  /**
   * The KMS key securing the contents of the stream if encryption is enabled.
   *
   * @default - No encryption
   */
  readonly encryptionKey?: kms.IKey;
}

/**
 * Represents a Kinesis Stream.
 */
abstract class StreamBase extends Resource implements IStream {
  /**
   * The ARN of the stream.
   */
  public abstract readonly streamArn: string;

  /**
   * The name of the stream
   */
  public abstract readonly streamName: string;

  /**
   * Optional KMS encryption key associated with this stream.
   */
  public abstract readonly encryptionKey?: kms.IKey;

  /**
   * Indicates if a stream resource policy should automatically be created upon
   * the first call to `addToResourcePolicy`.
   *
   * Set by subclasses.
   */
  protected abstract readonly autoCreatePolicy: boolean;

  private resourcePolicy?: ResourcePolicy;

  constructor(scope: Construct, id: string, props: ResourceProps = {}) {
    super(scope, id, props);

    this.node.addValidation({ validate: () => this.resourcePolicy?.document.validateForResourcePolicy() ?? [] });
  }

  /**
   * Adds a statement to the IAM resource policy associated with this stream.
   *
   * If this stream was created in this stack (`new Stream`), a resource policy
   * will be automatically created upon the first call to `addToResourcePolicy`. If
   * the stream is imported (`Stream.import`), then this is a no-op.
   */
  public addToResourcePolicy(statement: iam.PolicyStatement): iam.AddToResourcePolicyResult {
    if (!this.resourcePolicy && this.autoCreatePolicy) {
      this.resourcePolicy = new ResourcePolicy(this, 'Policy', { stream: this });
    }

    if (this.resourcePolicy) {
      this.resourcePolicy.document.addStatements(statement);
      return { statementAdded: true, policyDependable: this.resourcePolicy };
    }
    return { statementAdded: false };
  }

  /**
   * Grant read permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to ues the key to decrypt the
   * contents of the stream will also be granted.
   */
  public grantRead(grantee: iam.IGrantable) {
    const ret = this.grant(grantee, ...READ_OPERATIONS);

    if (this.encryptionKey) {
      this.encryptionKey.grantDecrypt(grantee);
    }

    return ret;
  }

  /**
   * Grant write permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to ues the key to encrypt the
   * contents of the stream will also be granted.
   */
  public grantWrite(grantee: iam.IGrantable) {
    const ret = this.grant(grantee, ...WRITE_OPERATIONS);
    this.encryptionKey?.grantEncrypt(grantee);

    return ret;
  }

  /**
   * Grants read/write permissions for this stream and its contents to an IAM
   * principal (Role/Group/User).
   *
   * If an encryption key is used, permission to use the key for
   * encrypt/decrypt will also be granted.
   */
  public grantReadWrite(grantee: iam.IGrantable) {
    const ret = this.grant(grantee, ...Array.from(new Set([...READ_OPERATIONS, ...WRITE_OPERATIONS])));
    this.encryptionKey?.grantEncryptDecrypt(grantee);

    return ret;
  }

  /**
   * Grant the indicated permissions on this stream to the given IAM principal (Role/Group/User).
   */
  public grant(grantee: iam.IGrantable, ...actions: string[]) {
    return iam.Grant.addToPrincipalOrResource({
      grantee,
      actions,
      resourceArns: [this.streamArn],
      resource: {
        addToResourcePolicy: (statement) => {
          // filter out actions not supported by stream resource policy (defined in {@link READ_OPERATIONS} and {@link WRITE_OPERATIONS})
          const filteredActions = statement.actions.filter(action => !UNSUPPORTED_RESOURCE_POLICY_READ_OPERATIONS.has(action));
          if (filteredActions.length > 0) {
            const filteredActionsStatement = statement.copy({
              actions: filteredActions,
            });
            return this.addToResourcePolicy(filteredActionsStatement);
          }
          return { statementAdded: false };
        },
        node: this.node,
        stack: this.stack,
        env: this.env,
        applyRemovalPolicy: x => this.applyRemovalPolicy(x),
      },
    });
  }

  /**
   * Return stream metric based from its metric name
   *
   * @param metricName name of the stream metric
   * @param props properties of the metric
   */
  public metric(metricName: string, props?: cloudwatch.MetricOptions) {
    return new cloudwatch.Metric({
      namespace: 'AWS/Kinesis',
      metricName,
      dimensionsMap: {
        StreamName: this.streamName,
      },
      ...props,
    }).attachTo(this);
  }

  /**
   * The number of bytes retrieved from the Kinesis stream, measured over the specified time period. Minimum, Maximum,
   * and Average statistics represent the bytes in a single GetRecords operation for the stream in the specified time
   * period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricGetRecordsBytes(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.getRecordsBytesAverage, props);
  }

  /**
   * The age of the last record in all GetRecords calls made against a Kinesis stream, measured over the specified time
   * period. Age is the difference between the current time and when the last record of the GetRecords call was written
   * to the stream. The Minimum and Maximum statistics can be used to track the progress of Kinesis consumer
   * applications. A value of zero indicates that the records being read are completely caught up with the stream.
   *
   * The metric defaults to maximum over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricGetRecordsIteratorAgeMilliseconds(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.getRecordsIteratorAgeMillisecondsMaximum, props);
  }

  /**
   * The number of successful GetRecords operations per stream, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricGetRecordsSuccess(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.getRecordsSuccessAverage, props);
  }

  /**
   * The number of records retrieved from the shard, measured over the specified time period. Minimum, Maximum, and
   * Average statistics represent the records in a single GetRecords operation for the stream in the specified time
   * period.
   *
   * average
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricGetRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.getRecordsRecordsAverage, props);
  }

  /**
   * The number of successful GetRecords operations per stream, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricGetRecordsLatency(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.getRecordsLatencyAverage, props);
  }

  /**
   * The number of bytes put to the Kinesis stream using the PutRecord operation over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordBytes(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordBytesAverage, props);
  }

  /**
   * The time taken per PutRecord operation, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  metricPutRecordLatency(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordLatencyAverage, props);
  }

  /**
   * The number of successful PutRecord operations per Kinesis stream, measured over the specified time period. Average
   * reflects the percentage of successful writes to a stream.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordSuccess(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordSuccessAverage, props);
  }

  /**
   * The number of bytes put to the Kinesis stream using the PutRecords operation over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsBytes(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsBytesAverage, props);
  }

  /**
   * The time taken per PutRecords operation, measured over the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsLatency(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsLatencyAverage, props);
  }

  /**
   *  The number of PutRecords operations where at least one record succeeded, per Kinesis stream, measured over the
   *  specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsSuccess(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsSuccessAverage, props);
  }

  /**
   * The total number of records sent in a PutRecords operation per Kinesis data stream, measured over the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsTotalRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsTotalRecordsAverage, props);
  }

  /**
   * The number of successful records in a PutRecords operation per Kinesis data stream, measured over the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsSuccessfulRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsSuccessfulRecordsAverage, props);
  }

  /**
   * The number of records rejected due to internal failures in a PutRecords operation per Kinesis data stream,
   * measured over the specified time period. Occasional internal failures are to be expected and should be retried.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsFailedRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsFailedRecordsAverage, props);
  }

  /**
   * The number of records rejected due to throttling in a PutRecords operation per Kinesis data stream, measured over
   * the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricPutRecordsThrottledRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.putRecordsThrottledRecordsAverage, props);
  }

  /**
   * The number of bytes successfully put to the Kinesis stream over the specified time period. This metric includes
   * bytes from PutRecord and PutRecords operations. Minimum, Maximum, and Average statistics represent the bytes in a
   * single put operation for the stream in the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricIncomingBytes(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.incomingBytesAverage, props);
  }

  /**
   * The number of records successfully put to the Kinesis stream over the specified time period. This metric includes
   * record counts from PutRecord and PutRecords operations. Minimum, Maximum, and Average statistics represent the
   * records in a single put operation for the stream in the specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricIncomingRecords(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.incomingRecordsAverage, props);
  }

  /**
   * The number of GetRecords calls throttled for the stream over the specified time period. The most commonly used
   * statistic for this metric is Average.
   *
   * When the Minimum statistic has a value of 1, all records were throttled for the stream during the specified time
   * period.
   *
   * When the Maximum statistic has a value of 0 (zero), no records were throttled for the stream during the specified
   * time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties
   *
   * @param props properties of the metric
   *
   */
  public metricReadProvisionedThroughputExceeded(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.readProvisionedThroughputExceededAverage, props);
  }

  /**
   * The number of records rejected due to throttling for the stream over the specified time period. This metric
   * includes throttling from PutRecord and PutRecords operations.
   *
   * When the Minimum statistic has a non-zero value, records were being throttled for the stream during the specified
   * time period.
   *
   * When the Maximum statistic has a value of 0 (zero), no records were being throttled for the stream during the
   * specified time period.
   *
   * The metric defaults to average over 5 minutes, it can be changed by passing `statistic` and `period` properties.
   *
   * @param props properties of the metric
   */
  public metricWriteProvisionedThroughputExceeded(props?: cloudwatch.MetricOptions) {
    return this.metricFromCannedFunction(KinesisMetrics.writeProvisionedThroughputExceededAverage, props);
  }

  // create metrics based on generated KinesisMetrics static methods
  private metricFromCannedFunction(
    createCannedProps: (dimensions: { StreamName: string }) => cloudwatch.MetricProps,
    props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    return new cloudwatch.Metric({
      ...createCannedProps({ StreamName: this.streamName }),
      ...props,
    }).attachTo(this);
  }
}

/**
 * Properties for a Kinesis Stream
 */
export interface StreamProps {
  /**
   * Enforces a particular physical stream name.
   * @default <generated>
   */
  readonly streamName?: string;

  /**
   * The number of hours for the data records that are stored in shards to remain accessible.
   * @default Duration.hours(24)
   */
  readonly retentionPeriod?: Duration;

  /**
   * The number of shards for the stream.
   *
   * Can only be provided if streamMode is Provisioned.
   *
   * @default 1
   */
  readonly shardCount?: number;

  /**
   * The kind of server-side encryption to apply to this stream.
   *
   * If you choose KMS, you can specify a KMS key via `encryptionKey`. If
   * encryption key is not specified, a key will automatically be created.
   *
   * @default - StreamEncryption.KMS if encrypted Streams are supported in the region
   *   or StreamEncryption.UNENCRYPTED otherwise.
   *   StreamEncryption.KMS if an encryption key is supplied through the encryptionKey property
   */
  readonly encryption?: StreamEncryption;

  /**
   * External KMS key to use for stream encryption.
   *
   * The 'encryption' property must be set to "Kms".
   *
   * @default - Kinesis Data Streams master key ('/alias/aws/kinesis').
   *   If encryption is set to StreamEncryption.KMS and this property is undefined, a new KMS key
   *   will be created and associated with this stream.
   */
  readonly encryptionKey?: kms.IKey;

  /**
   * The capacity mode of this stream.
   *
   * @default StreamMode.PROVISIONED
   */
  readonly streamMode?: StreamMode;

  /**
   * Policy to apply when the stream is removed from the stack.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * A Kinesis stream. Can be encrypted with a KMS key.
 */
@propertyInjectable
export class Stream extends StreamBase {
  /**
   * Uniquely identifies this class.
   */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-kinesis.Stream';

  /**
   * Import an existing Kinesis Stream provided an ARN
   *
   * @param scope The parent creating construct (usually `this`).
   * @param id The construct's name
   * @param streamArn Stream ARN (i.e. arn:aws:kinesis:<region>:<account-id>:stream/Foo)
   */
  public static fromStreamArn(scope: Construct, id: string, streamArn: string): IStream {
    return Stream.fromStreamAttributes(scope, id, { streamArn });
  }

  /**
   * Creates a Stream construct that represents an external stream.
   *
   * @param scope The parent creating construct (usually `this`).
   * @param id The construct's name.
   * @param attrs Stream import properties
   */
  public static fromStreamAttributes(scope: Construct, id: string, attrs: StreamAttributes): IStream {
    class Import extends StreamBase {
      public readonly streamArn = attrs.streamArn;
      public readonly streamName = Stack.of(scope).splitArn(attrs.streamArn, ArnFormat.SLASH_RESOURCE_NAME).resourceName!;
      public readonly encryptionKey = attrs.encryptionKey;

      protected readonly autoCreatePolicy = false;
    }

    return new Import(scope, id, {
      environmentFromArn: attrs.streamArn,
    });
  }

  public readonly streamArn: string;
  public readonly streamName: string;
  public readonly encryptionKey?: kms.IKey;

  private readonly stream: CfnStream;

  protected readonly autoCreatePolicy = true;

  constructor(scope: Construct, id: string, props: StreamProps = {}) {
    super(scope, id, {
      physicalName: props.streamName,
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    let shardCount = props.shardCount;
    const streamMode = props.streamMode;

    if (streamMode === StreamMode.ON_DEMAND && shardCount !== undefined) {
      throw new ValidationError(`streamMode must be set to ${StreamMode.PROVISIONED} (default) when specifying shardCount`, this);
    }
    if ((streamMode === StreamMode.PROVISIONED || streamMode === undefined) && shardCount === undefined) {
      shardCount = 1;
    }

    const retentionPeriodHours = props.retentionPeriod?.toHours() ?? 24;
    if (!Token.isUnresolved(retentionPeriodHours)) {
      if (retentionPeriodHours < 24 || retentionPeriodHours > 8760) {
        throw new ValidationError(`retentionPeriod must be between 24 and 8760 hours. Received ${retentionPeriodHours}`, this);
      }
    }

    const { streamEncryption, encryptionKey } = this.parseEncryption(props);

    this.stream = new CfnStream(this, 'Resource', {
      name: this.physicalName,
      retentionPeriodHours,
      shardCount,
      streamEncryption,
      ...(props.streamMode !== undefined
        ? {
          streamModeDetails: { streamMode: props.streamMode },
        }
        : undefined),
    });
    this.stream.applyRemovalPolicy(props.removalPolicy);

    this.streamArn = this.getResourceArnAttribute(this.stream.attrArn, {
      service: 'kinesis',
      resource: 'stream',
      resourceName: this.physicalName,
    });
    this.streamName = this.getResourceNameAttribute(this.stream.ref);

    this.encryptionKey = encryptionKey;
  }

  /**
   * Set up key properties and return the Stream encryption property from the
   * user's configuration.
   */
  private parseEncryption(props: StreamProps): {
    streamEncryption?: CfnStream.StreamEncryptionProperty | IResolvable;
    encryptionKey?: kms.IKey;
  } {
    // if encryption properties are not set, default to KMS in regions where KMS is available
    if (!props.encryption && !props.encryptionKey) {
      const conditionName = 'AwsCdkKinesisEncryptedStreamsUnsupportedRegions';
      const existing = Stack.of(this).node.tryFindChild(conditionName);

      // create a single condition for the Stack
      if (!existing) {
        new CfnCondition(Stack.of(this), conditionName, {
          expression: Fn.conditionOr(
            Fn.conditionEquals(Aws.REGION, 'cn-north-1'),
            Fn.conditionEquals(Aws.REGION, 'cn-northwest-1'),
          ),
        });
      }

      return {
        streamEncryption: Fn.conditionIf(conditionName,
          Aws.NO_VALUE,
          { EncryptionType: 'KMS', KeyId: 'alias/aws/kinesis' }),
      };
    }

    // default based on whether encryption key is specified
    const encryptionType = props.encryption ??
      (props.encryptionKey ? StreamEncryption.KMS : StreamEncryption.UNENCRYPTED);

    // if encryption key is set, encryption must be set to KMS.
    if (encryptionType !== StreamEncryption.KMS && props.encryptionKey) {
      throw new ValidationError(`encryptionKey is specified, so 'encryption' must be set to KMS (value: ${encryptionType})`, this);
    }

    if (encryptionType === StreamEncryption.UNENCRYPTED) {
      return {};
    }

    if (encryptionType === StreamEncryption.MANAGED) {
      const encryption = { encryptionType: 'KMS', keyId: 'alias/aws/kinesis' };
      return { streamEncryption: encryption };
    }

    if (encryptionType === StreamEncryption.KMS) {
      const encryptionKey = props.encryptionKey || new kms.Key(this, 'Key', {
        description: `Created by ${this.node.path}`,
      });

      const streamEncryption: CfnStream.StreamEncryptionProperty = {
        encryptionType: 'KMS',
        keyId: encryptionKey.keyArn,
      };
      return { encryptionKey, streamEncryption };
    }

    throw new ValidationError(`Unexpected 'encryptionType': ${encryptionType}`, this);
  }
}

/**
 * What kind of server-side encryption to apply to this stream
 */
export enum StreamEncryption {
  /**
   * Records in the stream are not encrypted.
   */
  UNENCRYPTED = 'NONE',

  /**
   * Server-side encryption with a KMS key managed by the user.
   * If `encryptionKey` is specified, this key will be used, otherwise, one will be defined.
   */
  KMS = 'KMS',

  /**
   * Server-side encryption with a master key managed by Amazon Kinesis
   */
  MANAGED = 'MANAGED',
}

/**
 * Specifies the capacity mode to apply to this stream.
 */
export enum StreamMode {
  /**
   * Specify the provisioned capacity mode. The stream will have `shardCount` shards unless
   * modified and will be billed according to the provisioned capacity.
   */
  PROVISIONED = 'PROVISIONED',

  /**
   * Specify the on-demand capacity mode. The stream will autoscale and be billed according to the
   * volume of data ingested and retrieved.
   */
  ON_DEMAND = 'ON_DEMAND',
}

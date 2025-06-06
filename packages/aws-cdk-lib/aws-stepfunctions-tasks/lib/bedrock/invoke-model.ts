import { Construct } from 'constructs';
import { Guardrail } from './guardrail';
import * as bedrock from '../../../aws-bedrock';
import * as iam from '../../../aws-iam';
import * as s3 from '../../../aws-s3';
import * as sfn from '../../../aws-stepfunctions';
import { Annotations, Stack, FeatureFlags, ValidationError } from '../../../core';
import * as cxapi from '../../../cx-api';
import { integrationResourceArn, validatePatternSupported } from '../private/task-utils';

/**
 * Location to retrieve the input data, prior to calling Bedrock InvokeModel.
 *
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrock.html
 */
export interface BedrockInvokeModelInputProps {

  /**
   * S3 object to retrieve the input data from.
   *
   * If the S3 location is not set, then the Body must be set.
   *
   * @default - Input data is retrieved from the `body` field
   */
  readonly s3Location?: s3.Location;

  /**
   * The source location where the API response is written.
   *
   * This field can be used to specify s3 URI in the form of token
   *
   * @default - The API response body is returned in the result.
   */
  readonly s3InputUri?: string;
}

/**
 * Location where the Bedrock InvokeModel API response is written.
 *
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrock.html
 */
export interface BedrockInvokeModelOutputProps {

  /**
   * S3 object where the Bedrock InvokeModel API response is written.
   *
   * If you specify this field, the API response body is replaced with
   * a reference to the Amazon S3 location of the original output.
   *
   * @default - Response body is returned in the task result
   */
  readonly s3Location?: s3.Location;

  /**
   * The destination location where the API response is written.
   *
   * This field can be used to specify s3 URI in the form of token
   *
   * @default - The API response body is returned in the result.
   */
  readonly s3OutputUri?: string;
}

interface BedrockInvokeModelOptions {
  /**
   * The Bedrock model that the task will invoke.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/api-methods-run.html
   */
  readonly model: bedrock.IModel;

  /**
   * The input data for the Bedrock model invocation.
   *
   * The inference parameters contained in the body depend on the Bedrock model being used.
   *
   * The body must be in the format specified in the `contentType` field.
   * For example, if the content type is `application/json`, the body must be
   * JSON formatted.
   *
   * The body must be up to 256 KB in size. For input data that exceeds 256 KB,
   * use `input` instead to retrieve the input data from S3.
   *
   * You must specify either the `body` or the `input` field, but not both.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters.html
   *
   * @default - Input data is retrieved from the location specified in the `input` field
   */
  readonly body?: sfn.TaskInput;

  /**
   * The desired MIME type of the inference body in the response.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
   * @default 'application/json'
   */
  readonly accept?: string;

  /**
   * The MIME type of the input data in the request.
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
   * @default 'application/json'
   * @deprecated This property does not require configuration because the only acceptable value is 'application/json'.
   */
  readonly contentType?: string;

  /**
   * The source location to retrieve the input data from.
   *
   * @default - Input data is retrieved from the `body` field
   */
  readonly input?: BedrockInvokeModelInputProps;

  /**
   * The destination location where the API response is written.
   *
   * If you specify this field, the API response body is replaced with a reference to the
   * output location.
   *
   * @default - The API response body is returned in the result.
   */
  readonly output?: BedrockInvokeModelOutputProps;

  /**
   * The guardrail is applied to the invocation
   *
   * @default - No guardrail is applied to the invocation.
   */
  readonly guardrail?: Guardrail;

  /**
   * Specifies whether to enable or disable the Bedrock trace.
   *
   * @default - Trace is not enabled for the invocation.
   */
  readonly traceEnabled?: boolean;
}

/**
 * Properties for invoking a Bedrock Model
 */
export interface BedrockInvokeModelJsonPathProps extends sfn.TaskStateJsonPathBaseProps, BedrockInvokeModelOptions { }

/**
 * Properties for invoking a Bedrock Model
 */
export interface BedrockInvokeModelJsonataProps extends sfn.TaskStateJsonataBaseProps, BedrockInvokeModelOptions { }

/**
 * Properties for invoking a Bedrock Model
 */
export interface BedrockInvokeModelProps extends sfn.TaskStateBaseProps, BedrockInvokeModelOptions { }

/**
 * A Step Functions Task to invoke a model in Bedrock.
 */
export class BedrockInvokeModel extends sfn.TaskStateBase {
  /**
   * A Step Functions Task using JSONPath to invoke a model in Bedrock.
   */
  public static jsonPath(scope: Construct, id: string, props: BedrockInvokeModelJsonPathProps) {
    return new BedrockInvokeModel(scope, id, props);
  }
  /**
   * A Step Functions Task using JSONata to invoke a model in Bedrock.
   */
  public static jsonata(scope: Construct, id: string, props: BedrockInvokeModelJsonataProps) {
    return new BedrockInvokeModel(scope, id, {
      ...props,
      queryLanguage: sfn.QueryLanguage.JSONATA,
    });
  }
  private static readonly SUPPORTED_INTEGRATION_PATTERNS: sfn.IntegrationPattern[] = [
    sfn.IntegrationPattern.REQUEST_RESPONSE,
  ];

  protected readonly taskMetrics: sfn.TaskMetricsConfig | undefined;
  protected readonly taskPolicies: iam.PolicyStatement[] | undefined;

  private readonly integrationPattern: sfn.IntegrationPattern;
  private readonly modelOutput?: BedrockInvokeModelOutputProps;

  constructor(scope: Construct, id: string, private readonly props: BedrockInvokeModelProps) {
    super(scope, id, props);

    this.modelOutput = props.output;
    this.integrationPattern = props.integrationPattern ?? sfn.IntegrationPattern.REQUEST_RESPONSE;

    validatePatternSupported(this.integrationPattern, BedrockInvokeModel.SUPPORTED_INTEGRATION_PATTERNS);

    const useNewS3UriParamsForTask = FeatureFlags.of(this).isEnabled(cxapi.USE_NEW_S3URI_PARAMETERS_FOR_BEDROCK_INVOKE_MODEL_TASK);

    const isBodySpecified = props.body !== undefined;

    let isInputSpecified: boolean;
    if (!useNewS3UriParamsForTask) {
      isInputSpecified = (props.input !== undefined && props.input.s3Location !== undefined) || (props.inputPath !== undefined);
    } else {
      // Either specific props.input with bucket name and object key or input s3 path
      isInputSpecified = props.input !== undefined ? props.input?.s3Location !== undefined || props.input?.s3InputUri !== undefined : false;
    }

    if (isBodySpecified && isInputSpecified) {
      throw new ValidationError('Either `body` or `input` must be specified, but not both.', this);
    }
    if (!isBodySpecified && !isInputSpecified) {
      throw new ValidationError('Either `body` or `input` must be specified.', this);
    }
    if (props.input?.s3Location?.objectVersion !== undefined) {
      throw new ValidationError('Input S3 object version is not supported.', this);
    }
    if (props.output?.s3Location?.objectVersion !== undefined) {
      throw new ValidationError('Output S3 object version is not supported.', this);
    }
    if (props.input?.s3InputUri && props.input.s3Location || props.output?.s3OutputUri && props.output.s3Location) {
      throw new ValidationError('Either specify S3 Uri or S3 location, but not both.', this);
    }
    if (useNewS3UriParamsForTask && (props.input?.s3InputUri === '' || props.output?.s3OutputUri === '')) {
      throw new ValidationError('S3 Uri cannot be an empty string', this);
    }

    // Warning to let users know about the newly introduced props
    if (props.inputPath || props.outputPath && !useNewS3UriParamsForTask) {
      Annotations.of(scope).addWarningV2('aws-cdk-lib/aws-stepfunctions-taks',
        'These props will set the value of inputPath/outputPath as s3 URI under input/output field in state machine JSON definition. To modify the behaviour set feature flag `@aws-cdk/aws-stepfunctions-tasks:useNewS3UriParametersForBedrockInvokeModelTask": true` and use props input.s3InputUri/output.s3OutputUri');
    }

    this.taskPolicies = this.renderPolicyStatements();
  }

  private renderPolicyStatements(): iam.PolicyStatement[] {
    const useNewS3UriParamsForTask = FeatureFlags.of(this).isEnabled(cxapi.USE_NEW_S3URI_PARAMETERS_FOR_BEDROCK_INVOKE_MODEL_TASK);
    const policyStatements = [
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [this.props.model.modelArn],
      }),
    ];

    // For Compatibility with existing behaviour of input path
    if (this.props.input?.s3InputUri !== undefined || (!useNewS3UriParamsForTask && this.props.inputPath !== undefined)) {
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [
            Stack.of(this).formatArn({
              region: '',
              account: '',
              service: 's3',
              resource: '*',
            }),
          ],
        }),
      );
    } else if (this.props.input !== undefined && this.props.input.s3Location !== undefined) {
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [
            Stack.of(this).formatArn({
              region: '',
              account: '',
              service: 's3',
              resource: this.props.input?.s3Location?.bucketName,
              resourceName: this.props.input?.s3Location?.objectKey,
            }),
          ],
        }),
      );
    }

    // For Compatibility with existing behaviour of output path
    if (this.modelOutput?.s3OutputUri !== undefined || (!useNewS3UriParamsForTask && this.props.outputPath !== undefined)) {
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [
            Stack.of(this).formatArn({
              region: '',
              account: '',
              service: 's3',
              resource: '*',
            }),
          ],
        }),
      );
    } else if (this.modelOutput !== undefined && this.modelOutput.s3Location !== undefined) {
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [
            Stack.of(this).formatArn({
              region: '',
              account: '',
              service: 's3',
              resource: this.modelOutput?.s3Location?.bucketName,
              resourceName: this.modelOutput?.s3Location?.objectKey,
            }),
          ],
        }),
      );
    }

    if (this.props.guardrail) {
      const isArn = this.props.guardrail.guardrailIdentifier.startsWith('arn:');
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['bedrock:ApplyGuardrail'],
          resources: [
            isArn
              ? this.props.guardrail.guardrailIdentifier
              : Stack.of(this).formatArn({
                service: 'bedrock',
                resource: 'guardrail',
                resourceName: this.props.guardrail.guardrailIdentifier,
              }),
          ],
        }),
      );
    }

    return policyStatements;
  }

  /**
   * Provides the Bedrock InvokeModel service integration task configuration
   *
   * @internal
   */
  protected _renderTask(topLevelQueryLanguage?: sfn.QueryLanguage): any {
    const queryLanguage = sfn._getActualQueryLanguage(topLevelQueryLanguage, this.props.queryLanguage);
    const useNewS3UriParamsForTask = FeatureFlags.of(this).isEnabled(cxapi.USE_NEW_S3URI_PARAMETERS_FOR_BEDROCK_INVOKE_MODEL_TASK);
    const inputSource = this.getInputSource(this.props.input, this.props.inputPath, useNewS3UriParamsForTask);
    const outputSource = this.getOutputSource(this.props.output, this.props.outputPath, useNewS3UriParamsForTask);
    return {
      Resource: integrationResourceArn('bedrock', 'invokeModel'),
      ...this._renderParametersOrArguments({
        ModelId: this.props.model.modelArn,
        Accept: this.props.accept,
        ContentType: this.props.contentType,
        Body: this.props.body?.value,
        Input: inputSource ? { S3Uri: inputSource } : undefined,
        Output: outputSource ? { S3Uri: outputSource } : undefined,
        GuardrailIdentifier: this.props.guardrail?.guardrailIdentifier,
        GuardrailVersion: this.props.guardrail?.guardrailVersion,
        Trace: this.props.traceEnabled === undefined
          ? undefined
          : this.props.traceEnabled
            ? 'ENABLED'
            : 'DISABLED',
      }, queryLanguage),
    };
  }

  private getInputSource(props?: BedrockInvokeModelInputProps, inputPath?: string, useNewS3UriParamsForTask?: boolean): string | undefined {
    if (props?.s3Location) {
      return `s3://${props.s3Location.bucketName}/${props.s3Location.objectKey}`;
    } else if (useNewS3UriParamsForTask && props?.s3InputUri) {
      return props.s3InputUri;
    } else if (!useNewS3UriParamsForTask && inputPath) {
      return inputPath;
    }
    return undefined;
  }

  private getOutputSource(props?: BedrockInvokeModelOutputProps, outputPath?: string, useNewS3UriParamsForTask?: boolean): string | undefined {
    if (props?.s3Location) {
      return `s3://${props.s3Location.bucketName}/${props.s3Location.objectKey}`;
    } else if (useNewS3UriParamsForTask && props?.s3OutputUri) {
      return props.s3OutputUri;
    } else if (!useNewS3UriParamsForTask && outputPath) {
      return outputPath;
    }
    return undefined;
  }
}


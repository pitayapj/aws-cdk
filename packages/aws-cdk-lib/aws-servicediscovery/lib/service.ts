import { Construct } from 'constructs';
import { AliasTargetInstance } from './alias-target-instance';
import { CnameInstance, CnameInstanceBaseProps } from './cname-instance';
import { IInstance } from './instance';
import { IpInstance, IpInstanceBaseProps } from './ip-instance';
import { INamespace, NamespaceType } from './namespace';
import { NonIpInstance, NonIpInstanceBaseProps } from './non-ip-instance';
import { defaultDiscoveryType } from './private/utils';
import { CfnService } from './servicediscovery.generated';
import * as elbv2 from '../../aws-elasticloadbalancingv2';
import { Duration, IResource, Resource, ValidationError } from '../../core';
import { addConstructMetadata, MethodMetadata } from '../../core/lib/metadata-resource';

export interface IService extends IResource {
  /**
   * A name for the Cloudmap Service.
   * @attribute
   */
  readonly serviceName: string;

  /**
   *  The namespace for the Cloudmap Service.
   */
  readonly namespace: INamespace;

  /**
   * The ID of the namespace that you want to use for DNS configuration.
   * @attribute
   */
  readonly serviceId: string;

  /**
   * The Arn of the namespace that you want to use for DNS configuration.
   * @attribute
   */
  readonly serviceArn: string;

  /**
   * The DnsRecordType used by the service
   */
  readonly dnsRecordType: DnsRecordType;

  /**
   * The Routing Policy used by the service
   */
  readonly routingPolicy: RoutingPolicy;

  /**
   * The discovery type used by the service
   */
  readonly discoveryType: DiscoveryType;
}

/**
 * Basic props needed to create a service in a given namespace. Used by HttpNamespace.createService
 */
export interface BaseServiceProps {
  /**
   * A name for the Service.
   *
   * @default CloudFormation-generated name
   */
  readonly name?: string;

  /**
   * A description of the service.
   *
   * @default none
   */
  readonly description?: string;

  /**
   * Settings for an optional health check.  If you specify health check settings, AWS Cloud Map associates the health
   * check with the records that you specify in DnsConfig. Only one of healthCheckConfig or healthCheckCustomConfig can
   * be specified. Not valid for PrivateDnsNamespaces. If you use healthCheck, you can only register IP instances to
   * this service.
   *
   * @default none
   */
  readonly healthCheck?: HealthCheckConfig;

  /**
   * Structure containing failure threshold for a custom health checker.
   * Only one of healthCheckConfig or healthCheckCustomConfig can be specified.
   * See: https://docs.aws.amazon.com/cloud-map/latest/api/API_HealthCheckCustomConfig.html
   *
   * @default none
   */
  readonly customHealthCheck?: HealthCheckCustomConfig;
}

/**
 * Service props needed to create a service in a given namespace. Used by createService() for PrivateDnsNamespace and
 * PublicDnsNamespace
 */
export interface DnsServiceProps extends BaseServiceProps {
  /**
   * Controls how instances within this service can be discovered
   *
   * @default DNS_AND_API
   */
  readonly discoveryType?: DiscoveryType;

  /**
   * The DNS type of the record that you want AWS Cloud Map to create. Supported record types
   * include A, AAAA, A and AAAA (A_AAAA), CNAME, and SRV.
   *
   * @default A
   */
  readonly dnsRecordType?: DnsRecordType;

  /**
   * The amount of time, in seconds, that you want DNS resolvers to cache the settings for this
   * record.
   *
   * @default Duration.minutes(1)
   */
  readonly dnsTtl?: Duration;

  /**
   * The routing policy that you want to apply to all DNS records that AWS Cloud Map creates when you
   * register an instance and specify this service.
   *
   * @default WEIGHTED for CNAME records and when loadBalancer is true, MULTIVALUE otherwise
   */
  readonly routingPolicy?: RoutingPolicy;

  /**
   * Whether or not this service will have an Elastic LoadBalancer registered to it as an AliasTargetInstance.
   *
   * Setting this to `true` correctly configures the `routingPolicy`
   * and performs some additional validation.
   *
   * @default false
   */
  readonly loadBalancer?: boolean;
}

export interface ServiceProps extends DnsServiceProps {
  /**
   * The namespace that you want to use for DNS configuration.
   */
  readonly namespace: INamespace;
}

abstract class ServiceBase extends Resource implements IService {
  public abstract namespace: INamespace;
  public abstract serviceId: string;
  public abstract serviceArn: string;
  public abstract dnsRecordType: DnsRecordType;
  public abstract routingPolicy: RoutingPolicy;
  public abstract readonly serviceName: string;
  public abstract discoveryType: DiscoveryType;
}

export interface ServiceAttributes {
  readonly namespace: INamespace;
  readonly serviceName: string;
  readonly serviceId: string;
  readonly serviceArn: string;
  readonly dnsRecordType: DnsRecordType;
  readonly routingPolicy: RoutingPolicy;
  readonly discoveryType?: DiscoveryType;
}

/**
 * Define a CloudMap Service
 */
export class Service extends ServiceBase {
  public static fromServiceAttributes(scope: Construct, id: string, attrs: ServiceAttributes): IService {
    class Import extends ServiceBase {
      public namespace: INamespace = attrs.namespace;
      public serviceId = attrs.serviceId;
      public serviceArn = attrs.serviceArn;
      public dnsRecordType = attrs.dnsRecordType;
      public routingPolicy = attrs.routingPolicy;
      public serviceName = attrs.serviceName;
      public discoveryType = attrs.discoveryType || defaultDiscoveryType(attrs.namespace);
    }

    return new Import(scope, id);
  }

  /**
   * A name for the Cloudmap Service.
   */
  public readonly serviceName: string;

  /**
   *  The namespace for the Cloudmap Service.
   */
  public readonly namespace: INamespace;

  /**
   * The ID of the namespace that you want to use for DNS configuration.
   */
  public readonly serviceId: string;

  /**
   * The Arn of the namespace that you want to use for DNS configuration.
   */
  public readonly serviceArn: string;

  /**
   * The DnsRecordType used by the service
   */
  public readonly dnsRecordType: DnsRecordType;

  /**
   * The Routing Policy used by the service
   */
  public readonly routingPolicy: RoutingPolicy;

  /**
   * The discovery type used by this service.
   */
  public readonly discoveryType: DiscoveryType;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const namespaceType = props.namespace.type;
    const discoveryType = props.discoveryType || defaultDiscoveryType(props.namespace);

    if (namespaceType == NamespaceType.HTTP && discoveryType == DiscoveryType.DNS_AND_API) {
      throw new ValidationError(
        'Cannot specify `discoveryType` of DNS_AND_API when using an HTTP namespace.', this,
      );
    }

    // Validations
    if (
      discoveryType === DiscoveryType.API &&
      (props.routingPolicy || props.dnsRecordType)
    ) {
      throw new ValidationError(
        'Cannot specify `routingPolicy` or `dnsRecord` when using an HTTP namespace.', this,
      );
    }

    if (props.healthCheck && props.customHealthCheck) {
      throw new ValidationError('Cannot specify both `healthCheckConfig` and `healthCheckCustomConfig`.', this);
    }

    if (namespaceType === NamespaceType.DNS_PRIVATE && props.healthCheck) {
      throw new ValidationError('Cannot specify `healthCheckConfig` for a Private DNS namespace.', this);
    }

    if (props.routingPolicy === RoutingPolicy.MULTIVALUE
        && props.dnsRecordType === DnsRecordType.CNAME) {
      throw new ValidationError('Cannot use `CNAME` record when routing policy is `Multivalue`.', this);
    }

    // Additional validation for eventual attachment of LBs
    // The same validation happens later on during the actual attachment
    // of LBs, but we need the property for the correct configuration of
    // routingPolicy anyway, so might as well do the validation as well.
    if (props.routingPolicy === RoutingPolicy.MULTIVALUE
        && props.loadBalancer) {
      throw new ValidationError('Cannot register loadbalancers when routing policy is `Multivalue`.', this);
    }

    if (props.healthCheck
        && props.healthCheck.type === HealthCheckType.TCP
        && props.healthCheck.resourcePath) {
      throw new ValidationError('Cannot specify `resourcePath` when using a `TCP` health check.', this);
    }

    // Set defaults where necessary
    const routingPolicy = (props.dnsRecordType === DnsRecordType.CNAME) || props.loadBalancer
      ? RoutingPolicy.WEIGHTED
      : RoutingPolicy.MULTIVALUE;

    const dnsRecordType = props.dnsRecordType || DnsRecordType.A;

    if (props.loadBalancer
      && (!(dnsRecordType === DnsRecordType.A
        || dnsRecordType === DnsRecordType.AAAA
        || dnsRecordType === DnsRecordType.A_AAAA))) {
      throw new ValidationError('Must support `A` or `AAAA` records to register loadbalancers.', this);
    }

    const dnsConfig: CfnService.DnsConfigProperty | undefined =
      discoveryType === DiscoveryType.API
        ? undefined
        : {
          dnsRecords: renderDnsRecords(dnsRecordType, props.dnsTtl),
          namespaceId: props.namespace.namespaceId,
          routingPolicy,
        };

    const healthCheckConfigDefaults = {
      type: HealthCheckType.HTTP,
      failureThreshold: 1,
      resourcePath: props.healthCheck && props.healthCheck.type !== HealthCheckType.TCP
        ? '/'
        : undefined,
    };

    const healthCheckConfig = props.healthCheck && { ...healthCheckConfigDefaults, ...props.healthCheck };
    const healthCheckCustomConfig = props.customHealthCheck;

    // Create service
    const service = new CfnService(this, 'Resource', {
      name: props.name,
      description: props.description,
      dnsConfig,
      healthCheckConfig,
      healthCheckCustomConfig,
      namespaceId: props.namespace.namespaceId,
      type: props.discoveryType == DiscoveryType.API ? 'HTTP' : undefined,
    });

    this.serviceName = service.attrName;
    this.serviceArn = service.attrArn;
    this.serviceId = service.attrId;
    this.namespace = props.namespace;
    this.dnsRecordType = dnsRecordType;
    this.routingPolicy = routingPolicy;
    this.discoveryType = discoveryType;
  }

  /**
   * Registers an ELB as a new instance with unique name instanceId in this service.
   */
  @MethodMetadata()
  public registerLoadBalancer(id: string, loadBalancer: elbv2.ILoadBalancerV2, customAttributes?: { [key: string]: string }): IInstance {
    return new AliasTargetInstance(this, id, {
      service: this,
      dnsName: loadBalancer.loadBalancerDnsName,
      customAttributes,
    });
  }

  /**
   * Registers a resource that is accessible using values other than an IP address or a domain name (CNAME).
   */
  @MethodMetadata()
  public registerNonIpInstance(id: string, props: NonIpInstanceBaseProps): IInstance {
    return new NonIpInstance(this, id, {
      service: this,
      ...props,
    });
  }

  /**
   * Registers a resource that is accessible using an IP address.
   */
  @MethodMetadata()
  public registerIpInstance(id: string, props: IpInstanceBaseProps): IInstance {
    return new IpInstance(this, id, {
      service: this,
      ...props,
    });
  }

  /**
   * Registers a resource that is accessible using a CNAME.
   */
  @MethodMetadata()
  public registerCnameInstance(id: string, props: CnameInstanceBaseProps): IInstance {
    return new CnameInstance(this, id, {
      service: this,
      ...props,
    });
  }
}

function renderDnsRecords(dnsRecordType: DnsRecordType, dnsTtl: Duration = Duration.minutes(1)): CfnService.DnsRecordProperty[] {
  const ttl = dnsTtl.toSeconds();

  if (dnsRecordType === DnsRecordType.A_AAAA) {
    return [{
      type: DnsRecordType.A,
      ttl,
    }, {
      type: DnsRecordType.AAAA,
      ttl,
    }];
  } else {
    return [{ type: dnsRecordType, ttl }];
  }
}

/**
 * Settings for an optional Amazon Route 53 health check. If you specify settings for a health check, AWS Cloud Map
 * associates the health check with all the records that you specify in DnsConfig. Only valid with a PublicDnsNamespace.
 */
export interface HealthCheckConfig {
  /**
   * The type of health check that you want to create, which indicates how Route 53 determines whether an endpoint is
   * healthy. Cannot be modified once created. Supported values are HTTP, HTTPS, and TCP.
   *
   * @default HTTP
   */
  readonly type?: HealthCheckType;

  /**
   * The path that you want Route 53 to request when performing health checks. Do not use when health check type is TCP.
   *
   * @default '/'
   */
  readonly resourcePath?: string;

  /**
   * The number of consecutive health checks that an endpoint must pass or fail for Route 53 to change the current
   * status of the endpoint from unhealthy to healthy or vice versa.
   *
   * @default 1
   */
  readonly failureThreshold?: number;
}

/**
 * Specifies information about an optional custom health check.
 */
export interface HealthCheckCustomConfig {
  /**
   * The number of 30-second intervals that you want Cloud Map to wait after receiving an
   * UpdateInstanceCustomHealthStatus request before it changes the health status of a service instance.
   *
   * @default 1
   */
  readonly failureThreshold?: number;
}

/**
 * Specifies information about the discovery type of a service
 */
export enum DiscoveryType {
  /**
   * Instances are discoverable via API only
   */
  API = 'API',
  /**
   * Instances are discoverable via DNS or API
   */
  DNS_AND_API = 'DNS_AND_API',
}

export enum DnsRecordType {
  /**
   * An A record
   */
  A = 'A',

  /**
   * An AAAA record
   */
  AAAA = 'AAAA',

  /**
   * Both an A and AAAA record
   */
  A_AAAA = 'A, AAAA',

  /**
   * A Srv record
   */
  SRV = 'SRV',

  /**
   * A CNAME record
   */
  CNAME = 'CNAME',
}

export enum RoutingPolicy {
  /**
   * Route 53 returns the applicable value from one randomly selected instance from among the instances that you
   * registered using the same service.
   */
  WEIGHTED = 'WEIGHTED',

  /**
   * If you define a health check for the service and the health check is healthy, Route 53 returns the applicable value
   * for up to eight instances.
   */
  MULTIVALUE = 'MULTIVALUE',
}

export enum HealthCheckType {
  /**
   * Route 53 tries to establish a TCP connection. If successful, Route 53 submits an HTTP request and waits for an HTTP
   * status code of 200 or greater and less than 400.
   */
  HTTP = 'HTTP',

  /**
   * Route 53 tries to establish a TCP connection. If successful, Route 53 submits an HTTPS request and waits for an
   * HTTP status code of 200 or greater and less than 400.  If you specify HTTPS for the value of Type, the endpoint
   * must support TLS v1.0 or later.
   */
  HTTPS = 'HTTPS',

  /**
   * Route 53 tries to establish a TCP connection.
   * If you specify TCP for Type, don't specify a value for ResourcePath.
   */
  TCP = 'TCP',
}

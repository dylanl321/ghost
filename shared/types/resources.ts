export interface ResourceCounts {
  ec2?: {
    total: number;
    stopped?: number;
    windows?: number;
  };
  volumes?: {
    total: number;
    totalSizeGB: number;
    gp2?: number;
    gp3?: number;
    io1?: number;
  };
  ecsContainers?: {
    total: number;
  };
  eksClusters?: {
    total: number;
  };
  buckets?: {
    total: number;
    versioned?: number;
  };
}
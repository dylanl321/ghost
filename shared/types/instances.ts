export interface InstanceSummary {
  totalInstances: number;
  byState: {
    [state: string]: number;
  };
  byType: {
    [type: string]: number;
  };
  byScheduling: {
    scheduled: number;
    unscheduled: number;
  };
  byManagement: {
    gdmsManaged: number;
    notManaged: number;
    unknown: number;
  };
  byEnvironment: {
    unknown: number;
  };
  byAccount: {
    [accountId: string]: number;
  };
};

export interface Instance {
  instanceType: string
  instanceState: string
  schedulingInfo: SchedulingInfo
}

interface SchedulingInfo {
  hasSchedule: boolean
}

export function getNodeId(voipCluster: string): number {
  switch (voipCluster) {
    case 'voip-srv':
      return 1;
    case 'voip2-srv':
      return 2;
    case 'voip3-srv':
      return 3;
    case 'voip4-srv':
      return 4;
    case 'voip5-srv':
      return 5;
    case 'voip6-srv':
      return 6;
    default:
      return 0;
  }
}

export function getVoipClusterName(nodeId: number): string {
  switch (nodeId) {
    case 1:
      return 'voip-srv';
    case 2:
      return 'voip2-srv';
    case 3:
      return 'voip3-srv';
    case 4:
      return 'voip4-srv';
    case 5:
      return 'voip5-srv';
    case 6:
      return 'voip6-srv';
    default:
      return '';
  }
}

export default { getNodeId, getVoipClusterName };

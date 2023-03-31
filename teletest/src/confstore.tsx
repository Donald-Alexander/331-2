import { WebConference } from 'telephony/src/webconference/conferenceTypes';

const confMap: Map<number, WebConference> = new Map();
let nextConfKey = 1;
let activeConf = 0;

function setActiveConf(confKey: number) {
  activeConf = confKey;
}

function getActiveConf() {
  return activeConf;
}

function getCurrent() {
  return confMap.get(activeConf);
}

function getConfList() {
  return Array.from(confMap);
}

function addConf(conf: WebConference) {
  const confKey = nextConfKey;
  nextConfKey += 1;

  confMap.set(confKey, conf);

  if (confMap.size === 1) {
    activeConf = confKey;
  }
}

function removeConf(confId: number) {
  for (let [idx, conf] of confMap) {
    if (conf.confId === confId) {
      confMap.delete(idx);
      break;
    }
  }

  if (confMap.size === 1) {
    activeConf = confMap.keys().next().value;
  } else if (confMap.size === 0) {
    activeConf = 0;
  }
}

function findConf(confId: number) {
  for (const conf of confMap.values()) {
    if (conf.confId === confId) {
      return conf;
    }
  }
}

export const ConfStore = {
  setActiveConf,
  getActiveConf,
  getCurrent,
  getConfList,
  addConf,
  removeConf,
  findConf,
};

export default ConfStore;

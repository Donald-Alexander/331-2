import { ConfCreated, ConfEnded, WebConference } from './conferenceTypes';

const activeConferences: WebConference[] = [];

export class ActiveConferences {
  static add(conf: WebConference) {
    if (!activeConferences.find((c) => c.confId === conf.confId)) {
      activeConferences.push(conf);
      conf.report(new ConfCreated(conf));
    }
  }

  static remove(conf: WebConference) {
    const indx = activeConferences.findIndex((c) => c.confId === conf.confId);

    if (indx >= 0) {
      activeConferences.splice(indx, 1);
      conf.report(new ConfEnded(conf));
    }
  }

  static get(): Array<WebConference> {
    return activeConferences;
  }

  static find = activeConferences.find.bind(activeConferences);
}

export default ActiveConferences;

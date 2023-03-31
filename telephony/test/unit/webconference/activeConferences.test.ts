/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable class-methods-use-this */
import {
  ConfCreated,
  ConfEnded,
  ConferenceConsultType,
  ConferenceMember,
  ConferenceState,
  DialingPrefix,
  Participant,
  WebConference,
} from '@src/telephonyexternalinterfacedef';
import WebCall from '@src/webcall/webcall';
import ActiveConferences from '@src/webconference/activeConferences';
import ConfInfo from '@src/webconference/confinfo';

jest.mock('@src/weblinedev/listenJoin', () => {
  return jest.fn(() => {});
});
jest.mock('@src/config/webcfg');

class MockWebConference implements WebConference {
  confId: number = 1;
  state: ConferenceState = ConferenceState.Connected;
  members: ConferenceMember[] = [];
  ownerDevice: string = '';
  consultCall: WebCall | null = null;
  systemConfId: string;
  participantsMap: Map<string, Participant>;
  eventTarget: EventTarget;

  constructor(confId?: number) {
    this.confId = confId || 1;
    this.systemConfId = '';
    this.participantsMap = new Map();
    this.eventTarget = new EventTarget();
  }

  cancel(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  connect(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  drop(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  hold(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  unhold(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  inviteCall(destAddr: string, prefix: DialingPrefix | null, consultType: ConferenceConsultType): Promise<WebCall> {
    throw new Error('Method not implemented.');
  }
  patchCall(otherCall: WebCall): Promise<void> {
    throw new Error('Method not implemented.');
  }
  report(evt: Event): void {}
  transfer(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  callStateUpdate(call: WebCall): void {
    throw new Error('Method not implemented.');
  }
  updateParticipantsMap(confInfo: ConfInfo): Promise<Boolean> {
    throw new Error('Method not implemented.');
  }
}

describe('ActiveConferences tests', () => {
  test('get()', () => {
    const activeConfs = ActiveConferences.get();
    const activeConfs2 = ActiveConferences.get();

    expect(Array.isArray(activeConfs)).toBe(true);
    expect(activeConfs2).toEqual(activeConfs);
  });

  test('add()', () => {
    const conf1 = new MockWebConference(1);
    const conf2 = new MockWebConference(2);
    const conf2a = new MockWebConference(2);

    ActiveConferences.add(conf1);
    ActiveConferences.add(conf2);
    ActiveConferences.add(conf2a);

    expect(ActiveConferences.get()).toEqual([conf1, conf2]);

    const conf3 = new MockWebConference(3);
    const mockReport = jest.fn();
    conf3.report = mockReport.bind(conf3);

    ActiveConferences.add(conf3);
    expect(mockReport.mock.calls.length).toBe(1);
    expect(mockReport.mock.calls[0][0]).toBeInstanceOf(ConfCreated);
    expect((mockReport.mock.calls[0][0] as ConfCreated).conf).toEqual(conf3);
  });

  test('remove()', () => {
    const conf1 = new MockWebConference(1);
    const conf2 = new MockWebConference(2);
    const conf3 = new MockWebConference(3);
    const conf4 = new MockWebConference(4);
    const conf5 = new MockWebConference(5);

    ActiveConferences.add(conf1);
    ActiveConferences.add(conf2);
    ActiveConferences.add(conf3);
    ActiveConferences.add(conf4);
    ActiveConferences.add(conf5);

    ActiveConferences.remove(conf1);
    ActiveConferences.remove(conf3);
    ActiveConferences.remove(conf5);

    expect(ActiveConferences.get()).toEqual([conf2, conf4]);

    const mockReport = jest.fn();
    conf4.report = mockReport.bind(conf4);

    ActiveConferences.remove(conf4);
    expect(mockReport.mock.calls.length).toBe(1);
    expect(mockReport.mock.calls[0][0]).toBeInstanceOf(ConfEnded);
    expect((mockReport.mock.calls[0][0] as ConfEnded).conf).toEqual(conf4);
  });

  test('find()', () => {
    const conf1 = new MockWebConference(1);
    const conf2 = new MockWebConference(2);
    const conf3 = new MockWebConference(3);
    const conf4 = new MockWebConference(4);
    const conf5 = new MockWebConference(5);

    ActiveConferences.add(conf1);
    ActiveConferences.add(conf2);
    ActiveConferences.add(conf3);
    ActiveConferences.add(conf4);
    ActiveConferences.add(conf5);

    const found = ActiveConferences.find((c) => c.confId === 2);
    expect(found).toEqual(conf2);
  });
});

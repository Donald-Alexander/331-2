import {
  AcdLoginState,
  AcdLoginStatus,
  AcdMemberType,
  AcdOpStatus,
  AcdQueueMembership,
  consolidateAcdLoginOpStatus,
  consolidateAcdLoginState,
  packAcdQlist,
  unpackAcdQlist,
  SkillsetForceConnectType,
} from '@src/weblinedev/loginState/acdLoginState';

describe('acdLoginState tests', () => {
  describe('qlist packing', () => {
    test('packs empty acd queue list', () => {
      const qlist: AcdQueueMembership[] = [];
      const packed = packAcdQlist(qlist);
      expect(packed).toEqual([]);
    });

    test('packs acd queue list', () => {
      const qlist: AcdQueueMembership[] = [
        {
          queue: '6001',
          type: AcdMemberType.Static,
          penalty: 7,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
        {
          queue: '6002',
          type: AcdMemberType.Dynamic,
          penalty: 8,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
        {
          queue: '6003',
          type: AcdMemberType.DynamicOn,
          penalty: 9,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
      ];
      const packed = packAcdQlist(qlist);
      expect(packed).toEqual([
        { q: '6001', t: '0', p: '7', f: '2' },
        { q: '6002', t: '1', p: '8', f: '2' },
        { q: '6003', t: '2', p: '9', f: '2' },
      ]);
    });

    test('packs acd queue list with bad priority', () => {
      const qlist: AcdQueueMembership[] = [
        {
          queue: '6001',
          type: AcdMemberType.Static,
          penalty: 0,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
        {
          queue: '6002',
          type: AcdMemberType.Dynamic,
          penalty: -5,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
        { queue: '6003', type: AcdMemberType.DynamicOn, penalty: 4.6, skillsetFC: SkillsetForceConnectType.Off },
        { queue: '6004', type: AcdMemberType.Static, penalty: 10, skillsetFC: SkillsetForceConnectType.On },
        {
          queue: '6005',
          type: AcdMemberType.Dynamic,
          penalty: 15,
          skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
        },
      ];
      const packed = packAcdQlist(qlist);
      expect(packed).toEqual([
        { q: '6001', t: '0', p: '1', f: 2 },
        { q: '6002', t: '1', p: '1', f: 2 },
        { q: '6003', t: '2', p: '5', f: 0 },
        { q: '6004', t: '0', p: '9', f: 1 },
        { q: '6005', t: '1', p: '9', f: 2 },
      ]);
    });
  });

  describe('qlist unpacking', () => {
    test('unpacks empty array', () => {
      const packed: [] = [];
      const unpacked = unpackAcdQlist(packed);
      expect(unpacked).toEqual([]);
    });

    test('unpacks qlist', () => {
      const packed = [
        { q: '6001', t: '0', p: '7', f: '2' },
        { q: '6002', t: '1', p: '8', f: '0' },
        { q: '6003', t: '2', p: '9', f: '1' },
      ];

      const unpacked = unpackAcdQlist(packed);
      expect(unpacked).toEqual([
        {
          queue: '6001',
          type: AcdMemberType.Static,
          penalty: 7,
          skillsetForceConnect: SkillsetForceConnectType.UseAgentQueueSettings,
        },
        { queue: '6002', type: AcdMemberType.Dynamic, penalty: 8, skillsetForceConnect: SkillsetForceConnectType.Off },
        { queue: '6003', type: AcdMemberType.DynamicOn, penalty: 9, skillsetForceConnect: SkillsetForceConnectType.On },
      ]);
    });
  });

  describe('acd state consolidation', () => {
    test('default state', () => {
      const states: AcdLoginState[] = [];
      const state = consolidateAcdLoginState(states);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoginUnknown,
        ready: false,
        qlist: [],
      });
    });

    test('prefers logged in and ready state', () => {
      let state = consolidateAcdLoginState([
        { loginStatus: AcdLoginStatus.LoginUnknown, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: true, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedOut, ready: true, qlist: [] },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: true,
        qlist: [],
      });

      state = consolidateAcdLoginState([
        { loginStatus: AcdLoginStatus.LoggedOut, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: true, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: false, qlist: [] },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: true,
        qlist: [],
      });
    });

    test('prefers LoggedIn not ready over LoggedOut', () => {
      let state = consolidateAcdLoginState([
        { loginStatus: AcdLoginStatus.LoginUnknown, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedOut, ready: true, qlist: [] },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: false,
        qlist: [],
      });

      state = consolidateAcdLoginState([
        { loginStatus: AcdLoginStatus.LoggedOut, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedIn, ready: true, qlist: [] },
        { loginStatus: AcdLoginStatus.LoggedOut, ready: false, qlist: [] },
        { loginStatus: AcdLoginStatus.LoginUnknown, ready: false, qlist: [] },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: true,
        qlist: [],
      });
    });

    test('merges qlists of logged in states', () => {
      let state = consolidateAcdLoginState([
        {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: false,
          qlist: [{ queue: '6001', type: AcdMemberType.Static, penalty: 1, skillsetFC: SkillsetForceConnectType.Off }],
        },
        {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: false,
          qlist: [{ queue: '6002', type: AcdMemberType.Dynamic, penalty: 2, skillsetFC: SkillsetForceConnectType.Off }],
        },
        {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: false,
          qlist: [
            { queue: '6003', type: AcdMemberType.DynamicOn, penalty: 3, skillsetFC: SkillsetForceConnectType.On },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: true,
          qlist: [{ queue: '6004', type: AcdMemberType.Static, penalty: 4, skillsetFC: SkillsetForceConnectType.Off }],
        },
        {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: true,
          qlist: [
            {
              queue: '6005',
              type: AcdMemberType.Dynamic,
              penalty: 5,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: true,
          qlist: [
            {
              queue: '6006',
              type: AcdMemberType.DynamicOn,
              penalty: 6,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: true,
        qlist: [
          {
            queue: '6003',
            type: AcdMemberType.DynamicOn,
            penalty: 3,
            skillsetForceConnect: SkillsetForceConnectType.On,
          },
          {
            queue: '6005',
            type: AcdMemberType.Dynamic,
            penalty: 5,
            skillsetForceConnect: SkillsetForceConnectType.UseAgentQueueSettings,
          },
        ],
      });

      state = consolidateAcdLoginState([
        {
          loginStatus: AcdLoginStatus.LoginUnknown,
          ready: true,
          qlist: [
            {
              queue: '6010',
              type: AcdMemberType.DynamicOn,
              penalty: 4,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6011',
              type: AcdMemberType.DynamicOn,
              penalty: 4,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoggedOut,
          ready: true,
          qlist: [
            {
              queue: '6020',
              type: AcdMemberType.DynamicOn,
              penalty: 5,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6021',
              type: AcdMemberType.DynamicOn,
              penalty: 5,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: false,
          qlist: [
            {
              queue: '6001',
              type: AcdMemberType.Static,
              penalty: 1,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6002',
              type: AcdMemberType.Dynamic,
              penalty: 1,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: false,
          qlist: [
            {
              queue: '6002',
              type: AcdMemberType.Dynamic,
              penalty: 2,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6003',
              type: AcdMemberType.Static,
              penalty: 2,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
        {
          loginStatus: AcdLoginStatus.LoggedIn,
          ready: true,
          qlist: [
            {
              queue: '6001',
              type: AcdMemberType.DynamicOn,
              penalty: 3,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6002',
              type: AcdMemberType.DynamicOn,
              penalty: 3,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
            {
              queue: '6004',
              type: AcdMemberType.DynamicOn,
              penalty: 3,
              skillsetFC: SkillsetForceConnectType.UseAgentQueueSettings,
            },
          ],
        },
      ]);

      expect(state).toEqual({
        loginStatus: AcdLoginStatus.LoggedIn,
        ready: true,
        qlist: [
          { queue: '6001', type: AcdMemberType.Static, penalty: 1 },
          { queue: '6002', type: AcdMemberType.Dynamic, penalty: 1 },
          { queue: '6003', type: AcdMemberType.Static, penalty: 2 },
          { queue: '6004', type: AcdMemberType.DynamicOn, penalty: 3 },
        ],
      });
    });
  });

  describe('acd Op Status consolidation', () => {
    test('default status is Error', () => {
      const statusArr: AcdOpStatus[] = [];
      const status = consolidateAcdLoginOpStatus(statusArr);

      expect(status).toEqual(AcdOpStatus.Error);
    });
    test('Ok status is preferred', () => {
      const statusArr: AcdOpStatus[] = [
        AcdOpStatus.AgentBusy,
        AcdOpStatus.AgentNotInQueue,
        AcdOpStatus.DeviceBusy,
        AcdOpStatus.Error,
        AcdOpStatus.NoAgentId,
        AcdOpStatus.NoQueue,
        AcdOpStatus.NotExist,
        AcdOpStatus.Ok,
        AcdOpStatus.UnknownQueue,
      ];
      const status = consolidateAcdLoginOpStatus(statusArr);

      expect(status).toEqual(AcdOpStatus.Ok);
    });

    test('Error status is least preferred', () => {
      const statusArr: AcdOpStatus[] = [
        AcdOpStatus.Error,
        AcdOpStatus.Error,
        AcdOpStatus.DeviceBusy,
        AcdOpStatus.Error,
        AcdOpStatus.NoAgentId,
        AcdOpStatus.NoQueue,
        AcdOpStatus.NotExist,
        AcdOpStatus.Error,
        AcdOpStatus.UnknownQueue,
      ];
      const status = consolidateAcdLoginOpStatus(statusArr);

      expect(status).toEqual(AcdOpStatus.DeviceBusy);
    });
  });
});
